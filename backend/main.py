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
import json
from statsmodels.stats.power import TTestIndPower, TTestPower, FTestAnovaPower
import re
from decimal import Decimal, InvalidOperation

def _apply_transform(series, transform):
    if transform == "log":
        if series.min() <= 0:
            return None, f"Log transform requires all values > 0. Found minimum = {series.min()}."
        return np.log(series), None
    if transform == "sqrt":
        if series.min() < 0:
            return None, f"Square-root transform requires all values >= 0. Found minimum = {series.min()}."
        return np.sqrt(series), None
    return series, None

def _outlier_mask(series):
    q1 = series.quantile(0.25)
    q3 = series.quantile(0.75)
    iqr = q3 - q1
    if iqr <= 0:
        return pd.Series([False] * len(series), index=series.index)
    lower = q1 - 3 * iqr
    upper = q3 + 3 * iqr
    return (series < lower) | (series > upper)

def _derive_type(series):
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    return "categorical"

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
        "nunique": nunique.astype(int).to_dict(),
    }

    duplicate_mask = df.duplicated(keep=False)
    duplicate_indices = df.index[duplicate_mask].tolist()
    result["duplicate_rows"] = {
        "count": int(len(duplicate_indices)),
        "indices": [int(i) + 1 for i in duplicate_indices[:100]]
    }
    
    numeric = df.select_dtypes(include="number")
    if not numeric.empty:
        result["describe"] = numeric.describe().to_dict()
        result["corr"] = numeric.corr(numeric_only=True).to_dict()
        extreme_flags = {}
        dist_flags = {}
        for col in numeric.columns:
            series = numeric[col].dropna()
            if series.empty:
                extreme_flags[col] = {"count": 0}
                dist_flags[col] = {"right_skewed": False, "left_skewed": False, "heavy_tails": False}
                continue
            q1 = series.quantile(0.25)
            q3 = series.quantile(0.75)
            iqr = q3 - q1
            lower = q1 - 3 * iqr
            upper = q3 + 3 * iqr
            outlier_count = int(((series < lower) | (series > upper)).sum())
            skew = float(series.skew())
            kurt = float(series.kurt())
            dist_flags[col] = {
                "right_skewed": skew > 0.5,
                "left_skewed": skew < -0.5,
                "heavy_tails": kurt > 3,
            }
            extreme_flags[col] = {"count": outlier_count}
        result["extreme_value_flags"] = extreme_flags
        result["distribution_flags"] = dist_flags
    
    return result

@app.post("/regress")
async def regress(
    file: UploadFile = File(...),
    x_cols: list[str] = Form(...),
    y_col: str = Form(...)
):
    try:
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
        if len(x_cols) < 2:
            for col in x_cols:
                vif_values[col] = 1.0
        else:
            X_no_const = sub[x_cols].values
            for i, col in enumerate(x_cols):
                vif_values[col] = float(variance_inflation_factor(X_no_const, i))

        return {
            "model_type": "linear",
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
    except Exception as e:
        return {"error": str(e)}

@app.post("/logistic")
async def logistic(
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

    y = pd.to_numeric(sub[y_col], errors="coerce")
    if y.isna().any():
        return {"error": "Y column must be numeric (0/1)"}
    unique_vals = sorted(y.unique().tolist())
    if unique_vals not in ([0, 1], [0.0, 1.0]):
        return {"error": "Y column must be binary (0/1)"}

    X = sub[x_cols]
    X = sm.add_constant(X)
    try:
        model = sm.Logit(y, X).fit(disp=False)
    except Exception as e:
        return {"error": f"Logistic regression failed: {e}"}

    probs = model.predict(X)
    preds = (probs >= 0.5).astype(int)

    tp = int(((preds == 1) & (y == 1)).sum())
    tn = int(((preds == 0) & (y == 0)).sum())
    fp = int(((preds == 1) & (y == 0)).sum())
    fn = int(((preds == 0) & (y == 1)).sum())

    total = len(y)
    accuracy = (tp + tn) / total if total else 0.0
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0

    # ROC curve
    thresholds = sorted(set(probs.tolist()), reverse=True)
    thresholds = [1.0] + thresholds + [0.0]
    tpr = []
    fpr = []
    for thresh in thresholds:
        pred_t = (probs >= thresh).astype(int)
        tp_t = int(((pred_t == 1) & (y == 1)).sum())
        tn_t = int(((pred_t == 0) & (y == 0)).sum())
        fp_t = int(((pred_t == 1) & (y == 0)).sum())
        fn_t = int(((pred_t == 0) & (y == 1)).sum())
        tpr_val = tp_t / (tp_t + fn_t) if (tp_t + fn_t) else 0.0
        fpr_val = fp_t / (fp_t + tn_t) if (fp_t + tn_t) else 0.0
        tpr.append(tpr_val)
        fpr.append(fpr_val)

    auc = 0.0
    for i in range(1, len(fpr)):
        auc += (fpr[i] - fpr[i - 1]) * (tpr[i] + tpr[i - 1]) / 2

    odds_ratios = {col: float(np.exp(model.params[col])) for col in x_cols}

    return {
        "model_type": "logistic",
        "n": int(total),
        "x_cols": x_cols,
        "y_col": y_col,
        "intercept": float(model.params["const"]),
        "coefficients": {col: float(model.params[col]) for col in x_cols},
        "odds_ratios": odds_ratios,
        "p_values": {col: float(model.pvalues[col]) for col in x_cols},
        "accuracy": float(accuracy),
        "precision": float(precision),
        "recall": float(recall),
        "confusion_matrix": {"tp": tp, "tn": tn, "fp": fp, "fn": fn},
        "roc": {"fpr": fpr, "tpr": tpr, "auc": float(auc)},
        "probabilities": probs.tolist(),
        "y_true": y.astype(int).tolist(),
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

@app.post("/phase4_diagnostics")
async def phase4_diagnostics(
    file: UploadFile = File(...),
    intent_type: str = Form(...),
    outcome: str = Form(""),
    predictors: list[str] = Form([]),
    group: str = Form(""),
    var_a: str = Form(""),
    var_b: str = Form(""),
    transform: str = Form("none"),
    outlier_mode: str = Form("flag"),
    outlier_rule: str = Form("3xIQR")
):
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))

    if intent_type not in ["predict", "compare_means", "association"]:
        return {"error": "Unknown intent type"}

    diagnostics = {}
    flags = {}
    warnings = []
    thresholds = {"outlier_rule": outlier_rule}
    excluded_count = 0

    if intent_type == "predict":
        if not outcome or not predictors:
            return {"error": "Outcome and predictors required"}
        if outcome not in df.columns:
            return {"error": "Outcome column not found"}
        for col in predictors:
            if col not in df.columns:
                return {"error": f"Predictor {col} not found"}

        sub = df[predictors + [outcome]].dropna()
        if sub.empty:
            return {"error": "No valid rows after removing missing values"}

        y_raw = pd.to_numeric(sub[outcome], errors="coerce").dropna()
        sub = sub.loc[y_raw.index]
        y_raw = y_raw.astype(float)
        if y_raw.empty:
            return {"error": "Outcome is not numeric"}

        y, err = _apply_transform(y_raw, transform)
        if err:
            return {"error": err}

        outlier_mask = _outlier_mask(y_raw)
        outlier_count = int(outlier_mask.sum())
        flags["outlierFlagged"] = outlier_count > 0
        if outlier_mode == "exclude" and outlier_count > 0:
            sub = sub.loc[~outlier_mask]
            y_raw = y_raw.loc[~outlier_mask]
            y, _ = _apply_transform(y_raw, transform)
            excluded_count = outlier_count

        X = sub[predictors]
        X = sm.add_constant(X)
        y = y.astype(float)
        model = sm.OLS(y, X).fit()
        influence = model.get_influence()

        residuals = model.resid
        fitted = model.fittedvalues
        shapiro_result = None
        if 3 <= len(residuals) <= 2000:
            shapiro_stat, shapiro_p = stats.shapiro(residuals)
            shapiro_result = {"stat": float(shapiro_stat), "p_value": float(shapiro_p)}
            flags["normalityPoor"] = float(shapiro_p) < 0.05
        else:
            flags["normalityPoor"] = False

        bp_stat, bp_p, _, _ = het_breuschpagan(residuals, X)
        flags["heteroskedastic"] = float(bp_p) < 0.05

        cooks = influence.cooks_distance[0]
        flags["influentialPoints"] = bool(np.any(cooks > 4 / max(len(sub), 1)))

        vif_values = []
        X_no_const = sub[predictors].values
        if len(predictors) >= 2 and X_no_const.size > 0:
            for i in range(len(predictors)):
                try:
                    vif_values.append(float(variance_inflation_factor(X_no_const, i)))
                except Exception:
                    vif_values.append(np.nan)
        vif_max = max([v for v in vif_values if np.isfinite(v)], default=None)
        flags["multicollinearity"] = bool(vif_max and vif_max > 10)

        skewness = float(stats.skew(y)) if len(y) > 2 else 0.0
        flags["rightSkewed"] = skewness > 1
        flags["npWarning"] = len(sub) < 5 * max(len(predictors), 1)

        diagnostics = {
            "n": int(len(sub)),
            "p": int(len(predictors)),
            "outcome_min": float(y_raw.min()),
            "outlier_count": outlier_count,
            "shapiro_p": float(shapiro_result["p_value"]) if shapiro_result else None,
            "bp_p": float(bp_p),
            "vif_max": float(vif_max) if vif_max is not None else None,
            "residuals": residuals.tolist(),
            "fitted": fitted.tolist(),
        }

    if intent_type == "compare_means":
        if not outcome or not group:
            return {"error": "Outcome and group required"}
        if outcome not in df.columns or group not in df.columns:
            return {"error": "Selected columns not found"}

        sub = df[[outcome, group]].dropna()
        if sub.empty:
            return {"error": "No valid rows after removing missing values"}

        y_raw = pd.to_numeric(sub[outcome], errors="coerce").dropna()
        sub = sub.loc[y_raw.index]
        y_raw = y_raw.astype(float)
        if y_raw.empty:
            return {"error": "Outcome is not numeric"}

        y, err = _apply_transform(y_raw, transform)
        if err:
            return {"error": err}

        outlier_mask = _outlier_mask(y_raw)
        outlier_count = int(outlier_mask.sum())
        flags["outlierFlagged"] = outlier_count > 0
        if outlier_mode == "exclude" and outlier_count > 0:
            sub = sub.loc[~outlier_mask]
            y_raw = y_raw.loc[~outlier_mask]
            y, _ = _apply_transform(y_raw, transform)
            excluded_count = outlier_count

        groups = sub[group].astype(str).unique().tolist()
        samples = [y[sub[group].astype(str) == g] for g in groups]
        group_sizes = [{"name": g, "n": int(len(s))} for g, s in zip(groups, samples)]
        flags["groupImbalance"] = bool(groups and (len(groups) > 20 or min([len(s) for s in samples if len(s) > 0] or [0]) < 5))

        levene_p = None
        if len(samples) >= 2:
            stat, levene_p = stats.levene(*samples)
            flags["heteroskedastic"] = float(levene_p) < 0.05
        else:
            flags["heteroskedastic"] = False

        normality_flags = []
        for s in samples:
            if 3 <= len(s) <= 2000:
                _, pval = stats.shapiro(s)
                normality_flags.append(pval < 0.05)
        flags["normalityPoor"] = any(normality_flags) if normality_flags else False

        diagnostics = {
            "n": int(len(sub)),
            "outcome_min": float(y_raw.min()),
            "outlier_count": outlier_count,
            "group_sizes": group_sizes,
            "levene_p": float(levene_p) if levene_p is not None else None,
        }

    if intent_type == "association":
        if not var_a or not var_b:
            return {"error": "Two variables required"}
        if var_a not in df.columns or var_b not in df.columns:
            return {"error": "Selected columns not found"}

        sub = df[[var_a, var_b]].dropna()
        if sub.empty:
            return {"error": "No valid rows after removing missing values"}

        type_a = _derive_type(sub[var_a])
        type_b = _derive_type(sub[var_b])
        assoc_type = f"{type_a}-{type_b}"
        diagnostics = {"association_type": assoc_type}

        if type_a == "categorical" and type_b == "categorical":
            table = pd.crosstab(sub[var_a].astype(str), sub[var_b].astype(str))
            chi2, pval, dof, expected = stats.chi2_contingency(table)
            flags["lowExpectedCounts"] = bool((expected < 5).any())
            diagnostics.update({
                "low_expected": flags["lowExpectedCounts"],
                "chi2_p": float(pval),
                "table": table.to_dict()
            })
        elif type_a == "numeric" and type_b == "numeric":
            a_vals = pd.to_numeric(sub[var_a], errors="coerce").dropna().astype(float)
            b_vals = pd.to_numeric(sub[var_b], errors="coerce").dropna().astype(float)
            n = min(len(a_vals), len(b_vals))
            a_vals = a_vals.iloc[:n]
            b_vals = b_vals.iloc[:n]
            if n == 0:
                return {"error": "No numeric data in selected columns"}
            corr = float(np.corrcoef(a_vals, b_vals)[0, 1])
            z_a = np.abs((a_vals - a_vals.mean()) / (a_vals.std() or 1))
            z_b = np.abs((b_vals - b_vals.mean()) / (b_vals.std() or 1))
            outlier_count = int(((z_a > 3) | (z_b > 3)).sum())
            flags["outlierFlagged"] = outlier_count > 0
            diagnostics.update({
                "correlation": corr,
                "outlier_count": outlier_count,
            })
        else:
            numeric_col = var_a if type_a == "numeric" else var_b
            group_col = var_b if numeric_col == var_a else var_a
            sub = sub[[numeric_col, group_col]].dropna()
            y_raw = pd.to_numeric(sub[numeric_col], errors="coerce").dropna().astype(float)
            sub = sub.loc[y_raw.index]
            groups = sub[group_col].astype(str).unique().tolist()
            samples = [y_raw[sub[group_col].astype(str) == g] for g in groups]
            group_sizes = [{"name": g, "n": int(len(s))} for g, s in zip(groups, samples)]
            flags["groupImbalance"] = bool(groups and (len(groups) > 20 or min([len(s) for s in samples if len(s) > 0] or [0]) < 5))
            diagnostics.update({
                "group_sizes": group_sizes,
            })

    return {
        "intent_type": intent_type,
        "diagnostics": diagnostics,
        "flags": flags,
        "warnings": warnings,
        "thresholds": thresholds,
        "adjustments": {
            "outlier_rule": outlier_rule,
            "excluded_count": excluded_count,
            "transform": transform,
        },
        "key_metrics": diagnostics,
        "outcome_min": diagnostics.get("outcome_min") if isinstance(diagnostics, dict) else None,
        "outlier_count": diagnostics.get("outlier_count") if isinstance(diagnostics, dict) else 0,
    }

@app.post("/visualizations")
async def visualizations(
    file: UploadFile = File(...),
    columns: list[str] = Form(...)
):
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))
    if not columns or len(columns) == 0:
        return {"error": "Select at least one column"}
    for col in columns:
        if col not in df.columns:
            return {"error": f"Column {col} not found"}
    if len(columns) > 6:
        return {"error": "Select up to 6 columns"}

    sub = df[columns].dropna()
    if sub.empty:
        return {"error": "No data after removing missing values"}

    scatter_data = {col: sub[col].tolist() for col in columns}
    density = {}
    for col in columns:
        values = pd.to_numeric(sub[col], errors="coerce").dropna()
        if values.empty:
            density[col] = {"values": [], "kde": {"x": [], "y": []}, "rug": []}
            continue
        x_min = float(values.min())
        x_max = float(values.max())
        x_grid = np.linspace(x_min, x_max, 100)
        if len(values) < 2 or x_min == x_max:
            y_grid = np.zeros_like(x_grid)
        else:
            kde = stats.gaussian_kde(values)
            y_grid = kde(x_grid)
        density[col] = {
            "values": values.tolist(),
            "kde": {"x": x_grid.tolist(), "y": y_grid.tolist()},
            "rug": values.sample(min(len(values), 200), random_state=1).tolist()
        }

    return {
        "columns": columns,
        "scatter_matrix": scatter_data,
        "density": density
    }

@app.post("/model_compare")
async def model_compare(
    file: UploadFile = File(...),
    y_col: str = Form(...),
    models_json: str = Form(...),
    cv_folds: str = Form("5")
):
    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        if y_col not in df.columns:
            return {"error": "Y column not found"}

        try:
            models = json.loads(models_json)
        except Exception:
            return {"error": "Invalid models JSON"}

        if not isinstance(models, list) or len(models) < 1:
            return {"error": "Provide at least one model"}

        folds = max(2, int(cv_folds))

        results = []
        fitted = {}

        for model in models:
            model_id = str(model.get("id", "model"))
            x_cols = model.get("x_cols", [])
            if not x_cols:
                return {"error": f"Model {model_id} has no predictors"}

            for col in x_cols:
                if col not in df.columns:
                    return {"error": f"Column {col} not found"}

            sub = df[x_cols + [y_col]].apply(pd.to_numeric, errors="coerce").dropna()
            if sub.empty:
                return {"error": f"No valid data for model {model_id}"}

            X = sm.add_constant(sub[x_cols])
            y = sub[y_col]
            model_fit = sm.OLS(y, X).fit()

            n_obs = len(sub)
            k = min(folds, n_obs)
            if k < 2:
                return {"error": "Not enough data for cross-validation"}

            rng = np.random.default_rng(1)
            idx = rng.permutation(n_obs)
            splits = np.array_split(idx, k)
            mses = []
            for i in range(k):
                test_idx = splits[i]
                train_idx = np.concatenate([splits[j] for j in range(k) if j != i])
                X_train = sm.add_constant(sub.iloc[train_idx][x_cols])
                y_train = sub.iloc[train_idx][y_col]
                X_test = sm.add_constant(sub.iloc[test_idx][x_cols])
                y_test = sub.iloc[test_idx][y_col]
                fit = sm.OLS(y_train, X_train).fit()
                preds = fit.predict(X_test)
                mse = float(((y_test - preds) ** 2).mean())
                mses.append(mse)

            results.append({
                "id": model_id,
                "x_cols": x_cols,
                "n": int(n_obs),
                "aic": float(model_fit.aic),
                "bic": float(model_fit.bic),
                "r2_adj": float(model_fit.rsquared_adj),
                "cv_mse_mean": float(np.mean(mses)),
                "cv_mse_std": float(np.std(mses)),
            })

            fitted[model_id] = {"fit": model_fit, "x_cols": x_cols, "data": sub}

        nested_tests = []
        ids = list(fitted.keys())
        for i in range(len(ids)):
            for j in range(len(ids)):
                if i == j:
                    continue
                small_id = ids[i]
                large_id = ids[j]
                small_cols = set(fitted[small_id]["x_cols"])
                large_cols = set(fitted[large_id]["x_cols"])
                if small_cols.issubset(large_cols) and len(large_cols) > len(small_cols):
                    sub = df[list(large_cols) + [y_col]].apply(pd.to_numeric, errors="coerce").dropna()
                    if sub.empty:
                        continue
                    X_large = sm.add_constant(sub[list(large_cols)])
                    X_small = sm.add_constant(sub[list(small_cols)])
                    y = sub[y_col]
                    fit_large = sm.OLS(y, X_large).fit()
                    fit_small = sm.OLS(y, X_small).fit()
                    f_stat, p_val, df_diff = fit_large.compare_f_test(fit_small)
                    nested_tests.append({
                        "smaller": small_id,
                        "larger": large_id,
                        "f_stat": float(f_stat),
                        "p_value": float(p_val),
                        "df_diff": int(df_diff),
                    })

        return {
            "y_col": y_col,
            "models": results,
            "nested_tests": nested_tests,
        }
    except Exception as e:
        return {"error": str(e)}

@app.post("/power")
async def power_analysis(
    test_type: str = Form(...),
    mode: str = Form(...),
    effect_size: str = Form(...),
    alpha: str = Form("0.05"),
    power: str = Form("0.8"),
    n: str = Form(""),
    groups: str = Form("2")
):
    try:
        effect = float(effect_size)
        alpha_val = float(alpha)
        power_val = float(power)
        n_val = float(n) if n else None
        groups_val = int(groups)
    except Exception:
        return {"error": "Invalid numeric input"}

    if effect <= 0:
        return {"error": "Effect size must be > 0"}

    if test_type == "two_sample_t":
        model = TTestIndPower()
        if mode == "required_n":
            n_per_group = model.solve_power(effect_size=effect, power=power_val, alpha=alpha_val, ratio=1.0)
            return {
                "test": test_type,
                "mode": mode,
                "n_per_group": float(n_per_group),
                "total_n": float(n_per_group * 2),
            }
        if mode == "post_hoc":
            if not n_val:
                return {"error": "Provide sample size per group"}
            achieved = model.power(effect_size=effect, nobs1=n_val, alpha=alpha_val, ratio=1.0)
            return {"test": test_type, "mode": mode, "power": float(achieved)}

    if test_type == "paired_t":
        model = TTestPower()
        if mode == "required_n":
            n_required = model.solve_power(effect_size=effect, power=power_val, alpha=alpha_val)
            return {"test": test_type, "mode": mode, "n": float(n_required)}
        if mode == "post_hoc":
            if not n_val:
                return {"error": "Provide sample size"}
            achieved = model.power(effect_size=effect, nobs=n_val, alpha=alpha_val)
            return {"test": test_type, "mode": mode, "power": float(achieved)}

    if test_type == "anova":
        model = FTestAnovaPower()
        if groups_val < 2:
            return {"error": "Groups must be at least 2"}
        if mode == "required_n":
            n_per_group = model.solve_power(effect_size=effect, power=power_val, alpha=alpha_val, k_groups=groups_val)
            return {
                "test": test_type,
                "mode": mode,
                "n_per_group": float(n_per_group),
                "total_n": float(n_per_group * groups_val),
                "groups": groups_val,
            }
        if mode == "post_hoc":
            if not n_val:
                return {"error": "Provide sample size per group"}
            achieved = model.power(effect_size=effect, nobs=n_val, alpha=alpha_val, k_groups=groups_val)
            return {"test": test_type, "mode": mode, "power": float(achieved)}

    return {"error": "Unknown test or mode"}

@app.post("/transform")
async def transform(
    file: UploadFile = File(...),
    column: str = Form(...),
    transform_type: str = Form(...),
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

    def build_dist(values):
        counts, edges = np.histogram(values, bins=bins_val)
        centers = ((edges[:-1] + edges[1:]) / 2).tolist()
        mean = float(values.mean())
        std = float(values.std(ddof=0))
        x_curve = np.linspace(values.min(), values.max(), 60)
        if std == 0:
            y_curve = np.zeros_like(x_curve)
        else:
            y_curve = stats.norm.pdf(x_curve, mean, std)
            bin_width = float(edges[1] - edges[0])
            y_curve = y_curve * len(values) * bin_width
        shapiro_result = None
        if 3 <= len(values) <= 5000:
            shapiro_stat, shapiro_p = stats.shapiro(values)
            shapiro_result = {"stat": float(shapiro_stat), "p_value": float(shapiro_p)}
        return {
            "count": int(len(values)),
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
            "shapiro_wilk": shapiro_result
        }

    before = build_dist(series)

    transformed = None
    boxcox_lambda = None
    if transform_type == "log":
        if (series <= 0).any():
            return {"error": "Log transform requires all values > 0"}
        transformed = np.log(series)
    elif transform_type == "sqrt":
        if (series < 0).any():
            return {"error": "Sqrt transform requires all values >= 0"}
        transformed = np.sqrt(series)
    elif transform_type == "boxcox":
        if (series <= 0).any():
            return {"error": "Box-Cox requires all values > 0"}
        transformed, boxcox_lambda = stats.boxcox(series)
    else:
        return {"error": "Unknown transform type"}

    after = build_dist(pd.Series(transformed))

    return {
        "column": column,
        "transform": transform_type,
        "before": before,
        "after": after,
        "boxcox_lambda": float(boxcox_lambda) if boxcox_lambda is not None else None
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
