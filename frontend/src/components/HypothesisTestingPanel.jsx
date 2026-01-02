import { useEffect, useMemo, useState } from "react";
import { utilBtn, thUtil, tdUtil } from "./uiStyles";
import PowerAnalysisPanel from "./PowerAnalysisPanel";

const TESTS = [
  { value: "two_sample_t", label: "Two-sample t-test" },
  { value: "paired_t", label: "Paired t-test" },
  { value: "chi_square", label: "Chi-square test" },
  { value: "anova", label: "One-way ANOVA" },
];

export default function HypothesisTestingPanel({ columns, numericColumns, categoricalColumns, api, file, onReportUpdate }) {
  const [showPower, setShowPower] = useState(true);
  const [testType, setTestType] = useState(TESTS[0].value);
  const [columnA, setColumnA] = useState("");
  const [columnB, setColumnB] = useState("");
  const [groupCol, setGroupCol] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!result) return;
    onReportUpdate?.({ result, testType });
  }, [result, testType, onReportUpdate]);

  const nonNumericColumns = useMemo(() => {
    const detected = categoricalColumns && categoricalColumns.length > 0 ? categoricalColumns : null;
    return detected ?? columns.filter((col) => !numericColumns.includes(col));
  }, [columns, numericColumns, categoricalColumns]);

  async function runTest() {
    setErr("");
    setResult(null);
    setLoading(true);

    try {
      if (!file) throw new Error("No file available");
      const form = new FormData();
      form.append("file", file);
      form.append("test_type", testType);
      form.append("column_a", columnA);
      form.append("column_b", columnB);
      form.append("group_col", groupCol);

      const res = await fetch(`${api}/hypothesis`, { method: "POST", body: form });
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
      <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700 }}>HYPOTHESIS TESTING</h3>
      {err && (
        <div style={{ padding: 6, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", fontSize: 11, color: "var(--danger-text)", marginBottom: 10 }}>
          {err}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12 }}>
        <div style={{ border: "1px solid var(--border)", background: "var(--panel-alt)", height: "fit-content" }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", background: "var(--panel-strong)", fontSize: 12, fontWeight: 700 }}>
            TEST SETUP
          </div>
          <div style={{ padding: 8 }}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>TEST TYPE</label>
            <select
              value={testType}
              onChange={(e) => setTestType(e.target.value)}
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
              {TESTS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            {(testType === "two_sample_t" || testType === "anova") && (
              <>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>NUMERIC COLUMN</label>
                <select
                  value={columnA}
                  onChange={(e) => setColumnA(e.target.value)}
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
                <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>GROUP COLUMN</label>
                <select
                  value={groupCol}
                  onChange={(e) => setGroupCol(e.target.value)}
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
                  {nonNumericColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </>
            )}

            {testType === "paired_t" && (
              <>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>COLUMN A</label>
                <select
                  value={columnA}
                  onChange={(e) => setColumnA(e.target.value)}
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
                <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>COLUMN B</label>
                <select
                  value={columnB}
                  onChange={(e) => setColumnB(e.target.value)}
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
              </>
            )}

            {testType === "chi_square" && (
              <>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>COLUMN A</label>
                <select
                  value={columnA}
                  onChange={(e) => setColumnA(e.target.value)}
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
                  {(nonNumericColumns.length > 0 ? nonNumericColumns : columns).map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>COLUMN B</label>
                <select
                  value={columnB}
                  onChange={(e) => setColumnB(e.target.value)}
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
                  {(nonNumericColumns.length > 0 ? nonNumericColumns : columns).map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </>
            )}

            <button onClick={runTest} disabled={loading} style={{ ...utilBtn, width: "100%" }}>
              {loading ? "RUNNING..." : "RUN TEST"}
            </button>
          </div>
        </div>

        <div>
          {result ? (
            <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>RESULTS</div>
              <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
                <tbody>
                  <tr style={{ background: "var(--panel-strong)" }}>
                    <td style={tdUtil}>Test</td>
                    <td style={{ ...tdUtil, textAlign: "right" }}>{result.test}</td>
                  </tr>
                  {result.stat !== undefined && (
                    <tr>
                      <td style={tdUtil}>Statistic</td>
                      <td style={{ ...tdUtil, textAlign: "right" }}>{result.stat.toFixed(4)}</td>
                    </tr>
                  )}
                  {result.chi2 !== undefined && (
                    <tr>
                      <td style={tdUtil}>Chi-square</td>
                      <td style={{ ...tdUtil, textAlign: "right" }}>{result.chi2.toFixed(4)}</td>
                    </tr>
                  )}
                  {result.p_value !== undefined && (
                    <tr style={{ background: "var(--panel-strong)" }}>
                      <td style={tdUtil}>p-value</td>
                      <td style={{ ...tdUtil, textAlign: "right" }}>{result.p_value.toFixed(4)}</td>
                    </tr>
                  )}
                  {result.dof !== undefined && (
                    <tr>
                      <td style={tdUtil}>DoF</td>
                      <td style={{ ...tdUtil, textAlign: "right" }}>{result.dof}</td>
                    </tr>
                  )}
                  {result.n !== undefined && (
                    <tr>
                      <td style={tdUtil}>n</td>
                      <td style={{ ...tdUtil, textAlign: "right" }}>{result.n}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {result.group_stats && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>GROUPS</div>
                  <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--panel-strong)" }}>
                        <th style={thUtil}>Group</th>
                        <th style={{ ...thUtil, textAlign: "right" }}>n</th>
                        <th style={{ ...thUtil, textAlign: "right" }}>Mean</th>
                        <th style={{ ...thUtil, textAlign: "right" }}>Std</th>
                        <th style={{ ...thUtil, textAlign: "right" }}>95% CI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.group_labels || Object.keys(result.group_stats || {})).map((label, i) => (
                        <tr key={label} style={{ background: i % 2 === 0 ? "var(--panel)" : "var(--panel-alt)" }}>
                          <td style={tdUtil}>{label}</td>
                          <td style={{ ...tdUtil, textAlign: "right" }}>{result.group_stats?.[label]?.n ?? result.group_sizes?.[i] ?? ""}</td>
                          <td style={{ ...tdUtil, textAlign: "right" }}>
                            {result.group_stats?.[label]?.mean !== undefined ? result.group_stats[label].mean.toFixed(4) : ""}
                          </td>
                          <td style={{ ...tdUtil, textAlign: "right" }}>
                            {result.group_stats?.[label]?.std !== undefined ? result.group_stats[label].std.toFixed(4) : ""}
                          </td>
                          <td style={{ ...tdUtil, textAlign: "right" }}>
                            {result.group_stats?.[label]?.ci_mean
                              ? `${result.group_stats[label].ci_mean.low.toFixed(4)} to ${result.group_stats[label].ci_mean.high.toFixed(4)}`
                              : "n/a"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(result.effect_size || result.ci_mean_diff) && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>EFFECT SIZE & CI</div>
                  <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
                    <tbody>
                      {result.effect_size?.cohens_d !== undefined && (
                        <tr style={{ background: "var(--panel-strong)" }}>
                          <td style={tdUtil}>Cohen's d</td>
                          <td style={{ ...tdUtil, textAlign: "right" }}>
                            {result.effect_size.cohens_d === null ? "n/a" : result.effect_size.cohens_d.toFixed(3)}
                          </td>
                        </tr>
                      )}
                      {result.effect_size?.eta_squared !== undefined && (
                        <tr style={{ background: "var(--panel-strong)" }}>
                          <td style={tdUtil}>Eta-squared</td>
                          <td style={{ ...tdUtil, textAlign: "right" }}>
                            {result.effect_size.eta_squared === null ? "n/a" : result.effect_size.eta_squared.toFixed(3)}
                          </td>
                        </tr>
                      )}
                      {result.effect_size?.cramers_v !== undefined && (
                        <tr style={{ background: "var(--panel-strong)" }}>
                          <td style={tdUtil}>Cramér's V</td>
                          <td style={{ ...tdUtil, textAlign: "right" }}>
                            {result.effect_size.cramers_v === null ? "n/a" : result.effect_size.cramers_v.toFixed(3)}
                          </td>
                        </tr>
                      )}
                      {result.ci_mean_diff && (
                        <tr>
                          <td style={tdUtil}>95% CI (mean diff)</td>
                          <td style={{ ...tdUtil, textAlign: "right" }}>
                            {result.ci_mean_diff.low.toFixed(4)} to {result.ci_mean_diff.high.toFixed(4)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 8 }}>
                p-value &lt; 0.05 is commonly used as evidence of a meaningful difference.
              </div>
            </div>
          ) : (
            <div style={{ padding: 30, textAlign: "center", border: "1px dashed var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
              Configure a test and run it to see results
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16, border: "1px solid var(--border)", background: "var(--panel-alt)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderBottom: "1px solid var(--border)", background: "var(--panel-strong)" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>POWER ANALYSIS</div>
          <button
            type="button"
            onClick={() => setShowPower((prev) => !prev)}
            style={{ ...utilBtn, fontSize: 9, padding: "3px 8px" }}
          >
            {showPower ? "HIDE" : "SHOW"}
          </button>
        </div>
        {showPower && (
          <div style={{ padding: 10 }}>
            <PowerAnalysisPanel api={api} />
          </div>
        )}
      </div>
    </div>
  );
}
