import { useMemo, useState } from "react";
import "./App.css";
import AboutPanel from "./components/AboutPanel";
import AiDiagnosticsPanel from "./components/AiDiagnosticsPanel";
import InfoPanel from "./components/InfoPanel";
import HypothesisTestingPanel from "./components/HypothesisTestingPanel";
import DistributionPanel from "./components/DistributionPanel";
import OverviewPanel from "./components/OverviewPanel";
import RelationshipsPanel from "./components/RelationshipsPanel";
import RegressionPanel from "./components/RegressionPanel";

const API = "http://127.0.0.1:5000";

export default function App() {
  const [file, setFile] = useState(null);
  const [active, setActive] = useState("about");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function analyzeFile(selectedFile) {
    setErr("");
    setLoading(true);
    // Don't clear data - keep old data visible while loading

    try {
      if (!selectedFile) throw new Error("Pick a CSV first.");
      const form = new FormData();
      form.append("file", selectedFile);

      const res = await fetch(`${API}/analyze`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Analyze failed (HTTP ${res.status})`);

      const json = await res.json();
      setData(json);
      setActive("overview");
    } catch (e) {
      setErr(String(e));
      setData(null); // Only clear on error
    } finally {
      setLoading(false);
    }
  }

  async function analyze() {
    await analyzeFile(file);
  }

  const columns = data?.columns ?? [];
  const missing = data?.missing_by_column ?? {};
  const describe = data?.describe ?? null;
  const corr = data?.corr ?? null;
  const shape = data?.shape ?? null;
  const categoricalColumns = data?.categorical_columns ?? [];

  const numericColumns = useMemo(() => {
    if (!describe) return [];
    return Object.keys(describe);
  }, [describe]);

  return (
    <div style={{ width: "100%", minHeight: "100vh", padding: "12px", background: "var(--bg)", color: "var(--text)", fontFamily: "monospace" }}>
      <div style={{ maxWidth: "100%", margin: "0 auto", background: "var(--panel)", border: "1px solid var(--border)" }}>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--panel-strong)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", alignItems: "center", gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: 0.5 }}>CSV MATRIX</h1>
              <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "var(--text-muted)" }}>Statistical Analysis Tool</p>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                style={{
                  fontSize: 11,
                  width: "190px",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: "var(--text)",
                }}
              />
              <button
                onClick={analyze}
                disabled={loading || !file}
                style={{
                  padding: "6px 14px",
                  border: "1px solid var(--accent)",
                  background: "var(--accent-soft)",
                  cursor: loading || !file ? "not-allowed" : "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  width: "110px",
                  color: "var(--accent-strong)",
                  opacity: loading || !file ? 0.5 : 1,
                }}
              >
                <span style={{ visibility: loading ? "visible" : "hidden", position: loading ? "static" : "absolute" }}>ANALYZING</span>
                <span style={{ visibility: loading ? "hidden" : "visible", position: loading ? "absolute" : "static" }}>ANALYZE</span>
              </button>
            </div>
          </div>
        </div>

        {err && (
          <div style={{ padding: 8, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", fontSize: 11, color: "var(--danger-text)" }}>
            {err}
          </div>
        )}

        {/* Tab bar - always rendered to prevent layout shift */}
        {data && (
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--panel-alt)", minHeight: 32 }}>
            <TabUtil label="Info" active={active === "info"} onClick={() => setActive("info")} />
            <TabUtil label="AI Diagnostics" active={active === "ai-diagnostics"} onClick={() => setActive("ai-diagnostics")} />
            <TabUtil label="Data Overview" active={active === "overview"} onClick={() => setActive("overview")} />
            <TabUtil label="Relationships" active={active === "relationships"} onClick={() => setActive("relationships")} />
            <TabUtil label="Hypothesis Tests" active={active === "hypothesis"} onClick={() => setActive("hypothesis")} />
            <TabUtil label="Distribution" active={active === "distribution"} onClick={() => setActive("distribution")} />
            <TabUtil label="Regression" active={active === "regression"} onClick={() => setActive("regression")} />
          </div>
        )}

        {/* Content area - always render both, use CSS to show/hide */}
        <div style={{ padding: 12, minHeight: 200 }}>
          {/* Panels */}
          <div style={{ display: data ? "block" : "none", position: "relative" }}>
            {loading && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "rgba(246, 251, 246, 0.92)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 10,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                ANALYZING...
              </div>
            )}

            {data && (
              <>
                <div style={{ display: active === "overview" ? "block" : "none" }}>
                  <OverviewPanel
                    shape={shape}
                    columns={columns}
                    missing={missing}
                    numericColumns={numericColumns}
                    api={API}
                    onAnalyzeFile={analyzeFile}
                    onFileReplace={setFile}
                  />
                </div>
                <div style={{ display: active === "info" ? "block" : "none" }}>
                  <InfoPanel />
                </div>
                <div style={{ display: active === "relationships" ? "block" : "none" }}>
                  <RelationshipsPanel corr={corr} numericColumns={numericColumns} />
                </div>
                <div style={{ display: active === "hypothesis" ? "block" : "none" }}>
                  <HypothesisTestingPanel
                    columns={columns}
                    numericColumns={numericColumns}
                    categoricalColumns={categoricalColumns}
                    api={API}
                    file={file}
                  />
                </div>
                <div style={{ display: active === "distribution" ? "block" : "none" }}>
                  <DistributionPanel numericColumns={numericColumns} api={API} file={file} />
                </div>
                <div style={{ display: active === "regression" ? "block" : "none" }}>
                  <RegressionPanel numericColumns={numericColumns} file={file} api={API} />
                </div>
                <div style={{ display: active === "ai-diagnostics" ? "block" : "none" }}>
                  <AiDiagnosticsPanel />
                </div>
              </>
            )}
          </div>

          {!data && <AboutPanel showInstructions />}
        </div>
      </div>
    </div>
  );
}

function TabUtil({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 16px",
        border: "none",
        borderRight: "1px solid var(--border)",
        background: active ? "var(--panel)" : "var(--panel-alt)",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: active ? 700 : 400,
        fontFamily: "monospace",
        textTransform: "uppercase",
        letterSpacing: 1,
        color: active ? "var(--accent-strong)" : "var(--text-muted)",
      }}
    >
      {label}
    </button>
  );
}
