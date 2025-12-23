import { useState } from "react";
import { utilBtn, thUtil, tdUtil } from "./uiStyles";

export default function OverviewPanel({ shape, columns, missing, numericColumns, api, onAnalyzeFile, onFileReplace }) {
  const [cleanOptions, setCleanOptions] = useState({
    drop_na: false,
    fill_mean: false,
    fill_median: false,
    remove_outliers_iqr: false,
    remove_outliers_zscore: false,
    drop_duplicates: false,
    drop_high_missing: false,
    missing_threshold: 50,
  });
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState(null);
  const [cleanPreview, setCleanPreview] = useState(null);
  const [stagedFile, setStagedFile] = useState(null);

  // Data table editing
  const [tableData, setTableData] = useState(null);
  const [loadingTable, setLoadingTable] = useState(false);
  const [editedCells, setEditedCells] = useState(new Map());

  async function loadTableData(fileOverride = null) {
    setLoadingTable(true);
    try {
      const fileInput = document.querySelector('input[type="file"]');
      const file = fileOverride ?? stagedFile ?? fileInput?.files?.[0];
      if (!file) return;

      const form = new FormData();
      form.append("file", file);
      form.append("page", "0");
      form.append("page_size", "-1");

      const res = await fetch(`${api}/get_data`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) throw new Error("Failed to load data");

      const json = await res.json();
      setTableData(json);
      setEditedCells(new Map());
    } catch (e) {
      alert("Error loading data: " + e);
    } finally {
      setLoadingTable(false);
    }
  }

  function handleCellEdit(rowIdx, colIdx, value) {
    const key = `${rowIdx}-${colIdx}`;
    const newEdited = new Map(editedCells);
    newEdited.set(key, { rowIdx, colIdx, value });
    setEditedCells(newEdited);

    // Update local display
    const newData = { ...tableData };
    newData.data[rowIdx][colIdx] = value;
    setTableData(newData);
  }

  async function applyEdits() {
    if (!stagedFile && editedCells.size === 0) {
      alert("No changes to apply");
      return;
    }

    setLoadingTable(true);
    try {
      const fileInput = document.querySelector('input[type="file"]');
      let file = stagedFile ?? fileInput?.files?.[0];
      if (!file) return;

      if (editedCells.size > 0) {
        // Apply each edit
        for (const edit of editedCells.values()) {
          const form = new FormData();
          form.append("file", file);
          form.append("row_index", edit.rowIdx.toString());
          form.append("column", tableData.columns[edit.colIdx]);
          form.append("value", edit.value === null ? "" : edit.value.toString());

          const res = await fetch(`${api}/update_data`, {
            method: "POST",
            body: form,
          });

          if (!res.ok) throw new Error("Failed to update");

          // Get updated file for next iteration
          const blob = await res.blob();
          file = new File([blob], file.name, { type: "text/csv" });
        }
      }

      // Update the file input with the new file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      if (stagedFile) {
        const text = await file.text();
        const preview = parseCsvPreview(text);
        setCleanPreview(preview);
      }
      setStagedFile(null);
      setEditedCells(new Map());
      setTableData(null);
      if (onFileReplace) onFileReplace(file);
      if (onAnalyzeFile) await onAnalyzeFile(file);
      alert("Applied data edits. Overview has been refreshed.");
      loadTableData(file);
    } catch (e) {
      alert("Error applying edits: " + e);
    } finally {
      setLoadingTable(false);
    }
  }

  async function handleClean(download = false) {
    setCleaning(true);
    setCleanResult(null);
    setCleanPreview(null);

    try {
      const fileInput = document.querySelector('input[type="file"]');
      const file = fileInput?.files?.[0];

      if (!file) {
        alert("No file selected");
        return;
      }

      const form = new FormData();
      form.append("file", file);

      // Append all cleaning options
      Object.entries(cleanOptions).forEach(([key, value]) => {
        form.append(key, value.toString());
      });

      const res = await fetch(`${api}/clean`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) throw new Error(`Clean failed (HTTP ${res.status})`);

      // Get metadata from headers
      const operations = res.headers.get("X-Operations");
      const originalShape = res.headers.get("X-Original-Shape");
      const newShape = res.headers.get("X-New-Shape");
      const blob = await res.blob();
      const previewFile = new File([blob], `cleaned_${file.name || "data.csv"}`, { type: "text/csv" });
      setStagedFile(previewFile);
      setEditedCells(new Map());
      loadTableData(previewFile);

      if (download) {
        // Download the file
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cleaned_data.csv";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setCleanResult({
          operations: operations || "No operations applied",
          originalShape,
          newShape,
        });
      } else {
        const text = await blob.text();
        const preview = parseCsvPreview(text);
        setCleanPreview(preview);
        setCleanResult({
          operations: operations || "No operations applied",
          originalShape,
          newShape,
        });
      }
    } catch (e) {
      alert("Error: " + String(e));
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700 }}>DATASET SUMMARY</h3>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <StatUtil label="ROWS" value={shape?.rows ?? "?"} />
        <StatUtil label="COLUMNS" value={shape?.cols ?? "?"} />
        <StatUtil label="NUMERIC" value={numericColumns.length} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <h4 style={{ margin: "0 0 6px 0", fontSize: 13, fontWeight: 700 }}>COLUMNS</h4>
          <div style={{ border: "1px solid var(--border)", maxHeight: 200, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <tbody>
                {columns.map((c, i) => (
                  <tr key={c} style={{ background: i % 2 === 0 ? "var(--panel-alt)" : "var(--panel)" }}>
                    <td style={{ padding: "4px 8px" }}>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h4 style={{ margin: "0 0 6px 0", fontSize: 13, fontWeight: 700 }}>MISSING VALUES</h4>
          <div style={{ border: "1px solid var(--border)", maxHeight: 200, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "var(--panel-strong)" }}>
                  <th style={thUtil}>Column</th>
                  <th style={thUtil}>Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(missing).map(([k, v], i) => (
                  <tr key={k} style={{ background: i % 2 === 0 ? "var(--panel-alt)" : "var(--panel)" }}>
                    <td style={tdUtil}>{k}</td>
                    <td style={tdUtil}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Data Cleaning Section */}
      <div style={{ marginTop: 16, border: "1px solid var(--border)", background: "var(--panel-alt)" }}>
        <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", background: "var(--panel-strong)", fontSize: 12, fontWeight: 700 }}>
          DATA CLEANING
        </div>
        <div style={{ padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Left column */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>MISSING VALUES</div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={cleanOptions.drop_na}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, drop_na: e.target.checked })}
                />
                Drop rows with any missing
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={cleanOptions.fill_mean}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, fill_mean: e.target.checked })}
                />
                Fill numeric with mean
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={cleanOptions.fill_median}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, fill_median: e.target.checked })}
                />
                Fill numeric with median
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={cleanOptions.drop_high_missing}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, drop_high_missing: e.target.checked })}
                />
                Drop columns &gt;
                <input
                  type="number"
                  value={cleanOptions.missing_threshold}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, missing_threshold: parseFloat(e.target.value) })}
                  style={{ width: 50, padding: "2px 4px", fontSize: 11, border: "1px solid var(--border-strong)" }}
                />
                % missing
              </label>
            </div>

            {/* Right column */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>OUTLIERS & DUPLICATES</div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={cleanOptions.remove_outliers_iqr}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, remove_outliers_iqr: e.target.checked })}
                />
                Remove outliers (IQR method)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={cleanOptions.remove_outliers_zscore}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, remove_outliers_zscore: e.target.checked })}
                />
                Remove outliers (Z-score &gt; 3)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={cleanOptions.drop_duplicates}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, drop_duplicates: e.target.checked })}
                />
                Remove duplicate rows
              </label>
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => handleClean(false)} disabled={cleaning} style={{ ...utilBtn, fontSize: 10 }}>
              {cleaning ? "PROCESSING..." : "PREVIEW CHANGES"}
            </button>
            <button onClick={() => handleClean(true)} disabled={cleaning} style={{ ...utilBtn, fontSize: 10 }}>
              {cleaning ? "PROCESSING..." : "DOWNLOAD CLEANED"}
            </button>
          </div>

          {/* Results */}
          {cleanResult && (
            <div style={{ marginTop: 12, padding: 8, border: "1px solid var(--border)", background: "var(--panel)", fontSize: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>CLEANING SUMMARY</div>
              <div style={{ marginBottom: 2 }}>
                <strong>Original:</strong> {cleanResult.originalShape}
              </div>
              <div style={{ marginBottom: 4 }}>
                <strong>After cleaning:</strong> {cleanResult.newShape}
              </div>
              <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{cleanResult.operations}</div>
              {cleanPreview && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>PREVIEW (ALL ROWS)</div>
                  <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 260 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, border: "1px solid var(--border)" }}>
                      <thead>
                        <tr style={{ background: "var(--panel-strong)" }}>
                          {cleanPreview.columns.map((col) => (
                            <th key={col} style={thUtil}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cleanPreview.rows.map((row, rowIdx) => (
                          <tr key={rowIdx} style={{ background: rowIdx % 2 === 0 ? "var(--panel-alt)" : "var(--panel)" }}>
                            {row.map((value, colIdx) => (
                              <td key={colIdx} style={tdUtil}>
                                {value}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Editable Data Table */}
      <div style={{ marginTop: 16, border: "1px solid var(--border)", background: "var(--panel-alt)" }}>
        <div
          style={{
            padding: "6px 8px",
            borderBottom: "1px solid var(--border)",
            background: "var(--panel-strong)",
            fontSize: 12,
            fontWeight: 700,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>DATA EDITOR</span>
          {!tableData && (
            <button onClick={() => loadTableData()} style={{ ...utilBtn, fontSize: 9, padding: "3px 8px" }}>
              LOAD DATA
            </button>
          )}
        </div>

        {tableData && (
          <div style={{ padding: 12 }}>
            <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 360, marginBottom: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, border: "1px solid var(--border)" }}>
                <thead>
                  <tr style={{ background: "var(--panel-strong)" }}>
                    <th style={{ ...thUtil, width: 40 }}>Row</th>
                    {tableData.columns.map((col) => (
                      <th key={col} style={thUtil}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.data.map((row, rowIdx) => (
                    <tr key={rowIdx} style={{ background: rowIdx % 2 === 0 ? "var(--panel-alt)" : "var(--panel)" }}>
                      <td style={{ ...tdUtil, fontWeight: 700, background: "var(--panel-strong)" }}>{rowIdx + 1}</td>
                      {row.map((value, colIdx) => {
                        const key = `${rowIdx}-${colIdx}`;
                        const isEdited = editedCells.has(key);

                        return (
                          <td key={colIdx} style={tdUtil}>
                            <input
                              type="text"
                              value={value ?? ""}
                              onChange={(e) => handleCellEdit(rowIdx, colIdx, e.target.value)}
                              style={{
                                width: "100%",
                                padding: "2px 4px",
                                fontSize: 10,
                                border: "1px solid transparent",
                                background: isEdited ? "var(--highlight)" : "inherit",
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 10 }}>
                Rows {tableData.data.length}
                {editedCells.size > 0 && (
                  <span style={{ color: "var(--warning-text)", marginLeft: 8 }}>({editedCells.size} unsaved changes)</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={applyEdits}
                  disabled={(editedCells.size === 0 && !stagedFile) || loadingTable}
                  style={{
                    ...utilBtn,
                    fontSize: 9,
                    padding: "3px 8px",
                    background: editedCells.size > 0 || stagedFile ? "var(--warning-bg)" : "var(--panel-strong)",
                  }}
                >
                  APPLY ALL DATA EDIT CHANGES
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function parseCsvPreview(text, maxRows = null) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === "," || ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") {
        i += 1;
      }
      row.push(field);
      field = "";
      if (ch !== ",") {
        if (row.length > 1 || row[0] !== "") {
          rows.push(row);
        }
        row = [];
        if (maxRows !== null && rows.length >= maxRows + 1) {
          break;
        }
      }
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) {
    return { columns: [], rows: [] };
  }

  const header = rows[0];
  const body = maxRows === null ? rows.slice(1) : rows.slice(1, maxRows + 1);
  const normalizedBody = body.map((r) => {
    if (r.length < header.length) {
      return r.concat(Array(header.length - r.length).fill(""));
    }
    return r.slice(0, header.length);
  });

  return { columns: header, rows: normalizedBody };
}

function StatUtil({ label, value }) {
  return (
    <div
      style={{
        padding: "6px 10px",
        border: "1px solid var(--border)",
        background: "var(--panel-alt)",
        minWidth: 100,
      }}
    >
      <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
