export default function AboutPanel({ showInstructions = true }) {
  return (
    <div style={{ maxWidth: 820 }}>
      <h3 style={{ margin: "0 0 10px 0", fontSize: 19, fontWeight: 700 }}>ABOUT CSV MATRIX</h3>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 12px 0" }}>
        CSV Matrix is a fast, browser-based workspace for exploring CSV datasets without leaving your workflow.
        It helps you understand structure, missingness, and relationships so you can make decisions with confidence.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 12px 0" }}>
        Use it for rapid diagnostics, lightweight cleaning, and quick regression checks before deeper modeling.
        It replaces repetitive setup steps by putting common data QA and analysis tools in one place.
      </p>
      {showInstructions && (
        <>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
            Instructions
          </div>
          <div style={{ height: 1, background: "var(--border)", margin: "0 0 10px 0" }} />
          <ol style={{ margin: "0 0 12px 0", paddingLeft: 0, listStylePosition: "inside", lineHeight: 1.7, fontSize: 16 }}>
            <li>Upload a CSV file</li>
            <li>Click ANALYZE</li>
            <li>Use the tabs to explore results</li>
          </ol>
        </>
      )}
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
        What You Can Do
      </div>
      <div style={{ height: 1, background: "var(--border)", margin: "0 0 10px 0" }} />
      <ul style={{ margin: "0 0 12px 0", paddingLeft: 0, listStylePosition: "inside", lineHeight: 1.7, fontSize: 16 }}>
        <li>Scan dataset size, columns, and missing values at a glance.</li>
        <li>Clean data with targeted options and preview changes before applying.</li>
        <li>Edit rows directly and apply edits when you are ready.</li>
        <li>Explore relationships with correlation heatmaps.</li>
        <li>Run regression with diagnostics and partial dependence plots.</li>
        <li>Test hypotheses and analyze distributions for quick insights.</li>
      </ul>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
        Who It’s For
      </div>
      <div style={{ height: 1, background: "var(--border)", margin: "0 0 10px 0" }} />
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 12px 0" }}>
        Built for students, analysts, and non‑technical teams who need quick answers from CSV data without setting up code.
        It’s equally useful for early exploration and simple validation before deeper modeling.
      </p>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
        Accepted Files
      </div>
      <div style={{ height: 1, background: "var(--border)", margin: "0 0 10px 0" }} />
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: 0 }}>
        Uploads support standard <strong>.csv</strong> files with headers in the first row.
      </p>
    </div>
  );
}
