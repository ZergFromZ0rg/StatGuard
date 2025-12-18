from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
from pydantic import BaseModel
import statsmodels.api as sm



app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ok"}

@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))

    result = {
        "shape": {"rows": int(df.shape[0]), "cols": int(df.shape[1])},
        "columns": df.columns.tolist(),
        "missing_by_column": df.isna().sum().astype(int).to_dict(),
    }

    numeric = df.select_dtypes(include="number")
    if not numeric.empty:
        result["describe"] = numeric.describe().to_dict()
        result["corr"] = numeric.corr(numeric_only=True).to_dict()

    return result

class RegressRequest(BaseModel):
    x_col: str
    y_col: str

@app.post("/regress")
async def regress(req: RegressRequest, file: UploadFile = File(...)):
    content = await file.read()
    df = pd.read_csv(io.BytesIO(content))

    if req.x_col not in df.columns or req.y_col not in df.columns:
        return {"error": "x_col or y_col not found in dataset columns"}

    sub = df[[req.x_col, req.y_col]].dropna()
    x = sub[req.x_col]
    y = sub[req.y_col]

    X = sm.add_constant(x)
    model = sm.OLS(y, X).fit()

    return {
        "n": int(len(sub)),
        "x_col": req.x_col,
        "y_col": req.y_col,
        "intercept": float(model.params["const"]),
        "slope": float(model.params[req.x_col]),
        "r2": float(model.rsquared),
        "p_value_slope": float(model.pvalues[req.x_col]),
    }
