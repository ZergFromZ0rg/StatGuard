from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import pandas as pd
import numpy as np
import io
import statsmodels.api as sm
from scipy import stats
from statsmodels.stats.diagnostic import het_breuschpagan
from statsmodels.stats.stattools import durbin_watson
from statsmodels.stats.outliers_influence import variance_inflation_factor
import re
from decimal import Decimal, InvalidOperation

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Changed to allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Operations", "X-Original-Shape", "X-New-Shape"],
)

@app.get("/")
def root():
    return {"status": "ok"}

@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))

    categorical_cols = []
    nunique = df.nunique(dropna=True)
    for col in df.columns:
        if df[col].dtype.name in ["object", "category", "bool"]:
            categorical_cols.append(col)
        elif pd.api.types.is_numeric_dtype(df[col]) and nunique[col] <= 10:
            categorical_cols.append(col)

    result = {
        "shape": {"rows": int(df.shape[0]), "cols": int(df.shape[1])},
        "columns": df.columns.tolist(),
        "missing_by_column": df.isna().sum().astype(int).to_dict(),
        "categorical_columns": categorical_cols,
    }
    
    numeric = df.select_dtypes(include="number")
    if not numeric.empty:
        result["describe"] = numeric.describe().to_dict()
        result["corr"] = numeric.corr(numeric_only=True).to_dict()
    
    return result

@app.post("/regress")
async def regress(
    file: UploadFile = File(...),
    x_cols: list[str] = Form(...),
    y_col: str = Form(...)
):
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))
    
    if not x_cols or len(x_cols) == 0:
        return {"error": "At least one X column required"}
    
    for col in x_cols:
        if col not in df.columns:
            return {"error": f"Column {col} not found"}
    
    if y_col not in df.columns:
        return {"error": f"Y column {y_col} not found"}
    
    sub = df[x_cols + [y_col]].dropna()
    
    if len(sub) == 0:
        return {"error": "No valid data points after removing missing values"}
    
    X = sub[x_cols]
    X = sm.add_constant(X)
    y = sub[y_col]
    
    model = sm.OLS(y, X).fit()
    
    # Get influence statistics for diagnostic plots
    influence = model.get_influence()
    x_means = {col: float(sub[col].mean()) for col in x_cols}
    residuals = model.resid

    # Assumption tests
    shapiro_result = None
    if 3 <= len(residuals) <= 5000:
        shapiro_stat, shapiro_p = stats.shapiro(residuals)
        shapiro_result = {"stat": float(shapiro_stat), "p_value": float(shapiro_p)}

    bp_stat, bp_p, _, _ = het_breuschpagan(residuals, X)
    dw_stat = float(durbin_watson(residuals))

    vif_values = {}
    X_no_const = sub[x_cols].values
    for i, col in enumerate(x_cols):
        vif_values[col] = float(variance_inflation_factor(X_no_const, i))
    
    return {
        "n": int(len(sub)),
        "x_cols": x_cols,
        "y_col": y_col,
        "intercept": float(model.params["const"]),
        "coefficients": {col: float(model.params[col]) for col in x_cols},
        "p_values": {col: float(model.pvalues[col]) for col in x_cols},
        "x_data": {col: sub[col].tolist() for col in x_cols},
        "x_means": x_means,
        "assumption_tests": {
            "shapiro_wilk": shapiro_result,
            "breusch_pagan": {"stat": float(bp_stat), "p_value": float(bp_p)},
            "durbin_watson": dw_stat,
            "vif": vif_values
        },
        "r2": float(model.rsquared),
        "r2_adj": float(model.rsquared_adj),
        "f_statistic": float(model.fvalue),
        "f_pvalue": float(model.f_pvalue),
        "y": y.tolist(),
        "residuals": model.resid.tolist(),
        "fitted": model.fittedvalues.tolist(),
        "standardized_residuals": influence.resid_studentized_internal.tolist(),
        "leverage": influence.hat_matrix_diag.tolist(),
        "cooks_distance": influence.cooks_distance[0].tolist(),
    }

@app.post("/hypothesis")
async def hypothesis(
    file: UploadFile = File(...),
    test_type: str = Form(...),
    column_a: str = Form(""),
    column_b: str = Form(""),
    group_col: str = Form("")
):
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))

    if test_type == "two_sample_t":
        if not column_a or not group_col:
            return {"error": "Select a numeric column and a group column"}
        if column_a not in df.columns or group_col not in df.columns:
            return {"error": "Selected columns not found"}
        df_sub = df[[column_a, group_col]].dropna()
        groups = df_sub[group_col].unique().tolist()
        if len(groups) != 2:
            return {"error": "Group column must have exactly 2 categories"}
        g1 = df_sub[df_sub[group_col] == groups[0]][column_a]
        g2 = df_sub[df_sub[group_col] == groups[1]][column_a]
        stat, pval = stats.ttest_ind(g1, g2, equal_var=False)
        n1, n2 = len(g1), len(g2)
        mean1, mean2 = float(g1.mean()), float(g2.mean())
        sd1, sd2 = float(g1.std(ddof=1)), float(g2.std(ddof=1))
        pooled = np.sqrt(((n1 - 1) * sd1 ** 2 + (n2 - 1) * sd2 ** 2) / (n1 + n2 - 2)) if n1 + n2 > 2 else np.nan
        cohens_d = (mean1 - mean2) / pooled if pooled and not np.isnan(pooled) else None
        se = np.sqrt((sd1 ** 2) / n1 + (sd2 ** 2) / n2) if n1 > 0 and n2 > 0 else np.nan
        df_num = (sd1 ** 2 / n1 + sd2 ** 2 / n2) ** 2
        df_den = ((sd1 ** 2 / n1) ** 2) / (n1 - 1) + ((sd2 ** 2 / n2) ** 2) / (n2 - 1)
        df_welch = df_num / df_den if df_den else None
        tcrit = stats.t.ppf(0.975, df_welch) if df_welch else None
        mean_diff = mean1 - mean2
        ci = None
        if tcrit is not None and se == se:
            ci = {"low": float(mean_diff - tcrit * se), "high": float(mean_diff + tcrit * se)}
        mean1_ci = None
        mean2_ci = None
        if n1 > 1 and sd1 == sd1:
            tcrit1 = stats.t.ppf(0.975, n1 - 1)
            se1 = sd1 / np.sqrt(n1)
            mean1_ci = {"low": float(mean1 - tcrit1 * se1), "high": float(mean1 + tcrit1 * se1)}
        if n2 > 1 and sd2 == sd2:
            tcrit2 = stats.t.ppf(0.975, n2 - 1)
            se2 = sd2 / np.sqrt(n2)
            mean2_ci = {"low": float(mean2 - tcrit2 * se2), "high": float(mean2 + tcrit2 * se2)}

        return {
            "test": "two_sample_t",
            "stat": float(stat),
            "p_value": float(pval),
            "group_labels": groups,
            "group_sizes": [int(n1), int(n2)],
            "group_stats": {
                groups[0]: {"n": int(n1), "mean": mean1, "std": sd1, "ci_mean": mean1_ci},
                groups[1]: {"n": int(n2), "mean": mean2, "std": sd2, "ci_mean": mean2_ci},
            },
            "effect_size": {"cohens_d": float(cohens_d) if cohens_d is not None else None},
            "ci_mean_diff": ci
        }

    if test_type == "paired_t":
        if not column_a or not column_b:
            return {"error": "Select two numeric columns"}
        if column_a not in df.columns or column_b not in df.columns:
            return {"error": "Selected columns not found"}
        df_sub = df[[column_a, column_b]].dropna()
        if len(df_sub) < 2:
            return {"error": "Not enough paired observations"}
        stat, pval = stats.ttest_rel(df_sub[column_a], df_sub[column_b])
        diffs = df_sub[column_a] - df_sub[column_b]
        mean_diff = float(diffs.mean())
        sd_diff = float(diffs.std(ddof=1))
        n = int(len(df_sub))
        se = sd_diff / np.sqrt(n) if n > 0 else np.nan
        tcrit = stats.t.ppf(0.975, n - 1) if n > 1 else None
        ci = None
        if tcrit is not None and se == se:
            ci = {"low": float(mean_diff - tcrit * se), "high": float(mean_diff + tcrit * se)}
        cohens_d = mean_diff / sd_diff if sd_diff else None
        mean_a = float(df_sub[column_a].mean())
        mean_b = float(df_sub[column_b].mean())
        std_a = float(df_sub[column_a].std(ddof=1))
        std_b = float(df_sub[column_b].std(ddof=1))
        ci_a = None
        ci_b = None
        if n > 1 and std_a == std_a:
            tcrit_a = stats.t.ppf(0.975, n - 1)
            se_a = std_a / np.sqrt(n)
            ci_a = {"low": float(mean_a - tcrit_a * se_a), "high": float(mean_a + tcrit_a * se_a)}
        if n > 1 and std_b == std_b:
            tcrit_b = stats.t.ppf(0.975, n - 1)
            se_b = std_b / np.sqrt(n)
            ci_b = {"low": float(mean_b - tcrit_b * se_b), "high": float(mean_b + tcrit_b * se_b)}

        return {
            "test": "paired_t",
            "stat": float(stat),
            "p_value": float(pval),
            "n": int(len(df_sub)),
            "group_stats": {
                column_a: {"n": n, "mean": mean_a, "std": std_a, "ci_mean": ci_a},
                column_b: {"n": n, "mean": mean_b, "std": std_b, "ci_mean": ci_b},
            },
            "effect_size": {"cohens_d": float(cohens_d) if cohens_d is not None else None},
            "ci_mean_diff": ci
        }

    if test_type == "chi_square":
        if not column_a or not column_b:
            return {"error": "Select two categorical columns"}
        if column_a not in df.columns or column_b not in df.columns:
            return {"error": "Selected columns not found"}
        df_sub = df[[column_a, column_b]].dropna()
        if df_sub.empty:
            return {"error": "No data after removing missing values"}
        table = pd.crosstab(df_sub[column_a], df_sub[column_b])
        chi2, pval, dof, _ = stats.chi2_contingency(table)
        n = table.values.sum()
        r, c = table.shape
        cramer_v = None
        if n > 0 and min(r - 1, c - 1) > 0:
            cramer_v = np.sqrt(chi2 / (n * (min(r - 1, c - 1))))
        return {
            "test": "chi_square",
            "chi2": float(chi2),
            "p_value": float(pval),
            "dof": int(dof),
            "shape": [int(table.shape[0]), int(table.shape[1])],
            "effect_size": {"cramers_v": float(cramer_v) if cramer_v is not None else None}
        }

    if test_type == "anova":
        if not column_a or not group_col:
            return {"error": "Select a numeric column and a group column"}
        if column_a not in df.columns or group_col not in df.columns:
            return {"error": "Selected columns not found"}
        df_sub = df[[column_a, group_col]].dropna()
        groups = df_sub[group_col].unique().tolist()
        if len(groups) < 2:
            return {"error": "Group column must have at least 2 categories"}
        samples = [df_sub[df_sub[group_col] == g][column_a] for g in groups]
        stat, pval = stats.f_oneway(*samples)
        overall_mean = float(df_sub[column_a].mean())
        ss_between = sum(len(s) * (float(s.mean()) - overall_mean) ** 2 for s in samples)
        ss_total = float(((df_sub[column_a] - overall_mean) ** 2).sum())
        eta_sq = ss_between / ss_total if ss_total else None
        group_stats = {}
        for g, s in zip(groups, samples):
            n = int(len(s))
            mean = float(s.mean())
            std = float(s.std(ddof=1))
            se = std / np.sqrt(n) if n > 0 else np.nan
            tcrit = stats.t.ppf(0.975, n - 1) if n > 1 else None
            ci = None
            if tcrit is not None and se == se:
                ci = {"low": float(mean - tcrit * se), "high": float(mean + tcrit * se)}
            group_stats[g] = {"n": n, "mean": mean, "std": std, "ci_mean": ci}
        return {
            "test": "anova",
            "stat": float(stat),
            "p_value": float(pval),
            "group_labels": groups,
            "group_sizes": [int(len(s)) for s in samples],
            "group_stats": group_stats,
            "effect_size": {"eta_squared": float(eta_sq) if eta_sq is not None else None},
        }

    return {"error": "Unknown test type"}

@app.post("/distribution")
async def distribution(
    file: UploadFile = File(...),
    column: str = Form(...),
    bins: str = Form("20")
):
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))
    if column not in df.columns:
        return {"error": "Column not found"}
    series = pd.to_numeric(df[column], errors="coerce").dropna()
    if series.empty:
        return {"error": "No numeric data in selected column"}
    bins_val = max(5, int(bins))
    counts, edges = np.histogram(series, bins=bins_val)
    centers = ((edges[:-1] + edges[1:]) / 2).tolist()
    mean = float(series.mean())
    std = float(series.std(ddof=0))
    x_curve = np.linspace(series.min(), series.max(), 60)
    if std == 0:
        y_curve = np.zeros_like(x_curve)
    else:
        y_curve = stats.norm.pdf(x_curve, mean, std)
        bin_width = float(edges[1] - edges[0])
        y_curve = y_curve * len(series) * bin_width
    shapiro_result = None
    if 3 <= len(series) <= 5000:
        shapiro_stat, shapiro_p = stats.shapiro(series)
        shapiro_result = {"stat": float(shapiro_stat), "p_value": float(shapiro_p)}

    return {
        "column": column,
        "count": int(len(series)),
        "mean": mean,
        "std": std,
        "histogram": {
            "centers": centers,
            "counts": counts.astype(int).tolist()
        },
        "normal_curve": {
            "x": x_curve.tolist(),
            "y": y_curve.tolist()
        },
        "boxplot": {
            "values": series.tolist()
        },
        "shapiro_wilk": shapiro_result
    }

@app.post("/clean")
async def clean_data(
    file: UploadFile = File(...),
    drop_na: str = Form("false"),
    fill_mean: str = Form("false"),
    fill_median: str = Form("false"),
    remove_outliers_iqr: str = Form("false"),
    remove_outliers_zscore: str = Form("false"),
    drop_duplicates: str = Form("false"),
    drop_high_missing: str = Form("false"),
    missing_threshold: str = Form("50.0")
):
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))
    original_text = content.decode(errors="ignore")
    original_df_str = pd.read_csv(
        io.StringIO(original_text),
        dtype=str,
        keep_default_na=False,
        na_filter=False
    )
    
    # Convert string form values to bool
    drop_na = drop_na.lower() == "true"
    fill_mean = fill_mean.lower() == "true"
    fill_median = fill_median.lower() == "true"
    remove_outliers_iqr = remove_outliers_iqr.lower() == "true"
    remove_outliers_zscore = remove_outliers_zscore.lower() == "true"
    drop_duplicates = drop_duplicates.lower() == "true"
    drop_high_missing = drop_high_missing.lower() == "true"
    missing_threshold = float(missing_threshold)
    
    original_shape = df.shape
    operations = []
    
    decimals_by_col = {}
    numeric_pattern = re.compile(r"^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$")
    for col in original_df_str.columns:
        max_decimals = None
        for raw in original_df_str[col].tolist():
            if raw is None:
                continue
            value = str(raw).strip()
            if value == "":
                continue
            cleaned = value.replace(",", "")
            if not numeric_pattern.fullmatch(cleaned):
                continue
            if "e" in cleaned.lower():
                try:
                    dec = Decimal(cleaned)
                except InvalidOperation:
                    continue
                decimals = max(0, -dec.as_tuple().exponent)
            elif "." in cleaned:
                decimals = len(cleaned.split(".", 1)[1])
            else:
                decimals = 0
            if max_decimals is None or decimals > max_decimals:
                max_decimals = decimals
        if max_decimals is not None:
            decimals_by_col[col] = max_decimals

    # Drop columns with high percentage of missing values
    if drop_high_missing:
        threshold = missing_threshold / 100.0
        missing_pct = df.isna().mean()
        cols_to_drop = missing_pct[missing_pct > threshold].index.tolist()
        if cols_to_drop:
            df = df.drop(columns=cols_to_drop)
            operations.append(f"Dropped {len(cols_to_drop)} columns with >{missing_threshold}% missing")
    
    # Fill missing values with mean (do this BEFORE drop_na)
    if fill_mean:
        numeric_cols = df.select_dtypes(include=["number"]).columns
        filled = 0
        for col in numeric_cols:
            missing_count = int(df[col].isna().sum())
            if missing_count > 0:
                mean_val = df[col].mean()
                df[col] = df[col].fillna(mean_val)
                filled += missing_count
        if filled > 0:
            operations.append(f"Filled {filled} missing numeric values with mean")
    
    # Fill missing values with median (do this BEFORE drop_na)
    if fill_median:
        numeric_cols = df.select_dtypes(include=["number"]).columns
        filled = 0
        for col in numeric_cols:
            missing_count = int(df[col].isna().sum())
            if missing_count > 0:
                median_val = df[col].median()
                df[col] = df[col].fillna(median_val)
                filled += missing_count
        if filled > 0:
            operations.append(f"Filled {filled} missing numeric values with median")
    
    # Drop rows with any missing values (do this AFTER filling)
    if drop_na:
        before = len(df)
        df = df.dropna()
        dropped = before - len(df)
        if dropped > 0:
            operations.append(f"Dropped {dropped} rows with missing values")
    
    # Remove outliers using IQR method
    if remove_outliers_iqr:
        numeric_cols = df.select_dtypes(include=["number"]).columns
        before = len(df)
        for col in numeric_cols:
            Q1 = df[col].quantile(0.25)
            Q3 = df[col].quantile(0.75)
            IQR = Q3 - Q1
            lower = Q1 - 1.5 * IQR
            upper = Q3 + 1.5 * IQR
            df = df[(df[col] >= lower) & (df[col] <= upper)]
        removed = before - len(df)
        if removed > 0:
            operations.append(f"Removed {removed} outlier rows (IQR method)")
    
    # Remove outliers using Z-score method
    if remove_outliers_zscore:
        numeric_cols = df.select_dtypes(include=["number"]).columns
        before = len(df)
        for col in numeric_cols:
            z_scores = np.abs((df[col] - df[col].mean()) / df[col].std())
            df = df[z_scores < 3]
        removed = before - len(df)
        if removed > 0:
            operations.append(f"Removed {removed} outlier rows (Z-score method)")
    
    # Drop duplicate rows
    if drop_duplicates:
        before = len(df)
        df = df.drop_duplicates()
        removed = before - len(df)
        if removed > 0:
            operations.append(f"Removed {removed} duplicate rows")
    
    output_df = df.copy()
    numeric_cols = output_df.select_dtypes(include=["number"]).columns
    for col in numeric_cols:
        decimals = decimals_by_col.get(col, 0)
        output_df[col] = output_df[col].apply(
            lambda v: "" if pd.isna(v) else f"{v:.{decimals}f}"
        )

    # Convert cleaned dataframe to CSV
    output = io.StringIO()
    output_df.to_csv(output, index=False)
    output.seek(0)
    
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=cleaned_data.csv",
            "X-Operations": "; ".join(operations) if operations else "No operations applied",
            "X-Original-Shape": f"{original_shape[0]}x{original_shape[1]}",
            "X-New-Shape": f"{df.shape[0]}x{df.shape[1]}"
        }
    )

@app.post("/get_data")
async def get_data(
    file: UploadFile = File(...),
    page: str = Form("0"),
    page_size: str = Form("20")
):
    """Get paginated data for editing"""
    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        df_display = pd.read_csv(
            io.BytesIO(content),
            dtype=str,
            keep_default_na=False,
            na_filter=False
        )
        
        page = int(page)
        page_size = int(page_size)
        
        total_rows = len(df)
        if page_size == -1:
            start = 0
            end = total_rows
        else:
            start = page * page_size
            end = start + page_size
        
        page_data = df_display.iloc[start:end]
        
        # Convert to list, replacing NaN with None
        data_list = []
        for _, row in page_data.iterrows():
            row_list = []
            for val in row:
                row_list.append(val)
            data_list.append(row_list)
        
        return {
            "columns": df_display.columns.tolist(),
            "data": data_list,
            "total_rows": total_rows,
            "page": page,
            "page_size": page_size,
            "total_pages": 1 if page_size == -1 else (total_rows + page_size - 1) // page_size
        }
    except Exception as e:
        return {"error": str(e)}

@app.post("/update_data")
async def update_data(
    file: UploadFile = File(...),
    row_index: str = Form(...),
    column: str = Form(...),
    value: str = Form(...)
):
    """Update a single cell in the dataset"""
    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        row_index = int(row_index)
        
        # Convert value to appropriate type
        if value.strip().lower() in ["", "nan", "none", "null"]:
            df.at[row_index, column] = np.nan
        else:
            if df[column].dtype in ['int64', 'float64']:
                # Preserve integer look when possible
                try:
                    num_val = float(value)
                    if num_val.is_integer():
                        df.at[row_index, column] = int(num_val)
                        return StreamingResponse(
                            io.BytesIO(df.to_csv(index=False).encode()),
                            media_type="text/csv",
                            headers={"Content-Disposition": "attachment; filename=updated_data.csv"}
                        )
                except ValueError:
                    pass
            # Try to convert to number if the column is numeric
            if df[column].dtype in ['int64', 'float64']:
                try:
                    df.at[row_index, column] = float(value)
                except ValueError:
                    df.at[row_index, column] = value
            else:
                df.at[row_index, column] = value
        
        # Return updated CSV
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=updated_data.csv"}
        )
    except Exception as e:
        return {"error": str(e)}
