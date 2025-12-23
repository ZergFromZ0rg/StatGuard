import { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { tdUtil, thUtil, utilBtn } from "./uiStyles";

export default function RegressionPanel({ numericColumns, file, api }) {
  const [xCols, setXCols] = useState([""]);
  const [yCol, setYCol] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedGraphs, setSelectedGraphs] = useState([{ id: 1, type: "predicted-actual", xCol: "" }]);

  useEffect(() => {
    setXCols([""]);
    setYCol("");
  }, [numericColumns]);

  const selectedX = xCols.filter(Boolean);

  const availableGraphs = [
    { type: "predicted-actual", label: "Predicted vs Actual" },
    { type: "residuals-fitted", label: "Residuals vs Fitted" },
    { type: "qq-plot", label: "Q-Q Plot" },
    { type: "scale-location", label: "Scale-Location" },
    { type: "residuals-leverage", label: "Residuals vs Leverage" },
    { type: "partial-dependence", label: "Partial Dependence" },
    { type: "coefficients-table", label: "Coefficients Table" },
  ];

  function addGraph() {
    const newId = Math.max(...selectedGraphs.map((g) => g.id), 0) + 1;
    setSelectedGraphs([...selectedGraphs, { id: newId, type: "predicted-actual", xCol: "" }]);
  }

  function removeGraph(id) {
    if (selectedGraphs.length > 1) {
      setSelectedGraphs(selectedGraphs.filter((g) => g.id !== id));
    }
  }

  function updateGraphType(id, newType) {
    setSelectedGraphs(
      selectedGraphs.map((g) => {
        if (g.id !== id) return g;
        if (newType === "partial-dependence") {
          return { ...g, type: newType, xCol: g.xCol || numericColumns[0] || "" };
        }
        return { ...g, type: newType };
      })
    );
  }

  function updateGraphXCol(id, xCol) {
    setSelectedGraphs(selectedGraphs.map((g) => (g.id === id ? { ...g, xCol } : g)));
  }

  async function run() {
    setErr("");
    setRes(null);
    setLoading(true);

    try {
      if (!file) throw new Error("No file available");
      if (!yCol) throw new Error("Select Y column");
      if (selectedX.length === 0) throw new Error("Select at least one X column");

      const form = new FormData();
      form.append("file", file);
      selectedX.forEach((col) => form.append("x_cols", col));
      form.append("y_col", yCol);

      const r = await fetch(`${api}/regress`, {
        method: "POST",
        body: form,
      });

      if (!r.ok) throw new Error(`Request failed (HTTP ${r.status})`);

      const json = await r.json();

      if (json.error) {
        setErr(json.error);
      } else {
        setRes(json);
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (numericColumns.length < 2) {
    return <div style={{ fontSize: 11 }}>Need at least 2 numeric columns.</div>;
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700 }}>MULTIPLE LINEAR REGRESSION</h3>

      {err && (
        <div
          style={{
            padding: 6,
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            fontSize: 11,
            color: "var(--danger-text)",
            marginBottom: 10,
          }}
        >
          {err}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12 }}>
        {/* LEFT: Controls */}
        <div style={{ border: "1px solid var(--border)", background: "var(--panel-alt)", height: "fit-content" }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", background: "var(--panel-strong)", fontSize: 12, fontWeight: 700 }}>
            MODEL CONFIGURATION
          </div>
          <div style={{ padding: 8 }}>
            {/* Y Selection */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>Y (OUTCOME)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {numericColumns.map((col) => {
                  const locked = selectedX.includes(col) && yCol !== col;
                  return (
                    <button
                      key={`y-${col}`}
                      type="button"
                      onClick={() => setYCol((prev) => (prev === col ? "" : col))}
                      disabled={loading || locked}
                      style={{
                        padding: "3px 8px",
                        fontSize: 10,
                        border: "1px solid var(--border-strong)",
                        background: yCol === col ? "var(--accent-strong)" : "var(--panel)",
                        color: yCol === col ? "var(--panel)" : "var(--text)",
                        cursor: locked ? "not-allowed" : "pointer",
                        opacity: locked ? 0.4 : 1,
                        fontFamily: "monospace",
                      }}
                    >
                      {col}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* X Selection */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>X (PREDICTORS)</label>
              {xCols.map((value, idx) => {
                const takenByOthers = xCols.filter((col, i) => i !== idx && col);
                return (
                  <div key={`x-slot-${idx}`} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>X{idx + 1}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {numericColumns.map((col) => {
                        const locked = (col === yCol || takenByOthers.includes(col)) && col !== value;
                        return (
                          <button
                            key={`x-${idx}-${col}`}
                            type="button"
                            onClick={() =>
                              setXCols((prev) => {
                                const next = [...prev];
                                next[idx] = next[idx] === col ? "" : col;
                                return next;
                              })
                            }
                            disabled={loading || locked}
                            style={{
                              padding: "3px 8px",
                              fontSize: 10,
                              border: "1px solid var(--border-strong)",
                              background: value === col ? "var(--accent-strong)" : "var(--panel)",
                              color: value === col ? "var(--panel)" : "var(--text)",
                              cursor: locked ? "not-allowed" : "pointer",
                              opacity: locked ? 0.4 : 1,
                              fontFamily: "monospace",
                            }}
                          >
                            {col}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setXCols((prev) => [...prev, ""])}
                disabled={xCols.length >= numericColumns.length - 1}
                style={{ ...utilBtn, width: "100%", fontSize: 9, padding: "4px" }}
              >
                + ADD X
              </button>
            </div>

            {/* Run Button */}
            <button onClick={run} disabled={loading || selectedX.length === 0 || !yCol} style={{ ...utilBtn, width: "100%", marginBottom: 10 }}>
              {loading ? "RUNNING..." : "RUN REGRESSION"}
            </button>

            {/* Summary */}
            {res && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>SUMMARY</div>
                <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
                  <tbody>
                    <tr style={{ background: "var(--panel-strong)" }}>
                      <td style={{ padding: "3px 6px", fontWeight: 700 }}>n</td>
                      <td style={{ padding: "3px 6px", textAlign: "right" }}>{res.n}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "3px 6px", fontWeight: 700 }}>R²</td>
                      <td style={{ padding: "3px 6px", textAlign: "right" }}>{res.r2.toFixed(4)}</td>
                    </tr>
                    <tr style={{ background: "var(--panel-strong)" }}>
                      <td style={{ padding: "3px 6px", fontWeight: 700 }}>Adj. R²</td>
                      <td style={{ padding: "3px 6px", textAlign: "right" }}>{res.r2_adj.toFixed(4)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "3px 6px", fontWeight: 700 }}>F-stat</td>
                      <td style={{ padding: "3px 6px", textAlign: "right" }}>{res.f_statistic.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 10, marginBottom: 4 }}>COEFFICIENTS</div>
                <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
                  <tbody>
                    <tr style={{ background: "var(--panel-strong)" }}>
                      <td style={{ padding: "2px 4px" }}>Intercept</td>
                      <td style={{ padding: "2px 4px", textAlign: "right" }}>{res.intercept.toFixed(3)}</td>
                    </tr>
                    {Object.entries(res.coefficients).map(([col, coef], i) => {
                      const pval = res.p_values[col];
                      let sig = "";
                      if (pval < 0.001) sig = "***";
                      else if (pval < 0.01) sig = "**";
                      else if (pval < 0.05) sig = "*";

                      return (
                        <tr key={col} style={{ background: i % 2 === 0 ? "var(--panel)" : "var(--panel-strong)" }}>
                          <td style={{ padding: "2px 4px" }}>{col}</td>
                          <td style={{ padding: "2px 4px", textAlign: "right" }}>
                            {coef.toFixed(3)} {sig}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 10, marginBottom: 4 }}>ASSUMPTION TESTS</div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 6 }}>
                  Shapiro‑Wilk runs only for 3–5000 rows. For p‑values, &lt; 0.05 suggests a potential assumption violation.
                </div>
                <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
                  <tbody>
                    <tr style={{ background: "var(--panel-strong)" }}>
                      <td style={{ padding: "2px 4px" }}>Shapiro-Wilk (normality)</td>
                      <td style={{ padding: "2px 4px", textAlign: "right" }}>
                        {res.assumption_tests?.shapiro_wilk
                          ? res.assumption_tests.shapiro_wilk.p_value.toFixed(4)
                          : "n/a"}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "2px 4px" }}>Breusch-Pagan (homoscedasticity)</td>
                      <td style={{ padding: "2px 4px", textAlign: "right" }}>
                        {res.assumption_tests?.breusch_pagan
                          ? res.assumption_tests.breusch_pagan.p_value.toFixed(4)
                          : "n/a"}
                      </td>
                    </tr>
                    <tr style={{ background: "var(--panel-strong)" }}>
                      <td style={{ padding: "2px 4px" }}>Durbin-Watson (autocorrelation)</td>
                      <td style={{ padding: "2px 4px", textAlign: "right" }}>
                        {res.assumption_tests?.durbin_watson !== undefined
                          ? res.assumption_tests.durbin_watson.toFixed(3)
                          : "n/a"}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 10, marginBottom: 4 }}>VIF (MULTICOLLINEARITY)</div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 6 }}>
                  VIF &gt; 5 is often concerning; &gt; 10 is a strong red flag.
                </div>
                <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
                  <tbody>
                    {Object.entries(res.assumption_tests?.vif ?? {}).map(([col, vif], i) => (
                      <tr key={col} style={{ background: i % 2 === 0 ? "var(--panel)" : "var(--panel-strong)" }}>
                        <td style={{ padding: "2px 4px" }}>{col}</td>
                        <td style={{ padding: "2px 4px", textAlign: "right" }}>{vif.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Results */}
        <div>
          {res ? (
            <>
              {selectedGraphs.map((graph) => (
                <div key={graph.id} style={{ marginBottom: 10, border: "1px solid var(--border)" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "4px 8px",
                      background: "var(--panel-strong)",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <select
                        value={graph.type}
                        onChange={(e) => updateGraphType(graph.id, e.target.value)}
                        style={{
                          padding: "3px 6px",
                          fontSize: 10,
                          fontFamily: "monospace",
                          border: "1px solid var(--border-strong)",
                          background: "var(--panel)",
                          color: "var(--text)",
                        }}
                      >
                        {availableGraphs.map((g) => (
                          <option key={g.type} value={g.type}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                      {graph.type === "partial-dependence" && (
                        <select
                          value={graph.xCol || numericColumns[0] || ""}
                          onChange={(e) => updateGraphXCol(graph.id, e.target.value)}
                          style={{
                            padding: "3px 6px",
                            fontSize: 10,
                            fontFamily: "monospace",
                            border: "1px solid var(--border-strong)",
                            background: "var(--panel)",
                            color: "var(--text)",
                          }}
                        >
                          {numericColumns.map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {selectedGraphs.length > 1 && (
                      <button
                        onClick={() => removeGraph(graph.id)}
                        style={{
                          padding: "2px 8px",
                          border: "1px solid var(--border-strong)",
                          background: "var(--danger-bg)",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div style={{ padding: 8, background: "var(--panel)" }}>
                    {renderGraph(graph.type, res, graph.xCol)}
                  </div>
                </div>
              ))}

              <button onClick={addGraph} style={{ ...utilBtn, width: "100%", fontSize: 10 }}>
                + ADD GRAPH
              </button>
            </>
          ) : (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                border: "1px dashed var(--border)",
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              Configure model and run regression
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderGraph(type, res, xCol) {
  const plotConfig = {
    font: { family: "monospace", size: 10, color: "var(--text)" },
    margin: { l: 50, r: 20, t: 10, b: 50 },
    paper_bgcolor: "var(--panel)",
    plot_bgcolor: "var(--panel)",
  };

  switch (type) {
    case "predicted-actual":
      return (
        <Plot
          data={[
            {
              x: res.y,
              y: res.fitted,
              mode: "markers",
              marker: { color: "var(--accent)", size: 4 },
            },
            {
              x: [Math.min(...res.y), Math.max(...res.y)],
              y: [Math.min(...res.y), Math.max(...res.y)],
              mode: "lines",
              line: { color: "var(--border-strong)", width: 1, dash: "dash" },
            },
          ]}
          layout={{
            ...plotConfig,
            height: 350,
            xaxis: { title: "Actual " + res.y_col },
            yaxis: { title: "Predicted " + res.y_col },
            showlegend: false,
          }}
          style={{ width: "100%" }}
          config={{ displayModeBar: false }}
        />
      );

    case "residuals-fitted":
      return (
        <Plot
          data={[
            {
              x: res.fitted,
              y: res.residuals,
              mode: "markers",
              marker: { color: "var(--accent)", size: 4 },
            },
            {
              x: [Math.min(...res.fitted), Math.max(...res.fitted)],
              y: [0, 0],
              mode: "lines",
              line: { color: "var(--border-strong)", width: 1, dash: "dash" },
            },
          ]}
          layout={{
            ...plotConfig,
            xaxis: { title: "Fitted values" },
            yaxis: { title: "Residuals" },
            height: 350,
            showlegend: false,
          }}
          style={{ width: "100%" }}
          config={{ displayModeBar: false }}
        />
      );

    case "qq-plot":
      return <DiagnosticQQPlot residuals={res.standardized_residuals} />;

    case "scale-location":
      return (
        <Plot
          data={[
            {
              x: res.fitted,
              y: res.standardized_residuals.map((r) => Math.sqrt(Math.abs(r))),
              mode: "markers",
              marker: { color: "var(--accent)", size: 4 },
            },
          ]}
          layout={{
            ...plotConfig,
            xaxis: { title: "Fitted values" },
            yaxis: { title: "√|Standardized Residuals|" },
            height: 350,
            showlegend: false,
          }}
          style={{ width: "100%" }}
          config={{ displayModeBar: false }}
        />
      );

    case "residuals-leverage":
      return (
        <Plot
          data={[
            {
              x: res.leverage,
              y: res.standardized_residuals,
              mode: "markers",
              marker: {
                color: res.cooks_distance,
                colorscale: [[0, "var(--border)"], [1, "var(--accent-strong)"]],
                size: 4,
                colorbar: { title: "Cook's D", titlefont: { size: 9 }, tickfont: { size: 8 } },
              },
            },
          ]}
          layout={{
            ...plotConfig,
            xaxis: { title: "Leverage" },
            yaxis: { title: "Standardized Residuals" },
            height: 350,
          }}
          style={{ width: "100%" }}
          config={{ displayModeBar: false }}
        />
      );

    case "partial-dependence": {
      const targetCol = xCol || res.x_cols?.[0];
      if (!targetCol || !res.x_data?.[targetCol]) {
        return <div style={{ fontSize: 11 }}>Select a predictor to plot.</div>;
      }
      const xVals = res.x_data[targetCol].slice().sort((a, b) => a - b);
      const uniqueX = Array.from(new Set(xVals));
      const base = Object.entries(res.coefficients).reduce((acc, [col, coef]) => {
        if (col === targetCol) return acc;
        return acc + coef * (res.x_means?.[col] ?? 0);
      }, res.intercept);
      const yVals = uniqueX.map((x) => base + res.coefficients[targetCol] * x);

      return (
        <Plot
          data={[
            {
              x: uniqueX,
              y: yVals,
              mode: "lines",
              line: { color: "var(--accent)", width: 2 },
            },
          ]}
          layout={{
            ...plotConfig,
            height: 350,
            xaxis: { title: targetCol },
            yaxis: { title: `Partial Dependence (${res.y_col})` },
            showlegend: false,
          }}
          style={{ width: "100%" }}
          config={{ displayModeBar: false }}
        />
      );
    }

    case "coefficients-table":
      return (
        <div style={{ fontSize: 11 }}>
          <div
            style={{
              padding: "6px 8px",
              background: "var(--panel-alt)",
              border: "1px solid var(--border)",
              fontFamily: "monospace",
              marginBottom: 10,
              fontSize: 10,
            }}
          >
            {res.y_col} = {res.intercept.toFixed(3)}
            {Object.entries(res.coefficients).map(([col, coef]) => (
              <span key={col}>
                {" "} + {coef.toFixed(3)}*{col}
              </span>
            ))}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, border: "1px solid var(--border)" }}>
            <thead>
              <tr style={{ background: "var(--panel-strong)" }}>
                <th style={thUtil}>Variable</th>
                <th style={thUtil}>Coefficient</th>
                <th style={thUtil}>p-value</th>
                <th style={thUtil}>Sig.</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--panel-alt)" }}>
                <td style={tdUtil}>Intercept</td>
                <td style={tdUtil}>{res.intercept.toFixed(4)}</td>
                <td style={tdUtil}>-</td>
                <td style={tdUtil}>-</td>
              </tr>
              {Object.entries(res.coefficients).map(([col, coef], i) => {
                const pval = res.p_values[col];
                let sig = "";
                if (pval < 0.001) sig = "***";
                else if (pval < 0.01) sig = "**";
                else if (pval < 0.05) sig = "*";
                else sig = "n.s.";

                return (
                  <tr key={col} style={{ background: i % 2 === 0 ? "var(--panel)" : "var(--panel-alt)" }}>
                    <td style={tdUtil}>{col}</td>
                    <td style={tdUtil}>{coef.toFixed(4)}</td>
                    <td style={tdUtil}>{pval < 0.001 ? "<0.001" : pval.toFixed(4)}</td>
                    <td style={tdUtil}>{sig}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 9, color: "var(--text-muted)", margin: "6px 0 0 0" }}>
            *** p&lt;0.001 | ** p&lt;0.01 | * p&lt;0.05 | n.s. = not significant
          </p>
        </div>
      );

    default:
      return <div style={{ fontSize: 11 }}>Unknown graph type</div>;
  }
}

function DiagnosticQQPlot({ residuals }) {
  const sorted = [...residuals].sort((a, b) => a - b);
  const n = sorted.length;

  function erfInv(x) {
    const a = 0.147;
    const ln = Math.log(1 - x * x);
    const part1 = 2 / (Math.PI * a) + ln / 2;
    const part2 = ln / a;
    const sign = x < 0 ? -1 : 1;
    return sign * Math.sqrt(Math.sqrt(part1 * part1 - part2) - part1);
  }

  const theoretical = sorted.map((_, i) => {
    const p = (i + 0.5) / n;
    return Math.sqrt(2) * erfInv(2 * p - 1);
  });

  return (
    <Plot
      data={[
        {
          x: theoretical,
          y: sorted,
          mode: "markers",
          marker: { color: "var(--accent)", size: 4 },
        },
        {
          x: [Math.min(...theoretical), Math.max(...theoretical)],
          y: [Math.min(...theoretical), Math.max(...theoretical)],
          mode: "lines",
          line: { color: "var(--border-strong)", width: 1, dash: "dash" },
        },
      ]}
      layout={{
        xaxis: { title: "Theoretical Quantiles" },
        yaxis: { title: "Standardized Residuals" },
        height: 350,
        showlegend: false,
        font: { family: "monospace", size: 10, color: "var(--text)" },
        margin: { l: 50, r: 20, t: 10, b: 50 },
      }}
      style={{ width: "100%" }}
      config={{ displayModeBar: false }}
    />
  );
}
