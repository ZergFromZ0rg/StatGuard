import Plotly from "plotly.js-dist-min";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { useMemo, useState } from "react";
import { utilBtn } from "./uiStyles";
import { buildRegressionGraph } from "./regressionGraphs.jsx";

const SECTION_DEFS = [
  { id: "overview", label: "Data Overview" },
  { id: "relationships", label: "Relationships" },
  { id: "visualizations", label: "Visualizations" },
  { id: "hypothesis", label: "Hypothesis Tests" },
  { id: "distribution", label: "Distribution" },
  { id: "regression", label: "Regression" },
];

export default function ReportBuilderPanel({ reportData, shape, columns, missing, corr, numericColumns, prepLog }) {
  const [selected, setSelected] = useState(() =>
    SECTION_DEFS.reduce((acc, section) => {
      acc[section.id] = true;
      return acc;
    }, {})
  );
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState("");

  const availability = useMemo(
    () => ({
      overview: Boolean(shape),
      relationships: Boolean(corr),
      visualizations: Boolean(reportData?.visualizations?.res),
      hypothesis: Boolean(reportData?.hypothesis?.result),
      distribution: Boolean(reportData?.distribution?.result),
      regression: Boolean(reportData?.regression?.res),
    }),
    [shape, corr, reportData]
  );

  function toggle(id) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }


  async function exportPackage() {
    setErr("");
    const chosen = SECTION_DEFS.filter((section) => selected[section.id] && availability[section.id]);
    if (chosen.length === 0) {
      setErr("Select at least one available section.");
      return;
    }

    setExporting(true);
    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pageWidth = 612;
      const pageHeight = 792;
      const margin = 40;

      for (const section of chosen) {
        const pages = await buildSectionPages({
          section: section.id,
          pdfDoc,
          font,
          fontBold,
          pageWidth,
          pageHeight,
          margin,
          reportData,
          shape,
          columns,
          missing,
          corr,
          numericColumns,
          prepLog,
        });
        pages.forEach((page) => pdfDoc.addPage(page));
      }

      if (prepLog && prepLog.length > 0) {
        const appendix = buildAppendixPage({ pdfDoc, font, fontBold, pageWidth, pageHeight, margin, prepLog });
        pdfDoc.addPage(appendix);
      }

      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "csv-matrix-export.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700 }}>EXPORT PACKAGE</h3>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
        Select the sections you want to export. Only sections with results are available.
      </div>

      {err && (
        <div style={{ padding: 6, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", fontSize: 11, color: "var(--danger-text)", marginBottom: 10 }}>
          {err}
        </div>
      )}

      <div style={{ border: "1px solid var(--border)", background: "var(--panel-alt)", marginBottom: 12 }}>
        <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", background: "var(--panel-strong)", fontSize: 12, fontWeight: 700 }}>
          SECTIONS
        </div>
        <div style={{ padding: 8, display: "grid", gap: 6 }}>
          {SECTION_DEFS.map((section) => (
            <label key={section.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, opacity: availability[section.id] ? 1 : 0.5 }}>
              <input
                type="checkbox"
                checked={Boolean(selected[section.id])}
                onChange={() => toggle(section.id)}
                disabled={!availability[section.id]}
              />
              {section.label}
              {!availability[section.id] && <span style={{ color: "var(--text-muted)" }}>(no results)</span>}
            </label>
          ))}
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>
            Note: export uses the latest data overview results — click “Analyze” again after edits to refresh.
          </div>
        </div>
      </div>

      <button onClick={exportPackage} disabled={exporting} style={{ ...utilBtn, width: "100%" }}>
        {exporting ? "EXPORTING..." : "EXPORT SELECTED"}
      </button>
    </div>
  );
}

async function buildSectionPages({
  section,
  pdfDoc,
  font,
  fontBold,
  pageWidth,
  pageHeight,
  margin,
  reportData,
  shape,
  columns,
  missing,
  corr,
  numericColumns,
  prepLog,
}) {
  const pages = [];

  async function addPlotPage(plotSpec, heading) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawText(heading, { x: margin, y: pageHeight - margin - 16, size: 14, font: fontBold, color: rgb(0, 0, 0) });
    const imageData = await plotToImage(plotSpec, 860, 520);
    if (imageData) {
      const bytes = await fetch(imageData).then((r) => r.arrayBuffer());
      const png = await pdfDoc.embedPng(bytes);
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2 - 28;
      const scale = Math.min(availableWidth / png.width, availableHeight / png.height);
      const imgWidth = png.width * scale;
      const imgHeight = png.height * scale;
      page.drawImage(png, {
        x: margin,
        y: pageHeight - margin - 28 - imgHeight,
        width: imgWidth,
        height: imgHeight,
      });
    }
    pages.push(page);
  }

  function addTextPage(lines, heading) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawText(heading, { x: margin, y: pageHeight - margin - 16, size: 14, font: fontBold, color: rgb(0, 0, 0) });
    let y = pageHeight - margin - 40;
    const lineHeight = 14;
    lines.forEach((line) => {
      if (y < margin + lineHeight) return;
      page.drawText(line, { x: margin, y, size: 11, font, color: rgb(0, 0, 0) });
      y -= lineHeight;
    });
    pages.push(page);
  }

  if (section === "overview") {
    const lines = [];
    if (shape) {
      lines.push(`Rows: ${shape.rows}`);
      lines.push(`Columns: ${shape.cols}`);
    }
    if (columns && columns.length > 0) {
      lines.push(`Columns: ${columns.join(", ")}`);
    }
    if (missing && Object.keys(missing).length > 0) {
      const missingLines = Object.entries(missing)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([col, v]) => `${col}: ${v} missing`);
      if (missingLines.length > 0) {
        lines.push("Missing (top columns):");
        missingLines.forEach((l) => lines.push(`- ${l}`));
      }
    }
    if (prepLog && prepLog.length > 0) {
      lines.push("Data preparation decisions are listed in Appendix A.");
    }
    addTextPage(lines.length > 0 ? lines : ["No overview data available."], "Data Overview");
    return pages;
  }

  if (section === "relationships" && corr) {
    const labels = numericColumns && numericColumns.length > 0 ? numericColumns : Object.keys(corr || {});
    const z = labels.map((row) => labels.map((col) => corr?.[row]?.[col] ?? 0));
    const plotSpec = {
      kind: "plot",
      data: [
        {
          type: "heatmap",
          z,
          x: labels,
          y: labels,
          colorscale: "YlGn",
        },
      ],
      layout: {
        height: 420,
        margin: { l: 80, r: 20, t: 10, b: 80 },
        paper_bgcolor: "white",
        plot_bgcolor: "white",
        font: { family: "monospace", size: 10, color: "#111" },
      },
    };
    await addPlotPage(plotSpec, "Relationships");
    return pages;
  }

  if (section === "visualizations" && reportData?.visualizations?.res) {
    const res = reportData.visualizations.res;
    const plotSpec = {
      kind: "plot",
      data: [
        {
          type: "splom",
          dimensions: res.columns.map((col) => ({ label: col, values: res.scatter_matrix[col] })),
          marker: { color: "#2e7d4b", size: 4, opacity: 0.7 },
        },
      ],
      layout: {
        height: 360,
        margin: { l: 40, r: 20, t: 10, b: 40 },
        paper_bgcolor: "white",
        plot_bgcolor: "white",
        font: { family: "monospace", size: 10, color: "#111" },
      },
    };
    await addPlotPage(plotSpec, "Visualizations");
    return pages;
  }

  if (section === "distribution" && reportData?.distribution?.result) {
    const result = reportData.distribution.result;
    const plotSpec = {
      kind: "plot",
      data: [
        {
          x: result.histogram.centers,
          y: result.histogram.counts,
          type: "bar",
          marker: { color: "#dcedc8", line: { color: "#2e7d4b", width: 1 } },
        },
        {
          x: result.normal_curve.x,
          y: result.normal_curve.y,
          type: "scatter",
          mode: "lines",
          line: { color: "#2e7d4b", width: 2 },
        },
      ],
      layout: {
        height: 320,
        margin: { l: 60, r: 20, t: 10, b: 40 },
        paper_bgcolor: "white",
        plot_bgcolor: "white",
        font: { family: "monospace", size: 10, color: "#111" },
        showlegend: false,
        xaxis: { title: result.column },
        yaxis: { title: "Count" },
      },
    };
    await addPlotPage(plotSpec, "Distribution");
    return pages;
  }

  if (section === "hypothesis" && reportData?.hypothesis?.result) {
    const result = reportData.hypothesis.result;
    const lines = Object.entries(result).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    addTextPage(lines, "Hypothesis Test");
    return pages;
  }

  if (section === "regression" && reportData?.regression?.res) {
    const { res, modelType, selectedGraphs, threshold } = reportData.regression;
    const logisticMetrics = computeLogisticMetrics(res, threshold);
    const logisticRocPoint = logisticMetrics
      ? { tpr: logisticMetrics.recall, fpr: logisticMetrics.fp / (logisticMetrics.fp + logisticMetrics.tn || 1), threshold }
      : null;

    for (const graph of selectedGraphs) {
      const spec = buildRegressionGraph(graph.type, res, {
        xCol: graph.xCol,
        xCol2: graph.xCol2,
        modelType,
        logisticMetrics,
        logisticRocPoint,
      });
      if (spec.kind === "plot") {
        await addPlotPage(spec, getGraphTitle(graph.type));
      } else if (spec.kind === "table") {
        const lines = spec.rows.map((row) => row.join("  "));
        addTextPage(lines, getGraphTitle(graph.type));
      } else {
        addTextPage([spec.text], getGraphTitle(graph.type));
      }
    }
    return pages;
  }

  addTextPage(["No data available."], "Section");
  return pages;
}

function buildAppendixPage({ pdfDoc, font, fontBold, pageWidth, pageHeight, margin, prepLog }) {
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  page.drawText("Appendix A: Data Preparation Decisions", { x: margin, y: pageHeight - margin - 16, size: 14, font: fontBold, color: rgb(0, 0, 0) });
  let y = pageHeight - margin - 40;
  const lineHeight = 14;

  prepLog.forEach((entry, index) => {
    const header = `${index + 1}. ${entry.action} @ ${entry.timestamp}`;
    if (y < margin + lineHeight) return;
    page.drawText(header, { x: margin, y, size: 11, font, color: rgb(0, 0, 0) });
    y -= lineHeight;

    const lines = [
      `Dropped rows: ${entry.dropped_rows ? "yes" : "no"}`,
      `Imputation: ${entry.imputation}`,
      `Drop columns by missing: ${entry.dropped_columns_by_missing ?? "no"}`,
      `Drop duplicates: ${entry.drop_duplicates ? "yes" : "no"}`,
      `Excluded variables: ${entry.excluded_variables?.length ? entry.excluded_variables.join(", ") : "none"}`,
      `Flagged outliers: ${entry.flagged_outliers ? "yes" : "no"}`,
      `Missing strategy skipped: ${entry.missing_strategy_skipped ? "yes" : "no"}`,
    ];

    lines.forEach((line) => {
      if (y < margin + lineHeight) return;
      page.drawText(line, { x: margin + 10, y, size: 10, font, color: rgb(0, 0, 0) });
      y -= lineHeight;
    });

    y -= lineHeight / 2;
  });

  return page;
}

function getGraphTitle(type) {
  const labels = {
    "predicted-actual": "Predicted vs Actual",
    "residuals-fitted": "Residuals vs Fitted",
    "qq-plot": "Q-Q Plot",
    "scale-location": "Scale-Location",
    "residuals-leverage": "Residuals vs Leverage",
    "partial-dependence": "Partial Dependence",
    "coefficients-table": "Coefficients Table",
    "regression-3d": "3D Regression",
    "roc-curve": "ROC Curve",
    "confusion-matrix": "Confusion Matrix",
    "odds-ratios": "Odds Ratios",
  };
  return labels[type] || "Graph";
}

function computeLogisticMetrics(res, threshold) {
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
}

async function plotToImage(spec, width, height) {
  if (spec.kind !== "plot") return null;
  const resolvedSpec = resolveCssVars(spec);
  const holder = document.createElement("div");
  holder.style.position = "absolute";
  holder.style.left = "-9999px";
  holder.style.top = "-9999px";
  document.body.appendChild(holder);
  await Plotly.newPlot(holder, resolvedSpec.data, { ...resolvedSpec.layout, width, height }, { displayModeBar: false });
  const dataUrl = await Plotly.toImage(holder, { format: "png", width, height });
  Plotly.purge(holder);
  holder.remove();
  return dataUrl;
}

function resolveCssVars(value) {
  if (Array.isArray(value)) {
    return value.map((item) => resolveCssVars(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, resolveCssVars(val)]));
  }
  if (typeof value === "string" && value.includes("var(")) {
    const match = value.match(/var\((--[^)]+)\)/);
    if (!match) return value;
    const cssValue = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
    return cssValue || value;
  }
  return value;
}
