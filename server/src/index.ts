import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import snowflake from "snowflake-sdk";
import multer from "multer";
import exifr from "exifr";
import sharp from "sharp";
import { parseBuffer } from "music-metadata";

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

// -------------------------
// Upload config
// -------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

// -------------------------
// Snowflake connection
// -------------------------
const DB = process.env.SNOWFLAKE_DATABASE ?? "DATA_LAKE_DB";
const conn = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  username: process.env.SNOWFLAKE_USER!,
  password: process.env.SNOWFLAKE_PASSWORD!,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE ?? "WH_XS",
  database: DB,
  schema: process.env.SNOWFLAKE_SCHEMA ?? "RAW",
  role: process.env.SNOWFLAKE_ROLE,
});

function execSql(sqlText: string, binds: any[] = []) {
  return new Promise<any[]>((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => (err ? reject(err) : resolve(rows as any[])),
    });
  });
}

conn.connect((err) => {
  if (err) console.error("Snowflake connect failed:", err.message);
  else console.log("Snowflake connected");
});

// -------------------------
// Helpers: detect file kind
// -------------------------
type FileKind = "TEXT" | "IMAGE" | "AUDIO" | "UNKNOWN";

function detectKind(contentType: string, filename: string): FileKind {
  const f = filename.toLowerCase();
  const ct = (contentType || "").toLowerCase();

  if (ct.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/.test(f)) return "IMAGE";
  if (ct.startsWith("audio/") || /\.(mp3|wav|m4a|aac|flac|ogg)$/.test(f)) return "AUDIO";
  if (ct.startsWith("text/") || /\.(txt|log|md|csv|eml)$/.test(f)) return "TEXT";
  return "UNKNOWN";
}

function looksLikeLog(text: string): boolean {
  return text
    .split(/\r?\n/)
    .slice(0, 20)
    .some((l) => /\b(INFO|WARN|ERROR|DEBUG)\b/i.test(l) && /\d{4}-\d{2}-\d{2}/.test(l));
}

// -------------------------
// Image metrics
// -------------------------
async function computeMetrics(buf: Buffer) {
  const img = sharp(buf);
  const meta = await img.metadata();

  const gray = img.clone().greyscale();
  const stats = await gray.stats();
  const mean = stats.channels[0]?.mean ?? 0; // 0..255
  const stdev = stats.channels[0]?.stdev ?? 0;

  return {
    width: meta.width ?? null,
    height: meta.height ?? null,
    brightness: +(mean / 255).toFixed(4), // 0..1
    sharpness: +stdev.toFixed(2), // proxy
  };
}

// -------------------------
// Free-text -> structured events
// -------------------------
type ParsedEvent = {
  event_ts: string | null; // "YYYY-MM-DD HH:MM"
  person: string | null;
  city: string | null;
  amount: number | null;
  category: string | null;
  notes: string | null;
  parse_ok: boolean;
  source_line: string;
};

const CITY_WORDS = ["Vilnius", "Kaunas", "Klaipėda", "Šiauliai", "Panevėžys"];

function extractTimestamp(text: string): string | null {
  const m = text.match(/\b(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\b/);
  return m ? `${m[1]} ${m[2]}` : null;
}

function extractAmount(text: string): number | null {
  const m = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(€|eur|euro)\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function extractCity(text: string): string | null {
  return CITY_WORDS.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text)) ?? null;
}

function extractPerson(text: string): string | null {
  const m = text.match(
    /\b([A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]+)\s+([A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]+)\b/
  );
  return m ? `${m[1]} ${m[2]}` : null;
}

function extractCategory(text: string): string | null {
  const explicit = text.match(/\bcategory\s*=\s*([^|,]+)\b/i);
  if (explicit) return explicit[1].trim();

  const t = text.toLowerCase();
  if (/(salad|coffee|food|restaurant|cafe)/.test(t)) return "Food";
  if (/(bus|ticket|transport)/.test(t)) return "Transport";
  if (/(rent|apartment)/.test(t)) return "Rent";
  return null;
}

function extractNotes(text: string): string | null {
  const m = text.match(/\bnotes?\s*[=:]\s*(.+)$/i);
  if (m) return m[1].trim();
  return text.replace(/\s*\|\s*/g, " ").trim();
}

function parseFreeTextToEvents(rawText: string): ParsedEvent[] {
  const chunks = rawText
    .split(/\r?\n|[.!?]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  return chunks.map((chunk) => {
    const event_ts = extractTimestamp(chunk);
    const person = extractPerson(chunk);
    const city = extractCity(chunk);
    const amount = extractAmount(chunk);
    const category = extractCategory(chunk);
    const notes = extractNotes(chunk);
    const parse_ok = Boolean(event_ts || person || city || amount || category);

    return { event_ts, person, city, amount, category, notes, parse_ok, source_line: chunk };
  });
}

// -------------------------
// Schemas
// -------------------------
const IngestTextSchema = z.object({
  docType: z.string().min(1),
  source: z.string().min(1),
  rawText: z.string().min(1),
});

// =====================================================
// ROUTES
// =====================================================

// A) Paste TEXT (raw paragraph) -> RAW.FILE_INGEST + CURATED.TEXT_EVENTS
app.post("/api/ingest", async (req, res) => {
  const parsed = IngestTextSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const { docType, source, rawText } = parsed.data;
  const id = uuid();

  try {
    // RAW store
    await execSql(
      `INSERT INTO ${DB}.RAW.FILE_INGEST (id, filename, content_type, file_kind, raw_text, meta)
       VALUES (?, ?, ?, 'TEXT', ?, NULL)`,
      [id, source, "text/plain", rawText]
    );

    // Parse + CURATED store
    const events = parseFreeTextToEvents(rawText);
    for (const e of events) {
      await execSql(
        `INSERT INTO ${DB}.CURATED.TEXT_EVENTS
           (file_id, event_ts, person, city, amount, category, notes, parse_ok)
         VALUES
           (?, TRY_TO_TIMESTAMP_NTZ(?), ?, ?, ?, ?, ?, ?)`,
        [id, e.event_ts, e.person, e.city, e.amount, e.category, e.notes, e.parse_ok]
      );
    }

    res.json({ id, kind: "TEXT_EVENTS", inserted: events.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Unknown error" });
  }
});

// B) Upload ANY FILE -> RAW.FILE_INGEST + CURATED based on type
app.post("/api/ingest-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const id = uuid();
    const filename = req.file.originalname;
    const contentType = req.file.mimetype || "application/octet-stream";
    const buf = req.file.buffer;

    const kind = detectKind(contentType, filename);

    // ---- TEXT file
    if (kind === "TEXT") {
      const rawText = buf.toString("utf-8");

      await execSql(
        `INSERT INTO ${DB}.RAW.FILE_INGEST (id, filename, content_type, file_kind, raw_text, meta)
         VALUES (?, ?, ?, 'TEXT', ?, NULL)`,
        [id, filename, contentType, rawText]
      );

      if (looksLikeLog(rawText)) {
        const lines = rawText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

        for (const line of lines) {
          const ts =
            line.match(/\b(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)\b/)?.[1] ?? null;
          const level = line.match(/\b(INFO|WARN|ERROR|DEBUG)\b/i)?.[1]?.toUpperCase() ?? null;
          const service = line.match(/\b([A-Za-z]+Service)\b/)?.[1] ?? null;
          const code = line.match(/\bcode=([A-Za-z0-9_:-]+)\b/i)?.[1] ?? null;

          await execSql(
            `INSERT INTO ${DB}.CURATED.LOG_EVENTS (file_id, ts, level, service, message, code)
             VALUES (?, TRY_TO_TIMESTAMP_NTZ(?), ?, ?, ?, ?)`,
            [id, ts, level, service, line, code]
          );
        }

        return res.json({ id, kind: "TEXT_LOGS", inserted: lines.length });
      }

      const events = parseFreeTextToEvents(rawText);
      for (const e of events) {
        await execSql(
          `INSERT INTO ${DB}.CURATED.TEXT_EVENTS
             (file_id, event_ts, person, city, amount, category, notes, parse_ok)
           VALUES
             (?, TRY_TO_TIMESTAMP_NTZ(?), ?, ?, ?, ?, ?, ?)`,
          [id, e.event_ts, e.person, e.city, e.amount, e.category, e.notes, e.parse_ok]
        );
      }

      return res.json({ id, kind: "TEXT_EVENTS", inserted: events.length });
    }

    // ---- IMAGE file
    if (kind === "IMAGE") {
      const exif = await exifr.parse(buf, { gps: true }).catch(() => null);
      const derived = await computeMetrics(buf);
      const metaJson = { exif, derived };

      await execSql(
        `INSERT INTO ${DB}.RAW.FILE_INGEST (id, filename, content_type, file_kind, raw_text, meta)
         SELECT ?, ?, ?, 'IMAGE', NULL, PARSE_JSON(?)`,
        [id, filename, contentType, JSON.stringify(metaJson)]
      );

      // NOTE: assumes CURATED.IMAGE_FEATURES columns are (file_id, filename, taken_at, ... )
      await execSql(
        `INSERT INTO DATA_LAKE_DB.CURATED.IMAGE_FEATURES
            (id, filename, taken_at, camera_make, camera_model, width, height, has_gps, lat, lon, brightness, sharpness)
        SELECT
            id,
            filename,
            TRY_TO_TIMESTAMP_NTZ(meta:exif:DateTimeOriginal::string),
            meta:exif:Make::string,
            meta:exif:Model::string,
            meta:derived:width::number,
            meta:derived:height::number,
            IFF(meta:exif:latitude IS NOT NULL AND meta:exif:longitude IS NOT NULL, TRUE, FALSE),
            meta:exif:latitude::float,
            meta:exif:longitude::float,
            meta:derived:brightness::float,
            meta:derived:sharpness::float
        FROM DATA_LAKE_DB.RAW.FILE_INGEST
        WHERE id = ?`,
        [id]
    );
      return res.json({ id, kind: "IMAGE" });
    }

    // ---- AUDIO file
    if (kind === "AUDIO") {
      const mm = await parseBuffer(buf, { mimeType: contentType });

      const duration = mm.format.duration ?? null;
      const bitrate = mm.format.bitrate ? Math.round(mm.format.bitrate) : null;
      const sampleRate = mm.format.sampleRate ?? null;

      const title = mm.common.title ?? null;
      const artist = mm.common.artist ?? null;
      const album = mm.common.album ?? null;

      const metaJson = { format: mm.format, common: mm.common };

      await execSql(
        `INSERT INTO ${DB}.RAW.FILE_INGEST (id, filename, content_type, file_kind, raw_text, meta)
         SELECT ?, ?, ?, 'AUDIO', NULL, PARSE_JSON(?)`,
        [id, filename, contentType, JSON.stringify(metaJson)]
      );

      await execSql(
        `INSERT INTO ${DB}.CURATED.AUDIO_FEATURES
          (file_id, filename, duration_sec, bitrate, sample_rate, title, artist, album)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, filename, duration, bitrate, sampleRate, title, artist, album]
      );

      return res.json({ id, kind: "AUDIO" });
    }

    // ---- UNKNOWN
    await execSql(
      `INSERT INTO ${DB}.RAW.FILE_INGEST (id, filename, content_type, file_kind, raw_text, meta)
       VALUES (?, ?, ?, 'UNKNOWN', NULL, NULL)`,
      [id, filename, contentType]
    );

    return res.json({ id, kind: "UNKNOWN" });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "Unknown error" });
  }
});

// C) Fetch results by id + kind (universal)
app.get("/api/results/:id", async (req, res) => {
  const id = req.params.id;
  const kind = (req.query.kind as string | undefined) ?? "TEXT_EVENTS";

  try {
    if (kind === "TEXT_EVENTS") {
      const rows = await execSql(
        `SELECT * FROM ${DB}.CURATED.TEXT_EVENTS WHERE file_id = ? ORDER BY event_ts`,
        [id]
      );
      return res.json({ kind, rows });
    }

    if (kind === "TEXT_LOGS") {
      const rows = await execSql(
        `SELECT * FROM ${DB}.CURATED.LOG_EVENTS WHERE file_id = ? ORDER BY ts`,
        [id]
      );
      return res.json({ kind, rows });
    }

    if (kind === "IMAGE") {
      const rows = await execSql(
        `SELECT * FROM DATA_LAKE_DB.CURATED.IMAGE_FEATURES WHERE id = ?`,
        [req.params.id]
    );
      return res.json({ kind, rows });
    }

    if (kind === "AUDIO") {
      const rows = await execSql(
        `SELECT * FROM ${DB}.CURATED.AUDIO_FEATURES WHERE file_id = ?`,
        [id]
      );
      return res.json({ kind, rows });
    }

    return res.status(400).json({ error: "Unknown kind" });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "Unknown error" });
  }
});

app.listen(4000, () => console.log("API on http://localhost:4000"));