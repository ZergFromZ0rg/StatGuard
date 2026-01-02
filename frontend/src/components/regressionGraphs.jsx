import Plot from "react-plotly.js";
import { tdUtil, thUtil } from "./uiStyles";

export function buildRegressionGraph(type, res, opts) {
  const { xCol, xCol2, modelType, logisticMetrics, logisticRocPoint } = opts;
  const plotConfig = {
    font: { family: "monospace", size: 10, color: "var(--text)" },
    margin: { l: 70, r: 20, t: 10, b: 60 },
    paper_bgcolor: "var(--panel)",
    plot_bgcolor: "var(--panel)",
  };

  switch (type) {
    case "predicted-actual":
      return {
        kind: "plot",
        data: [
          { x: res.y, y: res.fitted, mode: "markers", marker: { color: "var(--accent)", size: 4 } },
          {
            x: [Math.min(...res.y), Math.max(...res.y)],
            y: [Math.min(...res.y), Math.max(...res.y)],
            mode: "lines",
            line: { color: "var(--border-strong)", width: 1, dash: "dash" },
          },
        ],
        layout: {
          ...plotConfig,
          height: 350,
          xaxis: { title: "Actual " + res.y_col, automargin: true },
          yaxis: { title: "Predicted " + res.y_col, automargin: true },
          showlegend: false,
        },
      };

    case "residuals-fitted":
      return {
        kind: "plot",
        data: [
          { x: res.fitted, y: res.residuals, mode: "markers", marker: { color: "var(--accent)", size: 4 } },
          {
            x: [Math.min(...res.fitted), Math.max(...res.fitted)],
            y: [0, 0],
            mode: "lines",
            line: { color: "var(--border-strong)", width: 1, dash: "dash" },
          },
        ],
        layout: {
          ...plotConfig,
          xaxis: { title: "Fitted values", automargin: true },
          yaxis: { title: "Residuals", automargin: true },
          height: 350,
          showlegend: false,
        },
      };

    case "qq-plot": {
      const sorted = [...res.standardized_residuals].sort((a, b) => a - b);
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

      return {
        kind: "plot",
        data: [
          { x: theoretical, y: sorted, mode: "markers", marker: { color: "var(--accent)", size: 4 } },
          {
            x: [Math.min(...theoretical), Math.max(...theoretical)],
            y: [Math.min(...theoretical), Math.max(...theoretical)],
            mode: "lines",
            line: { color: "var(--border-strong)", width: 1, dash: "dash" },
          },
        ],
        layout: {
          ...plotConfig,
          height: 350,
          xaxis: { title: "Theoretical Quantiles" },
          yaxis: { title: "Standardized Residuals" },
          showlegend: false,
        },
      };
    }

    case "scale-location":
      return {
        kind: "plot",
        data: [
          {
            x: res.fitted,
            y: res.standardized_residuals.map((r) => Math.sqrt(Math.abs(r))),
            mode: "markers",
            marker: { color: "var(--accent)", size: 4 },
          },
        ],
        layout: {
          ...plotConfig,
          xaxis: { title: "Fitted values", automargin: true },
          yaxis: { title: "√|Standardized Residuals|", automargin: true },
          height: 350,
          showlegend: false,
        },
      };

    case "residuals-leverage":
      return {
        kind: "plot",
        data: [
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
        ],
        layout: {
          ...plotConfig,
          xaxis: { title: "Leverage", automargin: true },
          yaxis: { title: "Standardized Residuals", automargin: true },
          height: 350,
        },
      };

    case "partial-dependence": {
      const targetCol = xCol || res.x_cols?.[0];
      if (!targetCol || !res.x_data?.[targetCol]) {
        return { kind: "message", text: "Select a predictor to plot." };
      }
      const xVals = res.x_data[targetCol].slice().sort((a, b) => a - b);
      const uniqueX = Array.from(new Set(xVals));
      const base = Object.entries(res.coefficients).reduce((acc, [col, coef]) => {
        if (col === targetCol) return acc;
        return acc + coef * (res.x_means?.[col] ?? 0);
      }, res.intercept);
      const yVals = uniqueX.map((x) => base + res.coefficients[targetCol] * x);

      return {
        kind: "plot",
        data: [
          { x: uniqueX, y: yVals, mode: "lines", line: { color: "var(--accent)", width: 2 } },
        ],
        layout: {
          ...plotConfig,
          height: 350,
          xaxis: { title: targetCol },
          yaxis: { title: `Partial Dependence (${res.y_col})` },
          showlegend: false,
        },
      };
    }

    case "roc-curve":
      return {
        kind: "plot",
        data: [
          { x: res.roc?.fpr ?? [], y: res.roc?.tpr ?? [], mode: "lines", line: { color: "var(--accent)", width: 2 } },
          { x: [0, 1], y: [0, 1], mode: "lines", line: { color: "var(--border-strong)", width: 1, dash: "dash" } },
          ...(logisticRocPoint
            ? [
                {
                  x: [logisticRocPoint.fpr],
                  y: [logisticRocPoint.tpr],
                  mode: "markers+text",
                  text: [`t=${logisticRocPoint.threshold.toFixed(2)}`],
                  textposition: "top right",
                  textfont: { size: 9, color: "var(--text)" },
                  marker: { color: "var(--accent-strong)", size: 6 },
                },
              ]
            : []),
        ],
        layout: {
          ...plotConfig,
          height: 350,
          xaxis: { title: "False Positive Rate" },
          yaxis: { title: "True Positive Rate" },
          showlegend: false,
        },
      };

    case "confusion-matrix":
      if (modelType !== "logistic") return { kind: "message", text: "Switch to Logistic model to view this plot." };
      return {
        kind: "table",
        title: "Confusion Matrix",
        headers: ["", "Pred 0", "Pred 1"],
        rows: [
          ["Actual 0", logisticMetrics?.tn ?? res.confusion_matrix?.tn ?? 0, logisticMetrics?.fp ?? res.confusion_matrix?.fp ?? 0],
          ["Actual 1", logisticMetrics?.fn ?? res.confusion_matrix?.fn ?? 0, logisticMetrics?.tp ?? res.confusion_matrix?.tp ?? 0],
        ],
      };

    case "odds-ratios":
      return {
        kind: "table",
        title: "Odds Ratios",
        headers: ["Variable", "Odds Ratio"],
        rows: Object.entries(res.odds_ratios ?? {}).map(([col, orVal]) => [col, orVal.toFixed(4)]),
      };

    case "regression-3d": {
      if (modelType !== "linear") return { kind: "message", text: "3D plot is available for linear regression." };
      const x1 = xCol || res.x_cols?.[0];
      const x2Default = res.x_cols?.find((c) => c !== x1) || res.x_cols?.[0];
      const x2Used = xCol && xCol !== xCol2 ? xCol2 : x2Default;
      if (!x1 || !x2Used || !res.x_data?.[x1] || !res.x_data?.[x2Used]) {
        return { kind: "message", text: "Select two predictors to plot." };
      }

      const x1Vals = res.x_data[x1];
      const x2Vals = res.x_data[x2Used];
      const yVals = res.y;
      const x1Min = Math.min(...x1Vals);
      const x1Max = Math.max(...x1Vals);
      const x2Min = Math.min(...x2Vals);
      const x2Max = Math.max(...x2Vals);
      const x1Grid = Array.from({ length: 20 }, (_, i) => x1Min + (i * (x1Max - x1Min)) / 19);
      const x2Grid = Array.from({ length: 20 }, (_, i) => x2Min + (i * (x2Max - x2Min)) / 19);

      const base = Object.entries(res.coefficients).reduce((acc, [col, coef]) => {
        if (col === x1 || col === x2Used) return acc;
        return acc + coef * (res.x_means?.[col] ?? 0);
      }, res.intercept);

      const zGrid = x2Grid.map((x2Val) =>
        x1Grid.map((x1Val) => base + res.coefficients[x1] * x1Val + res.coefficients[x2Used] * x2Val)
      );

      return {
        kind: "plot",
        data: [
          { x: x1Vals, y: x2Vals, z: yVals, mode: "markers", type: "scatter3d", marker: { color: "var(--accent)", size: 3 } },
          {
            x: x1Grid,
            y: x2Grid,
            z: zGrid,
            type: "surface",
            opacity: 0.6,
            showscale: false,
            colorscale: [
              [0, "rgba(46, 125, 75, 0.2)"],
              [1, "rgba(46, 125, 75, 0.6)"],
            ],
          },
        ],
        layout: {
          height: 420,
          margin: { l: 0, r: 0, t: 10, b: 0 },
          paper_bgcolor: "var(--panel)",
          font: { family: "monospace", size: 10, color: "var(--text)" },
          scene: { xaxis: { title: x1 }, yaxis: { title: x2Used }, zaxis: { title: res.y_col } },
        },
      };
    }

    case "coefficients-table":
      return {
        kind: "table",
        title: "Coefficients",
        headers: ["Variable", "Coefficient", "p-value", "Sig."],
        rows: [
          ["Intercept", res.intercept.toFixed(4), "-", "-"],
          ...Object.entries(res.coefficients).map(([col, coef]) => {
            const pval = res.p_values[col];
            let sig = "";
            if (pval < 0.001) sig = "***";
            else if (pval < 0.01) sig = "**";
            else if (pval < 0.05) sig = "*";
            else sig = "n.s.";
            return [col, coef.toFixed(4), pval < 0.001 ? "<0.001" : pval.toFixed(4), sig];
          }),
        ],
      };

    default:
      return { kind: "message", text: "Unknown graph type" };
  }
}

export function renderRegressionGraph(spec) {
  if (spec.kind === "message") {
    return <div style={{ fontSize: 11 }}>{spec.text}</div>;
  }
  if (spec.kind === "table") {
    return (
      <div>
        {spec.title && <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6 }}>{spec.title}</div>}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, border: "1px solid var(--border)" }}>
          <thead>
            <tr style={{ background: "var(--panel-strong)" }}>
              {spec.headers.map((h) => (
                <th key={h} style={thUtil}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "var(--panel)" : "var(--panel-alt)" }}>
                {row.map((cell, j) => (
                  <td key={j} style={tdUtil}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <Plot
      data={spec.data}
      layout={spec.layout}
      style={{ width: "100%" }}
      config={{ displayModeBar: false }}
    />
  );
}
