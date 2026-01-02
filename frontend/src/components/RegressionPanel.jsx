import { useEffect, useMemo, useState } from "react";
import { tdUtil, thUtil, utilBtn } from "./uiStyles";
import { buildRegressionGraph, renderRegressionGraph } from "./regressionGraphs.jsx";

export default function RegressionPanel({ numericColumns, columnRoles, file, api, onReportUpdate }) {
  const [xCols, setXCols] = useState([""]);
  const [yCol, setYCol] = useState("");
  const [modelType, setModelType] = useState("linear");
  const [threshold, setThreshold] = useState(0.5);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedGraphs, setSelectedGraphs] = useState([{ id: 1, type: "predicted-actual", xCol: "", xCol2: "" }]);

  const allowedPredictors = useMemo(() => {
    if (!columnRoles || Object.keys(columnRoles).length === 0) return numericColumns;
    return numericColumns.filter((col) => columnRoles[col] !== "identifier" && columnRoles[col] !== "outcome");
  }, [numericColumns, columnRoles]);

  const allowedOutcomes = useMemo(() => {
    if (!columnRoles || Object.keys(columnRoles).length === 0) return [];
    return numericColumns.filter((col) => columnRoles[col] === "outcome");
  }, [numericColumns, columnRoles]);

  useEffect(() => {
    setXCols((prev) => {
      const filtered = prev.filter((col) => !col || allowedPredictors.includes(col));
      return filtered.length ? filtered : [""];
    });
    setSelectedGraphs([{ id: 1, type: modelType === "logistic" ? "roc-curve" : "predicted-actual", xCol: "", xCol2: "" }]);
  }, [numericColumns, allowedPredictors, modelType]);

  useEffect(() => {
    if (allowedOutcomes.length === 1) {
      setYCol(allowedOutcomes[0]);
      return;
    }
    if (yCol && columnRoles?.[yCol] === "identifier") {
      setYCol("");
    }
  }, [allowedOutcomes, columnRoles, yCol]);

  useEffect(() => {
    setSelectedGraphs([{ id: 1, type: modelType === "logistic" ? "roc-curve" : "predicted-actual", xCol: "", xCol2: "" }]);
  }, [modelType]);

  useEffect(() => {
    if (!res) return;
    onReportUpdate?.({
      res,
      modelType,
      selectedGraphs,
      threshold,
    });
  }, [res, modelType, selectedGraphs, threshold, onReportUpdate]);

  const logisticMetrics = useMemo(() => {
    if (!res || modelType !== "logistic") return null;
    const probs = res.probabilities || [];
    const labels = res.y_true || [];
    if (probs.length === 0 || labels.length === 0) return null;

    let tp = 0;
    let tn = 0;
    let fp = 0;
    let fn = 0;
    for (let i = 0; i < probs.length; i += 1) {
      const pred = probs[i] >= threshold ? 1 : 0;
      const actual = labels[i];
      if (pred === 1 && actual === 1) tp += 1;
      if (pred === 0 && actual === 0) tn += 1;
      if (pred === 1 && actual === 0) fp += 1;
      if (pred === 0 && actual === 1) fn += 1;
    }

    const total = tp + tn + fp + fn;
    const accuracy = total ? (tp + tn) / total : 0;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;

    return { tp, tn, fp, fn, accuracy, precision, recall };
  }, [res, modelType, threshold]);

  const logisticRocPoint = useMemo(() => {
    if (!res || modelType !== "logistic") return null;
    const probs = res.probabilities || [];
    const labels = res.y_true || [];
    if (probs.length === 0 || labels.length === 0) return null;

    let tp = 0;
    let tn = 0;
    let fp = 0;
    let fn = 0;
    for (let i = 0; i < probs.length; i += 1) {
      const pred = probs[i] >= threshold ? 1 : 0;
      const actual = labels[i];
      if (pred === 1 && actual === 1) tp += 1;
      if (pred === 0 && actual === 0) tn += 1;
      if (pred === 1 && actual === 0) fp += 1;
      if (pred === 0 && actual === 1) fn += 1;
    }

    const tpr = tp + fn ? tp / (tp + fn) : 0;
    const fpr = fp + tn ? fp / (fp + tn) : 0;
    return { tpr, fpr, threshold };
  }, [res, modelType, threshold]);

  const selectedX = xCols.filter(Boolean);

  const availableGraphs = modelType === "logistic"
    ? [
        { type: "roc-curve", label: "ROC Curve" },
        { type: "confusion-matrix", label: "Confusion Matrix" },
        { type: "odds-ratios", label: "Odds Ratios" },
      ]
    : [
        { type: "predicted-actual", label: "Predicted vs Actual" },
        { type: "residuals-fitted", label: "Residuals vs Fitted" },
        { type: "qq-plot", label: "Q-Q Plot" },
        { type: "scale-location", label: "Scale-Location" },
        { type: "residuals-leverage", label: "Residuals vs Leverage" },
        { type: "partial-dependence", label: "Partial Dependence" },
        { type: "coefficients-table", label: "Coefficients Table" },
        { type: "regression-3d", label: "3D Regression" },
      ];

  function addGraph() {
    const newId = Math.max(...selectedGraphs.map((g) => g.id), 0) + 1;
    const defaultType = availableGraphs[0]?.type || "predicted-actual";
    setSelectedGraphs([...selectedGraphs, { id: newId, type: defaultType, xCol: "", xCol2: "" }]);
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
          const fallback = selectedX[0] || numericColumns[0] || "";
          return { ...g, type: newType, xCol: g.xCol || fallback };
        }
        if (newType === "regression-3d") {
          const fallback = selectedX[0] || numericColumns[0] || "";
          const fallback2 = selectedX[1] || selectedX[0] || numericColumns[1] || numericColumns[0] || "";
          return {
            ...g,
            type: newType,
            xCol: g.xCol || fallback,
            xCol2: g.xCol2 || fallback2,
          };
        }
        return { ...g, type: newType };
      })
    );
  }

  function updateGraphXCol(id, xCol) {
    setSelectedGraphs(selectedGraphs.map((g) => (g.id === id ? { ...g, xCol } : g)));
  }

  function updateGraphXCol2(id, xCol2) {
    setSelectedGraphs(selectedGraphs.map((g) => (g.id === id ? { ...g, xCol2 } : g)));
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

      const endpoint = modelType === "logistic" ? "logistic" : "regress";
      const r = await fetch(`${api}/${endpoint}`, {
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
  if (allowedPredictors.length === 0) {
    return <div style={{ fontSize: 11 }}>All numeric columns are marked as Identifier or Outcome. Select at least one Predictor.</div>;
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
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>MODEL TYPE</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setModelType("linear")}
                  style={{
                    ...utilBtn,
                    fontSize: 9,
                    padding: "4px 8px",
                    background: modelType === "linear" ? "var(--accent-strong)" : "var(--panel)",
                    color: modelType === "linear" ? "var(--panel)" : "var(--text)",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  LINEAR
                </button>
                <button
                  type="button"
                  onClick={() => setModelType("logistic")}
                  style={{
                    ...utilBtn,
                    fontSize: 9,
                    padding: "4px 8px",
                    background: modelType === "logistic" ? "var(--accent-strong)" : "var(--panel)",
                    color: modelType === "logistic" ? "var(--panel)" : "var(--text)",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  LOGISTIC
                </button>
              </div>
            </div>
            {modelType === "logistic" && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>THRESHOLD</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <span style={{ fontSize: 10, width: 36, textAlign: "right" }}>{threshold.toFixed(2)}</span>
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>
                  Lower threshold increases recall (catches more positives). Higher threshold increases precision (fewer false alarms).
                </div>
              </div>
            )}
            {/* Y Selection */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>Y (OUTCOME)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(numericColumns.filter((col) => columnRoles?.[col] !== "identifier") || numericColumns).map((col) => {
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
                      {(allowedPredictors.length > 0 ? allowedPredictors : numericColumns).map((col) => {
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
                disabled={xCols.length >= (allowedPredictors.length || numericColumns.length) - 1}
                style={{ ...utilBtn, width: "100%", fontSize: 9, padding: "4px" }}
              >
                + ADD X
              </button>
            </div>

            {/* Run Button */}
            <button onClick={run} disabled={loading || selectedX.length === 0 || !yCol} style={{ ...utilBtn, width: "100%", marginBottom: 10 }}>
              {loading ? "RUNNING..." : "RUN MODEL"}
            </button>

            {/* Summary */}
            {res && modelType === "linear" && (
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
                  Shapiro‑Wilk is best for small to medium samples (roughly under 2000 rows). For p‑values, &lt; 0.05 suggests a potential assumption violation.
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
            {res && modelType === "logistic" && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>CLASSIFICATION SUMMARY</div>
                <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
                  <tbody>
                    <tr style={{ background: "var(--panel-strong)" }}>
                      <td style={{ padding: "3px 6px", fontWeight: 700 }}>Accuracy</td>
                      <td style={{ padding: "3px 6px", textAlign: "right" }}>{(logisticMetrics?.accuracy ?? res.accuracy).toFixed(4)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "3px 6px", fontWeight: 700 }}>Precision</td>
                      <td style={{ padding: "3px 6px", textAlign: "right" }}>{(logisticMetrics?.precision ?? res.precision).toFixed(4)}</td>
                    </tr>
                    <tr style={{ background: "var(--panel-strong)" }}>
                      <td style={{ padding: "3px 6px", fontWeight: 700 }}>Recall</td>
                      <td style={{ padding: "3px 6px", textAlign: "right" }}>{(logisticMetrics?.recall ?? res.recall).toFixed(4)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "3px 6px", fontWeight: 700 }}>AUC</td>
                      <td style={{ padding: "3px 6px", textAlign: "right" }}>{res.roc?.auc.toFixed(4)}</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>
                  Precision favors fewer false positives. Recall favors catching more true positives.
                </div>
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
                        value={graph.xCol || selectedX[0] || numericColumns[0] || ""}
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
                        {(selectedX.length > 0 ? selectedX : numericColumns).map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    )}
                    {graph.type === "regression-3d" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <select
                          value={graph.xCol || selectedX[0] || numericColumns[0] || ""}
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
                          {(selectedX.length > 0 ? selectedX : numericColumns).map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                        <select
                          value={graph.xCol2 || selectedX[1] || selectedX[0] || numericColumns[1] || ""}
                          onChange={(e) => updateGraphXCol2(graph.id, e.target.value)}
                          style={{
                            padding: "3px 6px",
                            fontSize: 10,
                            fontFamily: "monospace",
                            border: "1px solid var(--border-strong)",
                            background: "var(--panel)",
                            color: "var(--text)",
                          }}
                        >
                          {(selectedX.length > 0 ? selectedX : numericColumns).map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                      </div>
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
                    {renderRegressionGraph(
                      buildRegressionGraph(graph.type, res, {
                        xCol: graph.xCol,
                        xCol2: graph.xCol2,
                        modelType,
                        logisticMetrics,
                        logisticRocPoint,
                      })
                    )}
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
