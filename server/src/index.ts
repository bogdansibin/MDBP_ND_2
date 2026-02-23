// server/src/index.ts
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
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ----------------------------
// Snowflake connection
// ----------------------------
const DB = process.env.SNOWFLAKE_DATABASE ?? "DATA_LAKE_DB";
const SCHEMA_RAW = process.env.SNOWFLAKE_SCHEMA_RAW ?? "RAW";
const SCHEMA_CUR = process.env.SNOWFLAKE_SCHEMA_CURATED ?? "CURATED";

const conn = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  username: process.env.SNOWFLAKE_USER!,
  password: process.env.SNOWFLAKE_PASSWORD!,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE ?? "WH_XS",
  database: DB,
  schema: SCHEMA_RAW,
});

function execSql(sqlText: string, binds: any[] = []) {
  return new Promise<any[]>((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => (err ? reject(err) : resolve((rows ?? []) as any[])),
    });
  });
}

// For UPDATE/DELETE we want affected count:
function execDml(sqlText: string, binds: any[] = []) {
  return new Promise<{ affected: number }>((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, stmt) => {
        if (err) return reject(err);
        const affected = (stmt as any)?.getNumUpdatedRows?.() ?? 0;
        resolve({ affected });
      },
    });
  });
}

conn.connect((err) => {
  if (err) console.error("Snowflake connect failed:", err.message);
  else console.log("Snowflake connected");
});

// ----------------------------
// Helpers
// ----------------------------
type Kind = "TEXT_EVENTS" | "TEXT_LOGS" | "IMAGE" | "AUDIO" | "UNKNOWN";

function detectKind(contentType: string, filename: string): Kind {
  const f = (filename ?? "").toLowerCase();
  const ct = (contentType ?? "").toLowerCase();

  if (ct.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(f)) return "IMAGE";
  if (ct.startsWith("audio/") || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(f)) return "AUDIO";
  if (ct.startsWith("text/") || /\.(txt|log|csv|eml)$/i.test(f)) return "TEXT_EVENTS";
  return "UNKNOWN";
}

const KindEnum = z.enum(["TEXT_EVENTS", "TEXT_LOGS", "IMAGE", "AUDIO"]);

function tableInfo(kind: z.infer<typeof KindEnum>) {
  switch (kind) {
    case "TEXT_EVENTS":
      return { table: `${DB}.${SCHEMA_CUR}.TEXT_EVENTS`, idCol: "FILE_ID" };
    case "TEXT_LOGS":
      return { table: `${DB}.${SCHEMA_CUR}.LOG_EVENTS`, idCol: "FILE_ID" };
    case "IMAGE":
      return { table: `${DB}.${SCHEMA_CUR}.IMAGE_FEATURES`, idCol: "ID" };
    case "AUDIO":
      // ✅ FIX: your AUDIO_FEATURES uses "ID" (you insert into (id, filename, ...))
      return { table: `${DB}.${SCHEMA_CUR}.AUDIO_FEATURES`, idCol: "ID" };
  }
}

function safeNumber(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// ----------------------------
// Routes
// ----------------------------

// A) CREATE: ingest pasted text
app.post("/api/ingest", async (req, res) => {
  const bodySchema = z.object({
    docType: z.string().optional(),
    source: z.string().default("paste"),
    rawText: z.string().min(1),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { docType, source, rawText } = parsed.data;
  const id = uuid();

  try {
    await execSql(
      `INSERT INTO ${DB}.${SCHEMA_RAW}.FILE_INGEST (id, filename, content_type, file_kind, raw_text)
       VALUES (?, ?, 'text/plain', ?, ?)`,
      [id, source, docType === "Logs" ? "TEXT_LOGS" : "TEXT_EVENTS", rawText]
    );

    if (docType === "Logs") {
      await execSql(
        `INSERT INTO ${DB}.${SCHEMA_CUR}.LOG_EVENTS (file_id, message, level, parse_ok)
         VALUES (?, ?, ?, TRUE)`,
        [id, rawText.substring(0, 200), "INFO"]
      );
      return res.json({ id, kind: "TEXT_LOGS" });
    } else {
      await execSql(
        `INSERT INTO ${DB}.${SCHEMA_CUR}.TEXT_EVENTS (file_id, notes, parse_ok)
         VALUES (?, ?, TRUE)`,
        [id, rawText.substring(0, 200)]
      );
      return res.json({ id, kind: "TEXT_EVENTS" });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// A2) CREATE: ingest file
app.post("/api/ingest-file", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Missing file" });

  const id = uuid();
  const filename = file.originalname ?? "upload.bin";
  const contentType = file.mimetype ?? "application/octet-stream";
  const kind = detectKind(contentType, filename);

  try {
    const rawText =
      kind === "TEXT_EVENTS" || kind === "TEXT_LOGS"
        ? file.buffer.toString("utf-8").slice(0, 5_000_000)
        : null;

    await execSql(
      `INSERT INTO ${DB}.${SCHEMA_RAW}.FILE_INGEST (id, filename, content_type, file_kind, raw_text)
       VALUES (?, ?, ?, ?, ?)`,
      [id, filename, contentType, kind, rawText]
    );

    // Curate
    if (kind === "IMAGE") {
      let takenAt: string | null = null;
      let cameraMake: string | null = null;
      let cameraModel: string | null = null;
      let width: number | null = null;
      let height: number | null = null;
      let hasGps: boolean | null = null;
      let lat: number | null = null;
      let lon: number | null = null;

      try {
        const exif: any = await exifr.parse(file.buffer, { gps: true });
        if (exif) {
          takenAt = exif.DateTimeOriginal ? new Date(exif.DateTimeOriginal).toISOString() : null;
          cameraMake = exif.Make ?? null;
          cameraModel = exif.Model ?? null;

          if (exif.latitude != null && exif.longitude != null) {
            hasGps = true;
            lat = safeNumber(exif.latitude);
            lon = safeNumber(exif.longitude);
          } else {
            hasGps = false;
          }
        }
      } catch {
        // ignore
      }

      try {
        const meta = await sharp(file.buffer).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
      } catch {
        // ignore
      }

      await execSql(
        `INSERT INTO ${DB}.${SCHEMA_CUR}.IMAGE_FEATURES
         (id, filename, taken_at, camera_make, camera_model, width, height, has_gps, lat, lon)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, filename, takenAt, cameraMake, cameraModel, width, height, hasGps, lat, lon]
      );

      return res.json({ id, kind: "IMAGE" });
    }

    if (kind === "AUDIO") {
      let duration: number | null = null;
      let codec: string | null = null;
      let sampleRate: number | null = null;
      let channels: number | null = null;

      try {
        const mm = await parseBuffer(file.buffer, file.mimetype);
        duration = mm.format.duration ? safeNumber(mm.format.duration) : null;
        codec = (mm.format.codec ?? null) as any;
        sampleRate = mm.format.sampleRate ? safeNumber(mm.format.sampleRate) : null;
        channels = mm.format.numberOfChannels ? safeNumber(mm.format.numberOfChannels) : null;
      } catch {
        // ignore
      }

      await execSql(
        `INSERT INTO ${DB}.${SCHEMA_CUR}.AUDIO_FEATURES
         (id, filename, duration_s, codec, sample_rate, channels)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, filename, duration, codec, sampleRate, channels]
      );

      return res.json({ id, kind: "AUDIO" });
    }

    if (kind === "TEXT_EVENTS" || kind === "TEXT_LOGS") {
      if (kind === "TEXT_LOGS") {
        await execSql(
          `INSERT INTO ${DB}.${SCHEMA_CUR}.LOG_EVENTS (file_id, message, level, parse_ok)
           VALUES (?, ?, ?, TRUE)`,
          [id, (rawText ?? "").substring(0, 200), "INFO"]
        );
        return res.json({ id, kind: "TEXT_LOGS" });
      } else {
        await execSql(
          `INSERT INTO ${DB}.${SCHEMA_CUR}.TEXT_EVENTS (file_id, notes, parse_ok)
           VALUES (?, ?, TRUE)`,
          [id, (rawText ?? "").substring(0, 200)]
        );
        return res.json({ id, kind: "TEXT_EVENTS" });
      }
    }

    return res.json({ id, kind: "UNKNOWN" });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// B) READ: view whole table
app.get("/api/tables/:kind", async (req, res) => {
  const parsed = KindEnum.safeParse(req.params.kind);
  if (!parsed.success) return res.status(400).json({ error: "Invalid kind" });

  const { table } = tableInfo(parsed.data);

  try {
    const rows = await execSql(`SELECT * FROM ${table} ORDER BY 1 DESC LIMIT 50`);
    return res.json({ rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// B2) READ: results for id/kind
app.get("/api/results/:id", async (req, res) => {
  const id = req.params.id;
  const kindQ = (req.query.kind as string) ?? "TEXT_EVENTS";

  const parsed = KindEnum.safeParse(kindQ);
  if (!parsed.success) return res.status(400).json({ error: "Invalid kind" });

  const { table, idCol } = tableInfo(parsed.data);

  try {
    const rows = await execSql(
      `SELECT * FROM ${table} WHERE "${idCol}" = ? ORDER BY 1 DESC LIMIT 200`,
      [id]
    );
    return res.json({ rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// C) UPDATE
app.patch("/api/data/:kind/:id", async (req, res) => {
  const kindP = KindEnum.safeParse(req.params.kind);
  if (!kindP.success) return res.status(400).json({ error: "Invalid kind" });

  const id = req.params.id;
  const updates = req.body ?? {};
  const { table, idCol } = tableInfo(kindP.data);

  const keys = Object.keys(updates).filter(
    (k) => k && k.toUpperCase() !== idCol.toUpperCase()
  );
  if (keys.length === 0) return res.status(400).json({ error: "No fields to update" });

  const setClause = keys.map((k) => `"${k}" = ?`).join(", ");
  const binds = [...keys.map((k) => updates[k]), id];

  try {
    const { affected } = await execDml(
      `UPDATE ${table} SET ${setClause} WHERE "${idCol}" = ?`,
      binds
    );

    if (affected === 0) {
      return res.status(404).json({
        error: `0 rows updated. Check primary key column "${idCol}" and id value.`,
        table,
        idCol,
        id,
      });
    }

    return res.json({ success: true, updated: affected });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// D) DELETE
app.delete("/api/data/:kind/:id", async (req, res) => {
  const kindP = KindEnum.safeParse(req.params.kind);
  if (!kindP.success) return res.status(400).json({ error: "Invalid kind" });

  const id = req.params.id;
  const { table, idCol } = tableInfo(kindP.data);

  try {
    const { affected } = await execDml(`DELETE FROM ${table} WHERE "${idCol}" = ?`, [id]);

    if (affected === 0) {
      return res.status(404).json({
        error: `0 rows deleted. Check primary key column "${idCol}" and id value.`,
        table,
        idCol,
        id,
      });
    }

    return res.json({ success: true, deleted: affected });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

app.listen(4000, () => console.log("Backend running on port 4000"));