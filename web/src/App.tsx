import { useMemo, useState } from "react";

const API = "http://localhost:4000";

type Kind = "TEXT_EVENTS" | "TEXT_LOGS" | "IMAGE" | "AUDIO" | "UNKNOWN";
type ViewMode = "table" | "json";

const styles = `
:root{
  /* lighter base */
  --bg0:#f6f7ff;
  --bg1:#eef2ff;

  /* text becomes dark */
  --text: rgba(10,12,28,.92);
  --muted: rgba(10,12,28,.62);
  --muted2: rgba(10,12,28,.52);

  /* borders/shadows tuned for light */
  --stroke: rgba(10,12,28,.12);
  --shadow: 0 18px 55px rgba(10,12,28,.18);

  --r: 18px;
  --c1:#7c3aed;
  --c2:#22d3ee;
  --c3:#fb7185;
}

*{ box-sizing:border-box; }
html, body {
  min-height: 100%; /* Changed from height: 100% */
  margin: 0;
  display: flex;          /* Added for centering */
  flex-direction: column; /* Added for centering */
  align-items: center;    /* Added for horizontal centering */
  justify-content: flex-start; /* Ensure it starts from top, but stays centered */
  
  background:
    radial-gradient(1200px 700px at 15% 10%, rgba(124,58,237,.18), transparent 55%),
    radial-gradient(900px 600px at 85% 20%, rgba(34,211,238,.18), transparent 55%),
    radial-gradient(900px 600px at 70% 85%, rgba(251,113,133,.14), transparent 55%),
    linear-gradient(180deg, var(--bg0), var(--bg1));
  background-attachment: fixed; /* Keeps background still while scrolling */
} 

/* Update neonWrap to ensure it doesn't jump around */
.neonWrap {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto; /* Centers the container itself */
  padding: 40px 18px 80px;
  position: relative;
  box-sizing: border-box;
}

/* Fix the Results container for large JSON */
.results {
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,.16);
  background: linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.18));
  box-shadow: 0 20px 60px rgba(0,0,0,.55);
  overflow: hidden;
  width: 100%; /* Ensure it doesn't burst out of the grid */
}

/* Ensure the pre tag handles the text properly */
.pre {
  margin: 0;
  padding: 16px 18px;
  white-space: pre-wrap;
  word-break: break-all; /* Prevents long strings from breaking layout */
  overflow-x: auto;
  max-height: 70vh; /* Limits the height so it doesn't push the page to infinity */
  color: rgba(255,255,255,.88);
}
body{ margin:0; color:var(--text); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }

.neonWrap{
  max-width: 1100px;
  margin: 40px auto;
  padding: 0 18px 44px;
  position: relative;
}

.topGlow{
  position:absolute; inset:-60px -20px auto -20px; height: 220px;
  background:
    radial-gradient(closest-side, rgba(124,58,237,.22), transparent 70%),
    radial-gradient(closest-side, rgba(34,211,238,.18), transparent 70%),
    radial-gradient(closest-side, rgba(251,113,133,.14), transparent 70%);
  filter: blur(10px);
  pointer-events:none;
}

.header{
  display:flex; align-items:flex-end; justify-content:space-between; gap:16px;
  margin-bottom: 16px;
}
.brandTitle{
  display:flex; flex-direction:column;
}
.h1{
  font-size: 34px;
  letter-spacing: -0.02em;
  margin:0;
  background: linear-gradient(90deg, rgba(255,255,255,.95), rgba(255,255,255,.72));
  -webkit-background-clip:text;
  background-clip:text;
  color: white;
}
.sub{
  margin-top: 10px;
  color: var(--muted);
  line-height: 1.45;
  max-width: 760px;
}
.badge{
  padding: 10px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12);
  color: rgba(255,255,255,.8);
  font-size: 12px;
  white-space:nowrap;
  box-shadow: 0 10px 30px rgba(0,0,0,.35);
}

.grid{
  display:grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
@media (min-width: 920px){
  .grid{ grid-template-columns: 1fr 1fr; }
  .wide{ grid-column: 1 / -1; }
}

.card{
  position: relative;
  border-radius: var(--r);
  background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.045));
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow);
  overflow:hidden;
}
.card::before{
  content:"";
  position:absolute; inset:0;
  background:
    radial-gradient(600px 220px at 20% 10%, rgba(124,58,237,.20), transparent 55%),
    radial-gradient(600px 220px at 90% 0%, rgba(34,211,238,.16), transparent 55%),
    radial-gradient(600px 220px at 65% 115%, rgba(251,113,133,.14), transparent 55%);
  opacity:.9;
  pointer-events:none;
}
.cardInner{
  position:relative;
  padding: 18px;
  backdrop-filter: blur(10px);
}

.titleRow{
  display:flex; align-items:center; justify-content:space-between; gap:10px;
}
.h2{
  margin:0;
  font-size: 16px;
  letter-spacing: .2px;
  color: rgba(255,255,255,.9);
}
.hint{
  margin-top: 6px;
  color: var(--muted2);
  font-size: 13px;
}

/* ✅ alignment fix: split row into left/right groups */
.row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  flex-wrap:wrap;
  margin-top: 12px;
}
.rowLeft, .rowRight{
  display:flex; align-items:center; gap:10px; flex-wrap:wrap;
}

.label{ color: var(--muted); font-size: 13px; }

.select, .textarea, .file{
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(0,0,0,.25);
  color: rgba(255,255,255,.92);
  outline: none;
  transition: border-color .12s ease, box-shadow .12s ease;
}
.select{ padding: 10px 12px; }
.file{ padding: 10px 12px; min-width: 320px; }
.textarea{ width:100%; min-height: 220px; padding: 12px 12px; line-height: 1.45; resize: vertical; }

.select:focus, .textarea:focus, .file:focus{
  border-color: rgba(34,211,238,.55);
  box-shadow: 0 0 0 5px rgba(34,211,238,.12);
}

.pills{ display:flex; gap:8px; flex-wrap:wrap; margin-top: 10px; }
.pill{
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  color: rgba(255,255,255,.82);
  font-size: 12px;
}
.pill b{ color: rgba(255,255,255,.92); font-weight:600; }

.btn{
  appearance:none;
  border: 0;
  border-radius: 14px;
  padding: 10px 14px;
  font-weight: 650;
  letter-spacing: .2px;
  color: rgba(255,255,255,.95);
  cursor:pointer;
  transition: transform .12s ease, filter .12s ease, opacity .12s ease, box-shadow .12s ease;
  user-select:none;
  white-space:nowrap;
}
.btn:active{ transform: translateY(1px) scale(.99); }
.btn:disabled{ opacity: .55; cursor:not-allowed; }

.btnNeon{
  background: linear-gradient(90deg, rgba(76, 41, 136, 0.95), rgba(224, 215, 215, 0.95), rgba(211, 23, 23, 0.92));
  box-shadow:
    0 0 0 1px rgba(255,255,255,.12),
    0 18px 45px rgba(124,58,237,.18),
    0 18px 45px rgba(34,211,238,.14),
    0 18px 45px rgba(251,113,133,.12);
}
.btnNeon:hover{ filter: brightness(1.5); }

.btnGhost{
  background: rgba(255, 255, 255, 0.99);
  border: 1px solid rgba(255, 250, 250, 0.94);
  color: rgba(255,255,255,.88);
}
.btnGhost:hover{ filter: brightness(1.5); }

.btnMini{
  padding: 8px 10px;
  border-radius: 12px;
  font-size: 12px;
}

.seg{
  display:inline-flex;
  gap:6px;
  padding: 6px;
  border-radius: 999px;
  background: rgba(255,255,255,.75);
  border: 1px solid rgba(10,12,28,.12);
  box-shadow: 0 10px 24px rgba(10,12,28,.10);
}

.segBtn{
  border: 0;
  padding: 8px 12px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  background: transparent;
  color: rgba(10,12,28,.65);
}

.segBtnActive{
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.94), rgba(252, 252, 252, 0.92), rgb(255, 255, 255));
  color: white;
  box-shadow: 10px 10px 24px rgba(93, 0, 255, 0.94);
}

.segBtn:disabled{
  opacity: .6;
  cursor: not-allowed;
}

.small{ font-size: 13px; color: var(--muted); }

.hr{
  height:1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent);
  margin: 14px 0;
}

.kv{ display:flex; gap: 10px; flex-wrap:wrap; }
.kvItem{
  display:flex; align-items:center; gap:8px;
  padding: 8px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12);
  font-size: 12px;
  color: rgba(255,255,255,.8);
}
.dot{ width:8px; height:8px; border-radius: 999px; background: rgba(34,211,238,.9); box-shadow: 0 0 18px rgba(34,211,238,.55); }
.dot2{ background: rgba(251,113,133,.92); box-shadow: 0 0 18px rgba(251,113,133,.55); }

.err{
  margin-top: 16px;
  border-radius: 16px;
  padding: 14px 14px;
  border: 1px solid rgba(251,113,133,.35);
  background: rgba(251,113,133,.08);
  color: rgba(255,255,255,.92);
  overflow-x:auto;
  box-shadow: 0 20px 50px rgba(0,0,0,.35);
}

/* Results */
.results{
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,.16);
  background: linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.18));
  box-shadow: 0 20px 60px rgba(0,0,0,.55);
  overflow:hidden;
}
.resultsTop{
  padding: 14px 16px;
  display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
  background: rgba(255,255,255,.04);
  border-bottom: 1px solid rgba(255,255,255,.10);
}
.resultsTop h2{ margin:0; font-size:16px; }

.pre{
  margin: 0;
  padding: 16px 18px;
  white-space: pre-wrap;
  overflow-x: auto;
  color: rgba(255,255,255,.88);
}

/* ✅ table */
.tableWrap{ padding: 12px 12px 16px; overflow:auto; }
.table{
  width:100%;
  border-collapse: collapse;
  min-width: 780px;
}
.th, .td{
  text-align:left;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,.10);
  font-size: 13px;
  color: rgba(255,255,255,.86);
}
.th{
  position: sticky;
  top: 0;
  background: rgba(0,0,0,.35);
  backdrop-filter: blur(8px);
  color: rgba(255,255,255,.92);
  font-weight: 700;
}
  /* Results body becomes a scroll container */
.resultsBody{
  max-height: 520px;           /* adjust: 420–700px */
  overflow: auto;
}

/* keep table header visible while scrolling */
.tableWrap{
  padding: 12px 12px 16px;
  overflow: auto;
  max-height: 520px;           /* same as .resultsBody if you prefer */
}

/* sticky header already, but needs correct background */
.th{
  position: sticky;
  top: 0;
  background: rgba(0,0,0,.55);
  backdrop-filter: blur(8px);
  z-index: 2;
}

/* optional: make results top bar sticky too */
.resultsTop{
  position: sticky;
  top: 0;
  z-index: 3;
}
.mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
`;

function downloadJsonFile(filename: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [docType, setDocType] = useState("Diary");
  const [rawText, setRawText] = useState("");
  const [textLoading, setTextLoading] = useState(false);

  const [fileLoading, setFileLoading] = useState(false);

  const [lastId, setLastId] = useState<string | null>(null);
  const [lastKind, setLastKind] = useState<Kind | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("table"); // ✅ table/json switch

  const canStructureText = useMemo(
    () => rawText.trim().length > 0 && !textLoading,
    [rawText, textLoading]
  );

  const columns = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    const keys = new Set<string>();
    for (const r of rows) Object.keys(r ?? {}).forEach((k) => keys.add(k));
    return Array.from(keys);
  }, [rows]);

  async function fetchResults(id: string, kind: Kind) {
    const r2 = await fetch(`${API}/api/results/${id}?kind=${encodeURIComponent(kind)}`);
    const d2 = await r2.json();
    if (!r2.ok) throw new Error(JSON.stringify(d2));

    // accept both {rows:[...]} and [...]
    const parsedRows = Array.isArray(d2) ? d2 : (d2.rows ?? []);
    setRows(parsedRows);
  }

  async function structureText() {
    setError(null);
    setRows([]);
    setLastId(null);
    setLastKind(null);
    setTextLoading(true);

    try {
      const res = await fetch(`${API}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, source: "paste", rawText }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));

      const id = data.id as string;
      const kind = (data.kind as Kind) ?? "TEXT_EVENTS"; // ✅ use server kind
      setLastId(id);
      setLastKind(kind);

      await fetchResults(id, kind);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setTextLoading(false);
    }
  }

  async function uploadFile(file: File) {
    setError(null);
    setRows([]);
    setLastId(null);
    setLastKind(null);
    setFileLoading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(`${API}/api/ingest-file`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));

      const id = data.id as string;
      const kind = (data.kind as Kind) ?? "UNKNOWN";
      setLastId(id);
      setLastKind(kind);

      if (kind !== "UNKNOWN") {
        await fetchResults(id, kind);
      } else {
        setRows([{ message: "Uploaded as UNKNOWN (only stored in RAW.FILE_INGEST)", ...data }]);
      }
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setFileLoading(false);
    }
  }

  const sample = `2026-02-19 18:40 Jonas Petrauskas Vilnius paid 12.50 EUR for salad + coffee
2026-02-19 20:10 Ieva Kazlauskaitė Kaunas paid 7 EUR bus ticket
Bad line without structure
2026-02-20 09:05 Jonas Petrauskas Vilnius paid 120 EUR rent February`;

  const SAMPLE_LOGS = `2026-02-19 10:15:03 INFO AuthService User login success code=OK
2026-02-19 10:16:11 WARN PaymentService Slow response code=SLOW_API
2026-02-19 10:17:45 ERROR OrderService Failed to create order code=DB_ERR
2026-02-19 10:18:02 DEBUG AuthService token=... code=TRACE`

  const sampleType = docType === "Diary" ? sample : SAMPLE_LOGS;

  const canDownload = rows.length > 0;

  return (
    <>
      <style>{styles}</style>

      <div className="neonWrap">
        <div className="topGlow" />

        <div className="header">
          <div className="brandTitle">
            <h1 className="h1">NeonStruct ✨</h1>
            <div className="sub">
              Unstructured → Structured Data Lab. Paste text or upload files and view results as a
              table or JSON. Download JSON anytime.
            </div>
          </div>
        </div>

        <div className="grid">
          {/* Upload */}
          <div className="card">
            <div className="cardInner">
              <div className="titleRow">
                <h2 className="h2">Upload unstructured file</h2>
                <span className="pill">
                  <b>RAW.FILE_INGEST</b>
                </span>
              </div>

              <div className="hint">TXT/LOG/EML, JPG/PNG, MP3/WAV/M4A (metadata)</div>

              <div className="row">
                <div className="rowLeft">
                  <input
                    className="file"
                    type="file"
                    disabled={fileLoading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadFile(f);
                    }}
                  />
                </div>
                <div className="rowRight">
                  <button className="btn btnGhost" disabled>
                    {fileLoading ? "Uploading…" : "Ready"}
                  </button>
                </div>
              </div>

              <div className="pills">
                <span className="pill">📄 TXT/LOG/EML</span>
                <span className="pill">🖼️ JPG/PNG</span>
                <span className="pill">🎧 MP3/WAV/M4A</span>
              </div>

              <div className="hr" />
              <div className="small">Tip: drag & drop can be added later, this keeps it simple.</div>
            </div>
          </div>

          {/* Text paste */}
          <div className="card">
            <div className="cardInner">
              <div className="titleRow">
                <h2 className="h2">Paste raw text</h2>
                <span className="pill">
                  <b>RAW.TEXT_INGEST</b>
                </span>
              </div>

              <div className="row">
                <div className="rowLeft">
                  <span className="label">Doc type</span>
                  <select
                    className="select"
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                  >
                    <option>Diary</option>
                    <option>Logs</option>
                  </select>

                  <button
                    className="btn btnGhost"
                    disabled={textLoading}
                    onClick={() => setRawText(sampleType)}
                  >
                    Paste sample
                  </button>
                </div>

                <div className="rowRight">
                  <button
                    className="btn btnNeon"
                    onClick={structureText}
                    disabled={!canStructureText}
                  >
                    {textLoading ? "Structuring…" : "Structure text"}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <textarea
                  className="textarea"
                  placeholder="Paste any messy paragraph / notes / lines here…"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                />
              </div>

              <div className="small" style={{ marginTop: 10 }}>
                Works best with timestamps / names / amounts — but it can handle chaos too.
              </div>
            </div>
          </div>

          {/* Error */}
          {error && <pre className="err">{error}</pre>}

          {/* Results */}
          {(lastId || rows.length > 0) && (
            <div className="results wide">
              <div className="resultsTop">
                <h2>Results</h2>

                <div className="rowRight" style={{ gap: 10 }}>
                  <div className="kv">
                    <div className="kvItem">
                      <span className="dot" />
                      <b>ID:</b>&nbsp;<span className="mono">{lastId ?? "-"}</span>
                    </div>
                    <div className="kvItem">
                      <span className="dot2" />
                      <b>Kind:</b>&nbsp;{lastKind ?? "-"}
                    </div>
                  </div>

                  {/* ✅ view toggle */}
                 <div className="seg" title="Choose view">
  <button
    className={`segBtn ${viewMode === "table" ? "segBtnActive" : ""}`}
    onClick={() => setViewMode("table")}
    disabled={!rows.length}
    type="button"
  >
    Table
  </button>
  <button
    className={`segBtn ${viewMode === "json" ? "segBtnActive" : ""}`}
    onClick={() => setViewMode("json")}
    disabled={!rows.length}
    type="button"
  >
    JSON
  </button>
</div>

                  {/* ✅ always available download */}
                  <button
                    className={`btn btnNeon btnMini`}
                    disabled={!canDownload}
                    onClick={() =>
                      downloadJsonFile(
                        `results_${lastKind ?? "UNKNOWN"}_${lastId ?? "noid"}.json`,
                        { id: lastId, kind: lastKind, rows }
                      )
                    }
                    title="Download the current results as JSON"
                  >
                    Download JSON
                  </button>
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="small" style={{ padding: 16 }}>
                  No rows returned for this ID/kind.
                </div>
              ) : viewMode === "json" ? (
                <pre className="pre">{JSON.stringify(rows, null, 2)}</pre>
              ) : (
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        {columns.map((c) => (
                          <th key={c} className="th">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => (
                        <tr key={idx}>
                          {columns.map((c) => (
                            <td key={c} className="td">
                              {r?.[c] === null || r?.[c] === undefined
                                ? ""
                                : typeof r[c] === "object"
                                  ? JSON.stringify(r[c])
                                  : String(r[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}