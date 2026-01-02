import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { utilBtn } from "./uiStyles";

export default function VisualizationsPanel({ numericColumns, api, file, onReportUpdate }) {
  const [selectedCols, setSelectedCols] = useState(numericColumns.slice(0, 4));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState(null);

  useEffect(() => {
    if (!res) return;
    onReportUpdate?.({ res });
  }, [res, onReportUpdate]);

  const selections = useMemo(() => {
    const map = new Set(selectedCols);
    return numericColumns.map((col) => ({ col, checked: map.has(col) }));
  }, [numericColumns, selectedCols]);

  function toggleColumn(col) {
    setSelectedCols((prev) => {
      if (prev.includes(col)) return prev.filter((c) => c !== col);
      if (prev.length >= 6) return prev;
      return [...prev, col];
    });
  }

  async function run() {
    setErr("");
    setRes(null);
    setLoading(true);

    try {
      if (!file) throw new Error("No file available");
      if (selectedCols.length === 0) throw new Error("Select at least one column");

      const form = new FormData();
      form.append("file", file);
      selectedCols.forEach((col) => form.append("columns", col));

      const r = await fetch(`${api}/visualizations`, { method: "POST", body: form });
      if (!r.ok) throw new Error(`Request failed (HTTP ${r.status})`);
      const json = await r.json();
      if (json.error) throw new Error(json.error);
      setRes(json);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700 }}>VISUALIZATIONS</h3>
      {err && (
        <div style={{ padding: 6, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", fontSize: 11, color: "var(--danger-text)", marginBottom: 10 }}>
          {err}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12 }}>
        <div style={{ border: "1px solid var(--border)", background: "var(--panel-alt)", height: "fit-content" }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", background: "var(--panel-strong)", fontSize: 12, fontWeight: 700 }}>
            COLUMNS
          </div>
          <div style={{ padding: 8 }}>
            <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 6 }}>Select up to 6 numeric columns.</div>
            <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--border)", background: "var(--panel)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <tbody>
                  {selections.map(({ col, checked }, i) => (
                    <tr key={col} style={{ background: i % 2 === 0 ? "var(--panel-alt)" : "var(--panel)" }}>
                      <td style={{ padding: "4px 6px" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleColumn(col)} />
                          {col}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={run} disabled={loading} style={{ ...utilBtn, width: "100%", marginTop: 10 }}>
              {loading ? "LOADING..." : "RUN VISUALS"}
            </button>
          </div>
        </div>

        <div>
          {res ? (
            <div>
              <div style={{ border: "1px solid var(--border)", marginBottom: 12 }}>
                <div style={{ padding: "6px 8px", background: "var(--panel-strong)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700 }}>
                  SCATTER MATRIX
                </div>
                <div style={{ padding: 8, background: "var(--panel)" }}>
                  <Plot
                    data={[
                      {
                        type: "splom",
                        dimensions: res.columns.map((col) => ({ label: col, values: res.scatter_matrix[col] })),
                        marker: { color: "var(--accent)", size: 4, opacity: 0.7 },
                      },
                    ]}
                    layout={{
                      height: 480,
                      margin: { l: 90, r: 30, t: 20, b: 90 },
                      paper_bgcolor: "var(--panel)",
                      plot_bgcolor: "var(--panel)",
                      font: { family: "monospace", size: 9, color: "var(--text)" },
                      xaxis: { tickangle: -45, automargin: true, tickfont: { size: 8 } },
                      yaxis: { automargin: true, tickfont: { size: 8 } },
                    }}
                    style={{ width: "100%" }}
                    config={{ displayModeBar: false }}
                  />
                </div>
              </div>

              <div style={{ border: "1px solid var(--border)", marginBottom: 12 }}>
                <div style={{ padding: "6px 8px", background: "var(--panel-strong)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700 }}>
                  VIOLIN PLOTS
                </div>
                <div style={{ padding: 8, background: "var(--panel)" }}>
                  <Plot
                    data={res.columns.map((col, i) => ({
                      type: "violin",
                      y: res.scatter_matrix[col],
                      name: col,
                      box: { visible: true },
                      meanline: { visible: true },
                      line: { color: "var(--accent)" },
                      fillcolor: "var(--accent-soft)",
                      opacity: 0.7,
                    }))}
                    layout={{
                      height: 320,
                      margin: { l: 70, r: 20, t: 10, b: 60 },
                      paper_bgcolor: "var(--panel)",
                      plot_bgcolor: "var(--panel)",
                      font: { family: "monospace", size: 10, color: "var(--text)" },
                    }}
                    style={{ width: "100%" }}
                    config={{ displayModeBar: false }}
                  />
                </div>
              </div>

              <div style={{ border: "1px solid var(--border)" }}>
                <div style={{ padding: "6px 8px", background: "var(--panel-strong)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700 }}>
                  DENSITY + RUG
                </div>
                <div style={{ padding: 8, background: "var(--panel)" }}>
                  <Plot
                    data={res.columns.flatMap((col, i) => {
                      const d = res.density[col];
                      const color = i % 2 === 0 ? "var(--accent)" : "var(--accent-strong)";
                      return [
                        {
                          x: d.kde.x,
                          y: d.kde.y,
                          mode: "lines",
                          line: { color, width: 2 },
                          name: col,
                        },
                        {
                          x: d.rug,
                          y: d.rug.map(() => 0),
                          mode: "markers",
                          marker: { color, size: 4, symbol: "line-ns-open" },
                          showlegend: false,
                        },
                      ];
                    })}
                    layout={{
                      height: 320,
                      margin: { l: 70, r: 20, t: 10, b: 60 },
                      paper_bgcolor: "var(--panel)",
                      plot_bgcolor: "var(--panel)",
                      font: { family: "monospace", size: 10, color: "var(--text)" },
                      showlegend: true,
                      xaxis: { title: "Value" },
                      yaxis: { title: "Density", automargin: true },
                    }}
                    style={{ width: "100%" }}
                    config={{ displayModeBar: false }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 30, textAlign: "center", border: "1px dashed var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
              Select columns and run the visualizations
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
