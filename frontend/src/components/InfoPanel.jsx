export default function InfoPanel() {
  return (
    <div style={{ maxWidth: 820 }}>
      <h3 style={{ margin: "0 0 10px 0", fontSize: 19, fontWeight: 700 }}>HOW TO READ THE OUTPUT</h3>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 12px 0" }}>
        This page explains each tool in plain language. Use it as a quick reference for what each chart or table shows,
        what it helps you decide, and what to watch out for.
      </p>

      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
        DATA OVERVIEW
      </div>
      <div style={{ height: 1, background: "var(--border)", margin: "0 0 10px 0" }} />
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 10px 0" }}>
        <strong>Dataset summary</strong> shows row/column counts and how many numeric columns you have. Use it to confirm
        the file loaded correctly and to gauge how complex the dataset is.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 12px 0" }}>
        <strong>Missing values</strong> lists how many empty cells each column has. Look for columns with large gaps — they
        can skew results or make models unreliable.
      </p>

      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
        DATA CLEANING
      </div>
      <div style={{ height: 1, background: "var(--border)", margin: "0 0 10px 0" }} />
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Drop rows with missing</strong> removes any row that has at least one blank cell. Use when missing values are rare
        and you want only complete records.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Fill with mean/median</strong> replaces missing numeric values. Mean is good for symmetric data; median is safer
        if there are outliers.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Outlier removal (IQR or Z‑score)</strong> removes rows with unusually large/small values. Use carefully if outliers
        might be meaningful (e.g., rare but important events).
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 12px 0" }}>
        <strong>Drop duplicates</strong> removes identical rows. Good for de‑duping exports or logs.
      </p>

      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
        RELATIONSHIPS
      </div>
      <div style={{ height: 1, background: "var(--border)", margin: "0 0 10px 0" }} />
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 12px 0" }}>
        <strong>Correlation matrix</strong> shows how strongly numeric columns move together. Values near 1 or -1 mean a strong
        relationship. Use it to spot columns that may be closely linked or redundant.
      </p>

      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
        HYPOTHESIS TESTING
      </div>
      <div style={{ height: 1, background: "var(--border)", margin: "0 0 10px 0" }} />
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Two-sample t-test</strong> compares the averages of two groups. Use it to check if two categories differ on a
        numeric measure.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Paired t-test</strong> compares two measurements taken from the same rows (before vs after). It tests if the
        average change is meaningful.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Chi-square test</strong> checks whether two categorical columns are related. It tells you if the distribution of
        one category depends on the other.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 12px 0" }}>
        <strong>One-way ANOVA</strong> compares the averages across 3+ groups. Use it when a numeric column is split by a
        categorical group.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 12px 0" }}>
        <strong>Confidence intervals (CI)</strong> may show as “n/a” when there are too few rows or not enough variation to
        estimate them reliably.
      </p>

      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
        DISTRIBUTION ANALYSIS
      </div>
      <div style={{ height: 1, background: "var(--border)", margin: "0 0 10px 0" }} />
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Histogram + normal curve</strong> shows the overall shape and whether it looks bell‑shaped. Big gaps or skew
        indicate non‑normal data.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Box plot</strong> highlights the median, spread, and outliers. Use it to spot unusually high/low values quickly.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 12px 0" }}>
        <strong>Shapiro‑Wilk</strong> tests normality for 3–5000 rows. p &lt; 0.05 suggests the data may not be normal.
      </p>

      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
        REGRESSION
      </div>
      <div style={{ height: 1, background: "var(--border)", margin: "0 0 10px 0" }} />
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Predicted vs Actual</strong> shows how close predictions are to real values. Points near the diagonal line mean
        good performance.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Residuals vs Fitted</strong> helps spot patterns the model missed. A random cloud is good; curves or funnels
        suggest issues.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Q‑Q plot</strong> checks if errors are roughly normal. Points near the line are ideal; large bends indicate unusual
        error behavior.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Scale‑Location</strong> checks if errors grow with predictions. A flat band is good; widening means uneven error.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Residuals vs Leverage</strong> highlights influential points. A few extreme points can overly sway the model.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 8px 0" }}>
        <strong>Partial dependence</strong> shows how one predictor affects the outcome while holding others steady. Use it to
        interpret the direction and strength of a specific input.
      </p>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: 0 }}>
        <strong>Coefficients table</strong> lists how much each predictor changes the outcome. Larger values mean stronger influence;
        very small values often matter less.
      </p>
    </div>
  );
}
