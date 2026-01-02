import { useMemo } from "react";
import { utilBtn, thUtil, tdUtil } from "./uiStyles";
import {
  buildFinalDataset,
  buildReportMarkdown,
  chiSquareTest,
  mean,
  olsRegression,
  oneWayANOVA,
  pearsonCorrelation,
  std,
  tTest2Sample,
  toCsv,
} from "./phase5Utils";

function downloadFile(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ValidityBanner({ status, reasons = [] }) {
  const label = status === "green" ? "✅ OK" : status === "yellow" ? "⚠ Caution" : "⛔ Not reliable";
  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {reasons.map((reason) => (
        <div key={reason} style={{ fontSize: 11 }}>• {reason}</div>
      ))}
    </div>
  );
}

export default function ResultsPanel({ bundle, onBackToPhase2, onBackToPhase3, onBackToPhase4 }) {
  const finalDataset = useMemo(() => {
    if (!bundle) return null;
    return buildFinalDataset(bundle);
  }, [bundle]);

  const { results, error } = useMemo(() => {
    let localError = "";
    if (!bundle || !finalDataset) return { results: null, error: "" };
    if (finalDataset.error) {
      localError = finalDataset.error;
      return { results: null, error: localError };
    }
    if (!bundle.phase4?.diagnosticsRun) return { results: null, error: "" };

    const intent = bundle.intent;
    const data = finalDataset.data;
    if (data.length < 5) {
      localError = "Too few rows after preparation to produce reliable results.";
      return { results: null, error: localError };
    }

    if (intent.type === "predict") {
      const outcome = intent.predict.outcome;
      const predictors = intent.predict.predictors;
      if (!predictors.length) {
        localError = "No predictors available. Go back to Phase 3.";
        return { results: null, error: localError };
      }
      const regression = olsRegression(data, outcome, predictors, bundle.preparedDatasetState.columns);
      if (regression.error) {
        localError = regression.error;
        return { results: null, error: localError };
      }
      const top = [...regression.coefTable]
        .filter((row) => row.term !== "Intercept")
        .sort((a, b) => Math.abs(b.t_value) - Math.abs(a.t_value))
        .slice(0, 3);
      const summaryText = [
        `Outcome: ${outcome}. Predictors: ${predictors.join(", ")}.`,
        `Model explains ${(regression.modelStats.r2 * 100).toFixed(1)}% of variance (Adj R^2 = ${(regression.modelStats.adjR2 * 100).toFixed(1)}%).`,
        top.length ? `Most influential predictors: ${top.map((t) => `${t.term} (${t.estimate.toFixed(3)})`).join(", ")}.` : "No strong predictors detected.",
      ].join(" ");

      return {
        results: {
          intentType: "predict",
          summaryText,
          tables: {
            coefficients: regression.coefTable,
            modelStats: regression.modelStats,
          },
          plotsData: {
            residuals: regression.residuals,
            fitted: regression.fitted,
            qq: regression.qq,
          },
          metrics: regression.modelStats,
          warnings: regression.warnings,
        },
        error: localError,
      };
    }

    if (intent.type === "compare_means") {
      const outcome = intent.compare_means.outcome;
      const group = intent.compare_means.group;
      const groups = {};
      data.forEach((row) => {
        const g = String(row[group]);
        const v = Number(row[outcome]);
        if (!Number.isFinite(v)) return;
        if (!groups[g]) groups[g] = [];
        groups[g].push(v);
      });
      const groupNames = Object.keys(groups);
      const summary = groupNames.map((g) => ({
        group: g,
        n: groups[g].length,
        mean: mean(groups[g]),
        std: std(groups[g]),
      }));
      let test = null;
      if (groupNames.length === 2) {
        test = tTest2Sample(groups[groupNames[0]], groups[groupNames[1]]);
      } else {
        test = oneWayANOVA(groupNames.map((g) => groups[g]));
      }
      const summaryText = `Compared ${outcome} across ${groupNames.length} groups of ${group}.`;
      return {
        results: {
          intentType: "compare_means",
          summaryText,
          tables: { groupSummary: summary, test },
          plotsData: { boxplot: summary },
          metrics: test,
          warnings: [],
        },
        error: localError,
      };
    }

    if (intent.type === "association") {
      const { varA, varB } = intent.association;
      const colInfo = Object.fromEntries(bundle.preparedDatasetState.columns.map((c) => [c.name, c]));
      const typeA = colInfo[varA]?.detectedType;
      const typeB = colInfo[varB]?.detectedType;
      if (typeA === "categorical" && typeB === "categorical") {
        const levelsA = Array.from(new Set(data.map((row) => String(row[varA]))));
        const levelsB = Array.from(new Set(data.map((row) => String(row[varB]))));
        const table = levelsA.map(() => levelsB.map(() => 0));
        data.forEach((row) => {
          const i = levelsA.indexOf(String(row[varA]));
          const j = levelsB.indexOf(String(row[varB]));
          if (i >= 0 && j >= 0) table[i][j] += 1;
        });
        const test = chiSquareTest(table);
        return {
          results: {
            intentType: "association",
            summaryText: `Tested whether ${varA} is associated with ${varB}.`,
            tables: { contingency: { levelsA, levelsB, table }, test },
            plotsData: { heatmap: { levelsA, levelsB, table } },
            metrics: test,
            warnings: test.lowExpected ? ["Some expected counts are below 5."] : [],
          },
          error: localError,
        };
      }
      if (typeA === "numeric" && typeB === "numeric") {
        const xs = data.map((row) => Number(row[varA])).filter((v) => Number.isFinite(v));
        const ys = data.map((row) => Number(row[varB])).filter((v) => Number.isFinite(v));
        const corr = pearsonCorrelation(xs, ys);
        return {
          results: {
            intentType: "association",
            summaryText: `Association between ${varA} and ${varB}.`,
            tables: { correlation: corr },
            plotsData: { scatter: { x: xs, y: ys } },
            metrics: corr,
            warnings: [],
          },
          error: localError,
        };
      }
      const numericVar = typeA === "numeric" ? varA : varB;
      const catVar = typeA === "categorical" ? varA : varB;
      const groups = {};
      data.forEach((row) => {
        const g = String(row[catVar]);
        const v = Number(row[numericVar]);
        if (!Number.isFinite(v)) return;
        if (!groups[g]) groups[g] = [];
        groups[g].push(v);
      });
      const summary = Object.keys(groups).map((g) => ({
        group: g,
        n: groups[g].length,
        mean: mean(groups[g]),
        std: std(groups[g]),
      }));
      const test = Object.keys(groups).length === 2
        ? tTest2Sample(groups[Object.keys(groups)[0]], groups[Object.keys(groups)[1]])
        : oneWayANOVA(Object.keys(groups).map((g) => groups[g]));
      return {
        results: {
          intentType: "association",
          summaryText: `Compared numeric ${numericVar} across groups of ${catVar}.`,
          tables: { groupSummary: summary, test },
          plotsData: { boxplot: summary },
          metrics: test,
          warnings: [],
        },
        error: localError,
      };
    }
    return { results: null, error: localError };
  }, [bundle, finalDataset]);

  if (!bundle) return null;

  if (!bundle.phase4?.diagnosticsRun) {
    return (
      <div style={{ padding: 16, border: "1px solid var(--border)", background: "var(--panel-alt)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Run diagnostics in Phase 4 before viewing results.</div>
        <button type="button" onClick={onBackToPhase4} style={{ ...utilBtn, fontSize: 10 }}>
          Back to Phase 4
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 8 }}>
        <button type="button" onClick={onBackToPhase2} style={{ ...utilBtn, fontSize: 10 }}>Back to Phase 2</button>
        <button type="button" onClick={onBackToPhase3} style={{ ...utilBtn, fontSize: 10 }}>Back to Phase 3</button>
        <button type="button" onClick={onBackToPhase4} style={{ ...utilBtn, fontSize: 10 }}>Back to Phase 4</button>
      </div>

      {error && (
        <div style={{ padding: 10, border: "1px solid var(--danger-border)", background: "var(--danger-bg)", color: "var(--danger-text)", fontSize: 11, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ border: "1px solid var(--border)", background: "var(--panel-alt)", padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>SECTION 5.1 — CONCLUSION</div>
        <div style={{ fontSize: 11 }}>{results?.summaryText}</div>
      </div>

      <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>SECTION 5.2 — VALIDITY & TRUST</div>
        <ValidityBanner status={bundle.phase4.validityStatus} reasons={bundle.phase4.validityReasons} />
        <div style={{ fontSize: 10, marginTop: 6 }}>
          Diagnostics were run on: {bundle.phase4.adjustments?.transformOutcome !== "none" ? "transformed outcome" : "baseline"}{bundle.phase4.adjustments?.outlierMode === "exclude" ? ", outlier-excluded" : ""}.
        </div>
      </div>

      <div style={{ border: "1px solid var(--border)", background: "var(--panel-alt)", padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>SECTION 5.3 — KEY TABLES</div>
        {results?.tables?.coefficients && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Coefficients</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ background: "var(--panel-strong)" }}>
                  <th style={thUtil}>Term</th>
                  <th style={thUtil}>Estimate</th>
                  <th style={thUtil}>SE</th>
                  <th style={thUtil}>t</th>
                  <th style={thUtil}>p</th>
                </tr>
              </thead>
              <tbody>
                {results.tables.coefficients.map((row) => (
                  <tr key={row.term}>
                    <td style={tdUtil}>{row.term}</td>
                    <td style={tdUtil}>{row.estimate.toFixed(4)}</td>
                    <td style={tdUtil}>{row.std_error.toFixed(4)}</td>
                    <td style={tdUtil}>{row.t_value.toFixed(3)}</td>
                    <td style={tdUtil}>{row.p_value.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {results?.tables?.groupSummary && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Group summary</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ background: "var(--panel-strong)" }}>
                  <th style={thUtil}>Group</th>
                  <th style={thUtil}>n</th>
                  <th style={thUtil}>Mean</th>
                  <th style={thUtil}>Std</th>
                </tr>
              </thead>
              <tbody>
                {results.tables.groupSummary.map((row) => (
                  <tr key={row.group}>
                    <td style={tdUtil}>{row.group}</td>
                    <td style={tdUtil}>{row.n}</td>
                    <td style={tdUtil}>{row.mean.toFixed(3)}</td>
                    <td style={tdUtil}>{row.std.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {results?.tables?.correlation && (
          <div style={{ fontSize: 11 }}>
            r = {results.tables.correlation.r.toFixed(3)} (p = {results.tables.correlation.p.toFixed(3)})
          </div>
        )}
      </div>

      <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>SECTION 5.4 — PLOTS</div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          Plot data prepared. Hook in charting for production.
        </div>
      </div>

      <div style={{ border: "1px solid var(--border)", background: "var(--panel-alt)", padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>SECTION 5.5 — AUDIT TRAIL</div>
        <div style={{ fontSize: 10 }}>Prep log entries: {(bundle.preparedDatasetState.prepLog || []).length}</div>
        <div style={{ fontSize: 10 }}>Intent log entries: {(bundle.intent.intentLog || []).length}</div>
        <div style={{ fontSize: 10 }}>Phase 4 log entries: {(bundle.phase4.phase4Log || []).length}</div>
        {finalDataset && (
          <div style={{ fontSize: 10, marginTop: 6 }}>
            nOriginal → nFinal: {finalDataset.meta.nOriginal} → {finalDataset.meta.nFinal}
          </div>
        )}
      </div>

      <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>SECTION 5.6 — EXPORT</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => downloadFile(`final_dataset_${Date.now()}.csv`, toCsv(finalDataset.data), "text/csv")}
            style={{ ...utilBtn, fontSize: 10 }}
          >
            Download final_dataset.csv
          </button>
          <button
            type="button"
            onClick={() => downloadFile(`report_${Date.now()}.json`, JSON.stringify({ bundle, results }, null, 2), "application/json")}
            style={{ ...utilBtn, fontSize: 10 }}
          >
            Download report.json
          </button>
          <button
            type="button"
            onClick={() => downloadFile(`report_${Date.now()}.md`, buildReportMarkdown(bundle, results, finalDataset.meta), "text/markdown")}
            style={{ ...utilBtn, fontSize: 10 }}
          >
            Download report.md
          </button>
        </div>
      </div>
    </div>
  );
}
