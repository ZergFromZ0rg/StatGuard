import { useState } from "react";
import { utilBtn, thUtil, tdUtil } from "./uiStyles";

const TESTS = [
  { value: "two_sample_t", label: "Two-sample t-test" },
  { value: "paired_t", label: "Paired t-test" },
  { value: "anova", label: "One-way ANOVA" },
];

export default function PowerAnalysisPanel({ api }) {
  const [testType, setTestType] = useState(TESTS[0].value);
  const [mode, setMode] = useState("required_n");
  const [effectSize, setEffectSize] = useState("0.5");
  const [alpha, setAlpha] = useState("0.05");
  const [power, setPower] = useState("0.8");
  const [n, setN] = useState("");
  const [groups, setGroups] = useState("2");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  async function run() {
    setErr("");
    setResult(null);
    setLoading(true);

    try {
      const form = new FormData();
      form.append("test_type", testType);
      form.append("mode", mode);
      form.append("effect_size", effectSize);
      form.append("alpha", alpha);
      form.append("power", power);
      form.append("n", n);
      form.append("groups", groups);

      const res = await fetch(`${api}/power`, { method: "POST", body: form });
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
      <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700 }}>POWER ANALYSIS</h3>
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
            <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>TEST TYPE</label>
            <select
              value={testType}
              onChange={(e) => setTestType(e.target.value)}
              style={{ padding: "4px 6px", fontSize: 10, border: "1px solid var(--border-strong)", background: "var(--panel)", width: "100%", marginBottom: 10 }}
            >
              {TESTS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>MODE</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{ padding: "4px 6px", fontSize: 10, border: "1px solid var(--border-strong)", background: "var(--panel)", width: "100%", marginBottom: 10 }}
            >
              <option value="required_n">Required sample size</option>
              <option value="post_hoc">Post-hoc power</option>
            </select>

            <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>EFFECT SIZE</label>
            <input
              type="number"
              step="0.01"
              value={effectSize}
              onChange={(e) => setEffectSize(e.target.value)}
              style={{ width: "100%", padding: "4px 6px", fontSize: 10, border: "1px solid var(--border-strong)", marginBottom: 10 }}
            />

            <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>ALPHA</label>
            <input
              type="number"
              step="0.01"
              value={alpha}
              onChange={(e) => setAlpha(e.target.value)}
              style={{ width: "100%", padding: "4px 6px", fontSize: 10, border: "1px solid var(--border-strong)", marginBottom: 10 }}
            />

            <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>TARGET POWER</label>
            <input
              type="number"
              step="0.01"
              value={power}
              onChange={(e) => setPower(e.target.value)}
              style={{ width: "100%", padding: "4px 6px", fontSize: 10, border: "1px solid var(--border-strong)", marginBottom: 10 }}
            />

            {mode === "post_hoc" && (
              <>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>
                  {testType === "anova" ? "SAMPLE SIZE PER GROUP" : "SAMPLE SIZE"}
                </label>
                <input
                  type="number"
                  step="1"
                  value={n}
                  onChange={(e) => setN(e.target.value)}
                  style={{ width: "100%", padding: "4px 6px", fontSize: 10, border: "1px solid var(--border-strong)", marginBottom: 10 }}
                />
              </>
            )}

            {testType === "anova" && (
              <>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>GROUPS</label>
                <input
                  type="number"
                  step="1"
                  value={groups}
                  onChange={(e) => setGroups(e.target.value)}
                  style={{ width: "100%", padding: "4px 6px", fontSize: 10, border: "1px solid var(--border-strong)", marginBottom: 10 }}
                />
              </>
            )}

            <button onClick={run} disabled={loading} style={{ ...utilBtn, width: "100%" }}>
              {loading ? "RUNNING..." : "RUN POWER"}
            </button>
          </div>
        </div>

        <div>
          {result ? (
            <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>RESULTS</div>
              <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
                <tbody>
                  {result.n !== undefined && (
                    <tr>
                      <td style={tdUtil}>Required n</td>
                      <td style={{ ...tdUtil, textAlign: "right" }}>{result.n.toFixed(2)}</td>
                    </tr>
                  )}
                  {result.n_per_group !== undefined && (
                    <tr>
                      <td style={tdUtil}>n per group</td>
                      <td style={{ ...tdUtil, textAlign: "right" }}>{result.n_per_group.toFixed(2)}</td>
                    </tr>
                  )}
                  {result.total_n !== undefined && (
                    <tr style={{ background: "var(--panel-strong)" }}>
                      <td style={tdUtil}>Total n</td>
                      <td style={{ ...tdUtil, textAlign: "right" }}>{result.total_n.toFixed(2)}</td>
                    </tr>
                  )}
                  {result.power !== undefined && (
                    <tr>
                      <td style={tdUtil}>Achieved power</td>
                      <td style={{ ...tdUtil, textAlign: "right" }}>{result.power.toFixed(4)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 8 }}>
                Use larger effect sizes or sample sizes to increase power.
              </div>
            </div>
          ) : (
            <div style={{ padding: 30, textAlign: "center", border: "1px dashed var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
              Configure settings to estimate power or sample size
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
