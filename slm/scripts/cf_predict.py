"""Cash Flow classification — hybrid inference pipeline.

Architecture: rule-based overrides + fine-tuned DistilBERT classifier.

  Step 1: Check account name against pattern rules (cf_rules.json)
  Step 2: If no rule match, run DistilBERT model
  Step 3: Return result with source indicator ("rule" or "model")

Usage:
  python scripts/cf_predict.py                     # run built-in demo
  python scripts/cf_predict.py "Account Name"      # classify one account
"""

import json
import subprocess
import sys
from pathlib import Path

def _ensure():
    for mod, pip_name in [("torch", "torch"), ("transformers", "transformers")]:
        try:
            __import__(mod)
        except ImportError:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", pip_name],
                stdout=subprocess.DEVNULL,
            )

_ensure()

import torch
import torch.nn.functional as F
from transformers import DistilBertTokenizer, DistilBertForSequenceClassification

PROD_DIR = Path("models/cf_production")
MODEL_DIR = PROD_DIR / "model"

with open(PROD_DIR / "config.json", encoding="utf-8") as f:
    config = json.load(f)

with open(PROD_DIR / "cf_rules.json", encoding="utf-8") as f:
    RULES = json.load(f)["rules"]

LABEL_MAP_INV = {v: k for k, v in config["label_map"].items()}
HIGH_THRESH = config["high_confidence_threshold"]
MED_THRESH = config["medium_confidence_threshold"]
MAX_LEN = config["max_length"]

_tokenizer = None
_model = None

def _load_model():
    global _tokenizer, _model
    if _model is None:
        _tokenizer = DistilBertTokenizer.from_pretrained(str(MODEL_DIR))
        _model = DistilBertForSequenceClassification.from_pretrained(str(MODEL_DIR))
        _model.eval()

def _apply_rules(account_name: str):
    name_lower = account_name.strip().lower()
    for rule in RULES:
        if rule["pattern"].lower() in name_lower:
            return rule["classification"], rule
    return None, None

def classify_cf(account_name: str) -> dict:
    """Classify an account name as Operating, Investing, or Financing.

    Uses hybrid pipeline: rules first, then DistilBERT model.

    Returns:
        dict with classification, confidence, confidence_band, source,
        and alternatives.
    """
    rule_cls, matched_rule = _apply_rules(account_name)

    if rule_cls is not None:
        return {
            "classification": rule_cls,
            "confidence": 1.0,
            "confidence_band": "high",
            "source": "rule",
            "rule_pattern": matched_rule["pattern"],
            "alternatives": [{"classification": rule_cls, "probability": 1.0}],
        }

    _load_model()

    enc = _tokenizer(
        account_name, padding="max_length", truncation=True,
        max_length=MAX_LEN, return_tensors="pt",
    )

    with torch.no_grad():
        outputs = _model(input_ids=enc["input_ids"],
                         attention_mask=enc["attention_mask"])
        probs = F.softmax(outputs.logits, dim=-1)[0]

    max_prob = probs.max().item()
    pred_idx = probs.argmax().item()
    pred_cls = LABEL_MAP_INV[pred_idx]

    if max_prob >= HIGH_THRESH:
        band = "high"
    elif max_prob >= MED_THRESH:
        band = "medium"
    else:
        band = "low"

    sorted_probs = sorted(enumerate(probs.tolist()), key=lambda x: -x[1])
    alternatives = [
        {"classification": LABEL_MAP_INV[idx], "probability": round(p, 4)}
        for idx, p in sorted_probs
    ]

    return {
        "classification": pred_cls,
        "confidence": round(max_prob, 4),
        "confidence_band": band,
        "source": "model",
        "rule_pattern": None,
        "alternatives": alternatives,
    }

DEMO_ACCOUNTS = [
    ("Depreciation Expense", "obvious"),
    ("Purchase of Equipment", "obvious"),
    ("Repayment of Long-term Debt", "obvious"),
    ("Accounts Receivable, Net", "obvious"),
    ("Dividends Paid to Shareholders", "obvious"),
    ("Deferred Revenue, Current", "moderate"),
    ("Amortization of Debt Issuance Costs", "moderate"),
    ("Operating Lease, Right-of-Use Asset", "moderate"),
    ("Gain on Sale of Investments", "moderate"),
    ("Restructuring and Severance Charges", "moderate"),
    ("Monthly SaaS Subscription Revenue", "realistic"),
    ("AWS Hosting Bill", "realistic"),
    ("Office Lease Security Deposit", "realistic"),
    ("Loan Payment - Line of Credit", "realistic"),
    ("Stock Option Exercise by Employee", "realistic"),
]

def run_demo():
    print("=" * 70)
    print("CASH FLOW CLASSIFIER (DistilBERT + Rules) \u2014 DEMO")
    print("=" * 70)

    current_cat = None
    for name, cat in DEMO_ACCOUNTS:
        if cat != current_cat:
            current_cat = cat
            headers = {"obvious": "OBVIOUS", "moderate": "MODERATE (XBRL-style)",
                       "realistic": "REALISTIC (private company)"}
            print(f"\n  {headers[cat]}")

        r = classify_cf(name)
        icon = {"high": "+", "medium": "~", "low": "?"}[r["confidence_band"]]
        if r["source"] == "rule":
            tag = f" [rule: {r['rule_pattern']}]"
            print(f"    [{icon}] 1.000  \u201c{name}\u201d")
            print(f"           \u2192 {r['classification']}{tag}")
        else:
            alts = r["alternatives"]
            o = [a for a in alts if a["classification"] == "Operating"][0]["probability"]
            i_ = [a for a in alts if a["classification"] == "Investing"][0]["probability"]
            fi = [a for a in alts if a["classification"] == "Financing"][0]["probability"]
            print(f"    [{icon}] {r['confidence']:.3f}  \u201c{name}\u201d")
            print(f"           \u2192 {r['classification']}  (O={o:.2f} I={i_:.2f} F={fi:.2f}) [model]")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        name = " ".join(sys.argv[1:])
        result = classify_cf(name)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        run_demo()
