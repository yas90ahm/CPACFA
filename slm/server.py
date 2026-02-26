"""FastAPI wrapper for Sovereign SLM models.

Serves two classification endpoints:
  POST /classify/coa  -- Chart of Accounts line-item mapping
  POST /classify/cf   -- Cash Flow classification (Operating/Investing/Financing)

Models are loaded into memory on startup. This service is internal-only
(no authentication, not exposed to the public internet).
"""

import os
import sys
import time
from contextlib import asynccontextmanager
from typing import Union

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# Add scripts/ to sys.path so we can import the prediction modules.
# The scripts use relative paths (Path("models/...")) that resolve from CWD,
# so we also ensure CWD is the slm/ directory.
_slm_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(_slm_dir)
sys.path.insert(0, os.path.join(_slm_dir, "scripts"))

# These imports trigger model loading (module-level code in each script).
# FAISS index + SentenceTransformer for COA, DistilBERT for CF.
_coa_classify = None
_cf_classify = None
_models_loaded = False
_startup_time: float = 0

COA_MODEL_VERSION = "coa_v1"
CF_MODEL_VERSION = "cf_v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models on startup."""
    global _coa_classify, _cf_classify, _models_loaded, _startup_time
    t0 = time.time()

    from coa_predict import classify_account
    from cf_predict import classify_cf

    # Force-load the sentence-transformer (COA) eagerly so first request isn't slow.
    classify_account("warmup")
    # Force-load the DistilBERT model (CF) eagerly.
    classify_cf("warmup")

    _coa_classify = classify_account
    _cf_classify = classify_cf
    _models_loaded = True
    _startup_time = round(time.time() - t0, 2)

    print(f"Models loaded in {_startup_time}s", flush=True)
    yield


app = FastAPI(
    title="Sovereign SLM Service",
    description="COA mapping and Cash Flow classification models",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------- Request / Response schemas ----------


class SingleAccountRequest(BaseModel):
    account_name: str = Field(..., min_length=1, description="Account name to classify")


class BatchAccountRequest(BaseModel):
    accounts: list[str] = Field(..., min_length=1, description="List of account names")


class COAResult(BaseModel):
    account_name: str
    line_item_id: str
    line_item_label: str
    statement: str
    confidence: float
    confidence_band: str
    tier: str
    alternatives: list[dict]
    model_version: str = COA_MODEL_VERSION


class CFResult(BaseModel):
    account_name: str
    classification: str
    confidence: float
    confidence_band: str
    source: str
    rule_pattern: Union[str, None]
    alternatives: list[dict]
    model_version: str = CF_MODEL_VERSION


# ---------- COA endpoints ----------


@app.post("/classify/coa", response_model=Union[COAResult, list[COAResult]])
async def classify_coa(
    body: Union[SingleAccountRequest, BatchAccountRequest],
):
    """Classify account name(s) into standardized FS line items."""
    if not _models_loaded:
        raise HTTPException(status_code=503, detail="Models not loaded yet")

    if isinstance(body, SingleAccountRequest):
        result = _coa_classify(body.account_name)
        return COAResult(account_name=body.account_name, **result)

    # Batch
    results = []
    for name in body.accounts:
        r = _coa_classify(name)
        results.append(COAResult(account_name=name, **r))
    return results


# ---------- CF endpoints ----------


@app.post("/classify/cf", response_model=Union[CFResult, list[CFResult]])
async def classify_cf_endpoint(
    body: Union[SingleAccountRequest, BatchAccountRequest],
):
    """Classify account name(s) as Operating, Investing, or Financing."""
    if not _models_loaded:
        raise HTTPException(status_code=503, detail="Models not loaded yet")

    if isinstance(body, SingleAccountRequest):
        result = _cf_classify(body.account_name)
        return CFResult(account_name=body.account_name, **result)

    # Batch
    results = []
    for name in body.accounts:
        r = _cf_classify(name)
        results.append(CFResult(account_name=name, **r))
    return results


# ---------- Health ----------


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "models_loaded": _models_loaded,
        "startup_seconds": _startup_time,
        "versions": {
            "coa": COA_MODEL_VERSION,
            "cf": CF_MODEL_VERSION,
        },
    }
