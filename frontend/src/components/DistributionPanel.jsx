import { useState } from "react";
import Plot from "react-plotly.js";
import { utilBtn } from "./uiStyles";

export default function DistributionPanel({ numericColumns, api, file }) {
  const [column, setColumn] = useState("");
  const [bins, setBins] = useState(20);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  async function run() {
    setErr("");
    setResult(null);
    setLoading(true);

    try {
      if (!file) throw new Error("No file available");
      if (!column) throw new Error("Select a numeric column");
      const form = new FormData();
      form.append("file", file);
      form.append("column", column);
      form.append("bins", bins.toString());

      const res = await fetch(`${api}/distribution`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setResult(json);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700 }}>DISTRIBUTION ANALYSIS</h3>
      {err && (
        <div style={{ padding: 6, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", fontSize: 11, color: "var(--danger-text)", marginBottom: 10 }}>
          {err}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12 }}>
        <div style={{ border: "1px solid var(--border)", background: "var(--panel-alt)", height: "fit-content" }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", background: "var(--panel-strong)", fontSize: 12, fontWeight: 700 }}>
            SETTINGS
          </div>
          <div style={{ padding: 8 }}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>NUMERIC COLUMN</label>
            <select
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              style={{
                padding: "4px 6px",
                fontSize: 10,
                fontFamily: "monospace",
                border: "1px solid var(--border-strong)",
                background: "var(--panel)",
                color: "var(--text)",
                width: "100%",
                marginBottom: 10,
              }}
            >
              <option value="">Select column</option>
              {numericColumns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>

            <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>BINS</label>
            <input
              type="number"
              value={bins}
              onChange={(e) => setBins(parseInt(e.target.value, 10) || 10)}
              min={5}
              max={80}
              style={{ width: "100%", padding: "4px 6px", fontSize: 10, border: "1px solid var(--border-strong)", marginBottom: 10 }}
            />

            <button onClick={run} disabled={loading} style={{ ...utilBtn, width: "100%" }}>
              {loading ? "LOADING..." : "RUN ANALYSIS"}
            </button>
          </div>
        </div>

        <div>
          {result ? (
            <div>
              <div style={{ border: "1px solid var(--border)", marginBottom: 10 }}>
                <div style={{ padding: "6px 8px", background: "var(--panel-strong)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700 }}>
                  HISTOGRAM + NORMAL CURVE
                </div>
                <div style={{ padding: 8, background: "var(--panel)" }}>
                  <Plot
                    data={[
                      {
                        x: result.histogram.centers,
                        y: result.histogram.counts,
                        type: "bar",
                        marker: { color: "var(--accent-soft)", line: { color: "var(--accent)", width: 1 } },
                      },
                      {
                        x: result.normal_curve.x,
                        y: result.normal_curve.y,
                        type: "scatter",
                        mode: "lines",
                        line: { color: "var(--accent-strong)", width: 2 },
                      },
                    ]}
                    layout={{
                      height: 320,
                      margin: { l: 50, r: 20, t: 10, b: 50 },
                      paper_bgcolor: "var(--panel)",
                      plot_bgcolor: "var(--panel)",
                      font: { family: "monospace", size: 10, color: "var(--text)" },
                      showlegend: false,
                      xaxis: { title: result.column },
                      yaxis: { title: "Count" },
                    }}
                    style={{ width: "100%" }}
                    config={{ displayModeBar: false }}
                  />
                </div>
              </div>

              <div style={{ border: "1px solid var(--border)", marginBottom: 10 }}>
                <div style={{ padding: "6px 8px", background: "var(--panel-strong)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700 }}>
                  BOX PLOT
                </div>
                <div style={{ padding: 8, background: "var(--panel)" }}>
                  <Plot
                    data={[
                      {
                        y: result.boxplot.values,
                        type: "box",
                        marker: { color: "var(--accent)" },
                        boxpoints: "outliers",
                      },
                    ]}
                    layout={{
                      height: 240,
                      margin: { l: 50, r: 20, t: 10, b: 40 },
                      paper_bgcolor: "var(--panel)",
                      plot_bgcolor: "var(--panel)",
                      font: { family: "monospace", size: 10, color: "var(--text)" },
                      showlegend: false,
                      yaxis: { title: result.column },
                    }}
                    style={{ width: "100%" }}
                    config={{ displayModeBar: false }}
                  />
                </div>
              </div>

              <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>NORMALITY TEST</div>
                <div style={{ fontSize: 10, marginBottom: 4 }}>
                  Shapiro‑Wilk p‑value: {result.shapiro_wilk ? result.shapiro_wilk.p_value.toFixed(4) : "n/a"}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                  Shapiro‑Wilk runs only for 3–5000 rows. p &lt; 0.05 suggests non‑normal data.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 30, textAlign: "center", border: "1px dashed var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
              Choose a column and run the analysis
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
