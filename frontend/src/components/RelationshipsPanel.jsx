import Plot from "react-plotly.js";

export default function RelationshipsPanel({ corr, numericColumns }) {
  if (!corr || numericColumns.length === 0) {
    return <div style={{ fontSize: 11 }}>No numeric columns found.</div>;
  }

  const z = numericColumns.map((r) => numericColumns.map((c) => corr[r]?.[c] ?? null));

  return (
    <div>
      <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700 }}>CORRELATION MATRIX</h3>
      <Plot
        data={[
          {
            type: "heatmap",
            z,
            x: numericColumns,
            y: numericColumns,
            colorscale: "RdBu",
            zmid: 0,
          },
        ]}
        layout={{
          autosize: true,
          margin: { l: 140, r: 20, t: 10, b: 140 },
          height: 500,
          font: { family: "monospace", size: 10, color: "var(--text)" },
          paper_bgcolor: "var(--panel)",
          plot_bgcolor: "var(--panel)",
          xaxis: { automargin: true, tickangle: -45, tickfont: { size: 9 } },
          yaxis: { automargin: true, tickfont: { size: 9 } },
        }}
        style={{ width: "100%" }}
      />
    </div>
  );
}
