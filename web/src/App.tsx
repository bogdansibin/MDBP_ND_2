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
  min-height: 100%;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  background:
    radial-gradient(1200px 700px at 15% 10%, rgba(124,58,237,.18), transparent 55%),
    radial-gradient(900px 600px at 85% 20%, rgba(34,211,238,.18), transparent 55%),
    radial-gradient(900px 600px at 70% 85%, rgba(251,113,133,.14), transparent 55%),
    linear-gradient(180deg, var(--bg0), var(--bg1));
  background-attachment: fixed;
}

body{ margin:0; color:var(--text); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }

.neonWrap{
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 40px 18px 80px;
  position: relative;
  box-sizing: border-box;
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
.brandTitle{ display:flex; flex-direction:column; }
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

.titleRow{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
.h2{
  margin:0;
  font-size: 16px;
  letter-spacing: .2px;
  color: rgba(255,255,255,.9);
}
.hint{ margin-top: 6px; color: var(--muted2); font-size: 13px; }

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

.select, .textarea, .file, .input{
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
.input{ padding: 9px 10px; min-width: 200px; }

.select:focus, .textarea:focus, .file:focus, .input:focus{
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
  color: rgba(10,12,28,.78);
}
.btnGhost:hover{ filter: brightness(1.05); }

.btnMini{
  padding: 8px 10px;
  border-radius: 12px;
  font-size: 12px;
}

.btnDanger{
  background: rgba(251,113,133,.16);
  border: 1px solid rgba(251,113,133,.35);
  color: rgba(255,255,255,.92);
}
.btnDanger:hover{ filter: brightness(1.2); }

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
  word-break: break-all;
  overflow-x: auto;
  max-height: 70vh;
  color: rgba(255,255,255,.88);
}

/* table */
.tableWrap{ padding: 12px 12px 16px; overflow:auto; max-height: 520px; }
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
  background: rgba(0,0,0,.55);
  backdrop-filter: blur(8px);
  z-index: 2;
  color: rgba(255,255,255,.92);
  font-weight: 700;
}

.tdActions{
  white-space: nowrap;
  display:flex;
  gap:8px;
  align-items:center;
}
.inlineInput{
  width: 100%;
  min-width: 120px;
  padding: 7px 8px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(0,0,0,.25);
  color: rgba(255,255,255,.92);
  outline: none;
}
.inlineInput:focus{
  border-color: rgba(34,211,238,.55);
  box-shadow: 0 0 0 4px rgba(34,211,238,.10);
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

function isEditableCell(value: any) {
  if (value === null || value === undefined) return true;
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean";
}

function stringifyCell(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function App() {
  // ingest text
  const [docType, setDocType] = useState("Diary");
  const [rawText, setRawText] = useState("");
  const [textLoading, setTextLoading] = useState(false);

  // upload file
  const [fileLoading, setFileLoading] = useState(false);

  // results
  const [lastId, setLastId] = useState<string | null>(null);
  const [lastKind, setLastKind] = useState<Kind | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // admin tables (view all existing tables)
  const [tableKind, setTableKind] = useState<Exclude<Kind, "UNKNOWN">>("TEXT_EVENTS");
  const [tableLoading, setTableLoading] = useState(false);

  // inline edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});
  const [rowBusyKey, setRowBusyKey] = useState<string | null>(null);

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

  // identify primary key per kind (client side must match server)
  const idColForKind = useMemo(() => {
    if (lastKind === "IMAGE") return "ID";
    if (lastKind && lastKind !== "UNKNOWN") return "FILE_ID";
    // for admin tableKind
    if (tableKind === "IMAGE") return "ID";
    return "FILE_ID";
  }, [lastKind, tableKind]);

  function rowKey(kind: Kind | Exclude<Kind, "UNKNOWN">, r: any) {
    const idCol = kind === "IMAGE" ? "ID" : "FILE_ID";
    const id = r?.[idCol];
    if (id === null || id === undefined) return `idx_${Math.random()}`;
    return String(id);
  }

  async function fetchResults(id: string, kind: Kind) {
    // your backend might not have /api/results (depends on your server file)
    // keeping it as-is because your original code used it
    const r2 = await fetch(`${API}/api/results/${id}?kind=${encodeURIComponent(kind)}`);
    const d2 = await r2.json();
    if (!r2.ok) throw new Error(JSON.stringify(d2));
    const parsedRows = Array.isArray(d2) ? d2 : (d2.rows ?? []);
    setRows(parsedRows);
  }

  async function structureText() {
    setError(null);
    setRows([]);
    setLastId(null);
    setLastKind(null);
    setEditingKey(null);
    setEditDraft({});
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
      const kind = (data.kind as Kind) ?? "TEXT_EVENTS";
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
    setEditingKey(null);
    setEditDraft({});
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

  // ✅ new: view all tables (last 50)
  async function loadTable(kind: Exclude<Kind, "UNKNOWN">) {
    setError(null);
    setTableLoading(true);
    setRows([]);
    setLastId("ALL");
    setLastKind(kind);
    setEditingKey(null);
    setEditDraft({});
    setViewMode("table");

    try {
      const res = await fetch(`${API}/api/tables/${encodeURIComponent(kind)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));

      const parsedRows = Array.isArray(data) ? data : (data.rows ?? []);
      setRows(parsedRows);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load table");
    } finally {
      setTableLoading(false);
    }
  }

  function startEdit(kind: Kind, r: any) {
    const key = rowKey(kind as any, r);
    setEditingKey(key);
    // draft = shallow copy, only editable primitives
    const draft: Record<string, any> = {};
    for (const [k, v] of Object.entries(r ?? {})) {
      if (isEditableCell(v)) draft[k] = v;
    }
    setEditDraft(draft);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditDraft({});
  }

  async function saveEdit(kind: Kind, r: any) {
    if (kind === "UNKNOWN") return;

    const idCol = kind === "IMAGE" ? "ID" : "FILE_ID";
    const id = r?.[idCol];
    if (id === null || id === undefined) {
      setError(`Cannot update: missing ${idCol}`);
      return;
    }

    const key = rowKey(kind as any, r);
    setRowBusyKey(key);
    setError(null);

    try {
      // remove idCol from payload if present
      const payload: Record<string, any> = { ...editDraft };
      delete payload[idCol];

      const res = await fetch(`${API}/api/data/${encodeURIComponent(kind)}/${encodeURIComponent(String(id))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(JSON.stringify(data));

      // update UI rows immediately
      setRows((prev) =>
        prev.map((x) => {
          const xid = x?.[idCol];
          if (String(xid) !== String(id)) return x;
          return { ...x, ...payload };
        })
      );

      setEditingKey(null);
      setEditDraft({});
    } catch (e: any) {
      setError(e?.message ?? "Update failed");
    } finally {
      setRowBusyKey(null);
    }
  }

  async function deleteRow(kind: Kind, r: any) {
    if (kind === "UNKNOWN") return;

    const idCol = kind === "IMAGE" ? "ID" : "FILE_ID";
    const id = r?.[idCol];
    if (id === null || id === undefined) {
      setError(`Cannot delete: missing ${idCol}`);
      return;
    }

    const key = rowKey(kind as any, r);
    setRowBusyKey(key);
    setError(null);

    try {
      const res = await fetch(`${API}/api/data/${encodeURIComponent(kind)}/${encodeURIComponent(String(id))}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(JSON.stringify(data));

      setRows((prev) => prev.filter((x) => String(x?.[idCol]) !== String(id)));
      if (editingKey === key) cancelEdit();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    } finally {
      setRowBusyKey(null);
    }
  }

  const sample = `2026-02-19 18:40 Jonas Petrauskas Vilnius paid 12.50 EUR for salad + coffee
2026-02-19 20:10 Ieva Kazlauskaitė Kaunas paid 7 EUR bus ticket
Bad line without structure
2026-02-20 09:05 Jonas Petrauskas Vilnius paid 120 EUR rent February`;

  const SAMPLE_LOGS = `2026-02-19 10:15:03 INFO AuthService User login success code=OK
2026-02-19 10:16:11 WARN PaymentService Slow response code=SLOW_API
2026-02-19 10:17:45 ERROR OrderService Failed to create order code=DB_ERR
2026-02-19 10:18:02 DEBUG AuthService token=... code=TRACE`;

  const sampleType = docType === "Diary" ? sample : SAMPLE_LOGS;

  const canDownload = rows.length > 0;

  const activeKindForTable = (lastKind ?? "UNKNOWN") as Kind;

  return (
    <>
      <style>{styles}</style>

      <div className="neonWrap">
        <div className="topGlow" />

        <div className="header">
          <div className="brandTitle">
            <h1 className="h1">NeonStruct ✨</h1>
            <div className="sub">
              Unstructured → Structured Data Lab. Paste text or upload files, then browse curated
              tables. Edit and delete records directly. Download JSON anytime.
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
                    type="button"
                  >
                    Paste sample
                  </button>
                </div>

                <div className="rowRight">
                  <button
                    className="btn btnNeon"
                    onClick={structureText}
                    disabled={!canStructureText}
                    type="button"
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

          {/* ✅ NEW: Browse existing tables */}
          <div className="card wide">
            <div className="cardInner">
              <div className="titleRow">
                <h2 className="h2">Browse existing curated tables</h2>
                <span className="pill">
                  <b>CURATED.*</b>
                </span>
              </div>
              <div className="hint">
                Load the latest 50 rows for a table. You can edit/delete directly in the results.
              </div>

              <div className="row">
                <div className="rowLeft">
                  <span className="label">Table</span>
                  <select
                    className="select"
                    value={tableKind}
                    onChange={(e) => setTableKind(e.target.value as any)}
                  >
                    <option value="TEXT_EVENTS">TEXT_EVENTS</option>
                    <option value="TEXT_LOGS">TEXT_LOGS</option>
                    <option value="IMAGE">IMAGE</option>
                  </select>

                  <button
                    className="btn btnNeon"
                    onClick={() => loadTable(tableKind)}
                    disabled={tableLoading}
                    type="button"
                  >
                    {tableLoading ? "Loading…" : "Load table"}
                  </button>
                </div>

                <div className="rowRight">
                  <span className="small">
                    Tip: this does not change layout — everything stays centered.
                  </span>
                </div>
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

                  {/* view toggle */}
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

                  {/* download */}
                  <button
                    className="btn btnNeon btnMini"
                    disabled={!canDownload}
                    onClick={() =>
                      downloadJsonFile(
                        `results_${lastKind ?? "UNKNOWN"}_${lastId ?? "noid"}.json`,
                        { id: lastId, kind: lastKind, rows }
                      )
                    }
                    title="Download the current results as JSON"
                    type="button"
                  >
                    Download JSON
                  </button>
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="small" style={{ padding: 16 }}>
                  No rows returned.
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
                        <th className="th">ACTIONS</th>
                      </tr>
                    </thead>

                    <tbody>
                      {rows.map((r, idx) => {
                        const k = activeKindForTable;
                        const key = rowKey(k as any, r);
                        const isEditing = editingKey === key;
                        const isBusy = rowBusyKey === key;

                        const idCol = k === "IMAGE" ? "ID" : "FILE_ID";
                        const pkVal = r?.[idCol];

                        return (
                          <tr key={key ?? idx}>
                            {columns.map((c) => {
                              const v = isEditing ? editDraft[c] : r?.[c];

                              // never edit PK column
                              const editable =
                                isEditing &&
                                c !== idCol &&
                                isEditableCell(r?.[c]);

                              return (
                                <td key={c} className="td">
                                  {editable ? (
                                    <input
                                      className="inlineInput"
                                      value={v ?? ""}
                                      onChange={(e) =>
                                        setEditDraft((prev) => ({
                                          ...prev,
                                          [c]: e.target.value,
                                        }))
                                      }
                                    />
                                  ) : (
                                    stringifyCell(v)
                                  )}
                                </td>
                              );
                            })}

                            <td className="td">
                              <div className="tdActions">
                                {k === "UNKNOWN" || pkVal === undefined || pkVal === null ? (
                                  <span className="small">No actions</span>
                                ) : isEditing ? (
                                  <>
                                    <button
                                      className="btn btnNeon btnMini"
                                      disabled={isBusy}
                                      onClick={() => saveEdit(k, r)}
                                      type="button"
                                    >
                                      {isBusy ? "Saving…" : "Save"}
                                    </button>
                                    <button
                                      className="btn btnGhost btnMini"
                                      disabled={isBusy}
                                      onClick={cancelEdit}
                                      type="button"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      className="btn btnGhost btnMini"
                                      disabled={isBusy || k === "UNKNOWN"}
                                      onClick={() => startEdit(k, r)}
                                      type="button"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      className="btn btnDanger btnMini"
                                      disabled={isBusy || k === "UNKNOWN"}
                                      onClick={() => deleteRow(k, r)}
                                      type="button"
                                    >
                                      {isBusy ? "Deleting…" : "Delete"}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="small" style={{ padding: "12px 4px 0" }}>
                    Inline editing updates primitive fields only (string/number/bool). Primary key is
                    not editable. Delete removes the row immediately from the UI.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}