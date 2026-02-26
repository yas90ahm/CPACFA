"""COA classification inference pipeline.

Demonstrates the full 3-tier classification:
  1. Tier 1: Rule-based exact/fuzzy match against known account names
  2. Tier 2+3: Embedding similarity via FAISS index
  3. Confidence gating: HIGH (auto) / MEDIUM (top-3) / LOW (manual)

Usage:
  python scripts/coa_predict.py                    # run built-in demo
  python scripts/coa_predict.py "Account Name"     # classify one account
"""

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

# ── Ensure dependencies ──────────────────────────────────────────────────────

def _ensure():
    for pkg, pip_name in [("sentence_transformers", "sentence-transformers"),
                          ("faiss", "faiss-cpu")]:
        try:
            __import__(pkg)
        except ImportError:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", pip_name],
                stdout=subprocess.DEVNULL,
            )

_ensure()

import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

# ── Load production artifacts ────────────────────────────────────────────────

PROD_DIR = Path("models/coa_production")

with open(PROD_DIR / "config.json", encoding="utf-8") as f:
    config = json.load(f)

with open(PROD_DIR / "metadata.json", encoding="utf-8") as f:
    metadata = json.load(f)

with open(PROD_DIR / "rules_lookup.json", encoding="utf-8") as f:
    rules_lookup = json.load(f)

index = faiss.read_index(str(PROD_DIR / "index.faiss"))

# Precompute display/statement info
label_display = metadata["label_display"]
label_statement = metadata["label_statement"]
index_labels = metadata["labels"]
index_names = metadata["names"]

HIGH_THRESH = config["high_confidence_threshold"]
MED_THRESH = config["medium_confidence_threshold"]

# Build reverse rules: account_name_lower -> line_item_id
_rules_reverse = {}
for lid, names in rules_lookup.items():
    for n in names:
        _rules_reverse[n.strip().lower()] = lid

# Load model (lazy, cached after first call)
_model = None

def _get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer(config["model_name"])
    return _model

# ── Rule-based matching ──────────────────────────────────────────────────────

def _rule_match(account_name):
    """Check Tier 1 rules: exact then containment fuzzy match."""
    q = account_name.strip().lower()

    # Exact match
    if q in _rules_reverse:
        return _rules_reverse[q]

    # Containment: does any known name contain or equal the query?
    for known_lower, lid in _rules_reverse.items():
        if q in known_lower or known_lower in q:
            return lid

    return None

# ── Main classification function ─────────────────────────────────────────────

def classify_account(account_name: str, k: int = 5) -> dict:
    """Classify an account name into a standardized line item.

    Args:
        account_name: The account name from a Chart of Accounts.
        k: Number of neighbors to retrieve (default 5).

    Returns:
        dict with line_item_id, line_item_label, confidence, confidence_band,
        tier, statement, and alternatives.
    """
    # Step 1: Check Tier 1 rules
    rule_lid = _rule_match(account_name)
    if rule_lid is not None:
        return {
            "line_item_id": rule_lid,
            "line_item_label": label_display.get(rule_lid, rule_lid),
            "statement": label_statement.get(rule_lid, "?"),
            "confidence": 1.0,
            "confidence_band": "high",
            "tier": "rule",
            "alternatives": [],
        }

    # Step 2: Embed and search FAISS
    model = _get_model()
    emb = model.encode([account_name], normalize_embeddings=True)
    emb = np.array(emb, dtype=np.float32)

    dists, idxs = index.search(emb, k)
    top_k_lids = [index_labels[i] for i in idxs[0]]
    top_k_names = [index_names[i] for i in idxs[0]]
    top_k_scores = [float(d) for d in dists[0]]

    pred_lid = top_k_lids[0]
    score = top_k_scores[0]

    # Step 3: Confidence gating
    if score >= HIGH_THRESH:
        band = "high"
    elif score >= MED_THRESH:
        band = "medium"
    else:
        band = "low"

    # Build alternatives (top-3 for medium, all k for low)
    alternatives = []
    if band in ("medium", "low"):
        for lid, name, s in zip(top_k_lids[:3], top_k_names[:3], top_k_scores[:3]):
            alternatives.append({
                "line_item_id": lid,
                "line_item_label": label_display.get(lid, lid),
                "matched_name": name,
                "score": round(s, 4),
            })

    return {
        "line_item_id": pred_lid,
        "line_item_label": label_display.get(pred_lid, pred_lid),
        "statement": label_statement.get(pred_lid, "?"),
        "confidence": round(score, 4),
        "confidence_band": band,
        "tier": "model",
        "alternatives": alternatives,
    }


# ── Demo ─────────────────────────────────────────────────────────────────────

DEMO_ACCOUNTS = [
    # 5 obvious (should hit rules or high-confidence model)
    ("Cash and Cash Equivalents", "obvious"),
    ("Revenue from Contract with Customer, Excluding Assessed Tax", "obvious"),
    ("Cost of Goods and Services Sold", "obvious"),
    ("Accounts Payable, Current", "obvious"),
    ("Retained Earnings (Accumulated Deficit)", "obvious"),

    # 5 moderate (real XBRL-style names)
    ("Deferred Revenue, Current", "moderate"),
    ("Capitalized Computer Software, Net", "moderate"),
    ("Operating Lease, Right-of-Use Asset", "moderate"),
    ("Finance Lease, Liability, Noncurrent", "moderate"),
    ("Employee Stock Ownership Plan, Shares in ESOP", "moderate"),

    # 5 hard (ambiguous catch-all territory)
    ("Disposal Group, Including Discontinued Operation, Inventory", "hard"),
    ("Convertible Notes Payable, Noncurrent", "hard"),
    ("Pension and Other Postretirement Defined Benefit Plans, Liabilities, Noncurrent", "hard"),
    ("Redeemable Noncontrolling Interest, Equity, Fair Value", "hard"),
    ("Derivative Asset, Subject to Master Netting Arrangement, Deduction", "hard"),

    # 5 made-up realistic (names a real company might use in their COA)
    ("SaaS Subscription Revenue", "realistic"),
    ("Cloud Hosting and Infrastructure Fees", "realistic"),
    ("Customer Success Team Salaries", "realistic"),
    ("Equity Method Investments", "realistic"),
    ("Series A Preferred Stock", "realistic"),
]


def run_demo():
    """Classify 20 demo account names and print results."""
    print("=" * 70)
    print("COA CLASSIFIER — PRODUCTION DEMO")
    print("=" * 70)
    print(f"  Model:      {config['model_name']}")
    print(f"  Index:      {index.ntotal} vectors")
    print(f"  Rules:      {len(rules_lookup)} tier-1 items")
    print(f"  Thresholds: HIGH>={HIGH_THRESH}  MED>={MED_THRESH}")

    current_category = None
    for account_name, category in DEMO_ACCOUNTS:
        if category != current_category:
            current_category = category
            headers = {
                "obvious": "OBVIOUS (should be high confidence or rule-matched)",
                "moderate": "MODERATE (real XBRL-style names)",
                "hard": "HARD (ambiguous catch-all territory)",
                "realistic": "REALISTIC (made-up company COA names)",
            }
            print(f"\n{'=' * 70}")
            print(f"  {headers[category]}")
            print("=" * 70)

        result = classify_account(account_name)

        band_icon = {"high": "+", "medium": "~", "low": "?"}[result["confidence_band"]]
        tier_tag = "RULE" if result["tier"] == "rule" else "EMB "

        print(f"\n  [{band_icon}] [{tier_tag}] {result['confidence']:.3f}  "
              f"\"{account_name}\"")
        print(f"       → {result['line_item_id']}  "
              f"({result['line_item_label']}, {result['statement']})")

        if result["alternatives"]:
            print(f"       Alternatives:")
            for alt in result["alternatives"]:
                print(f"         {alt['score']:.3f}  {alt['line_item_id']:<30s} "
                      f"(matched: \"{alt['matched_name'][:45]}\")")

    # Summary stats
    results = [classify_account(name) for name, _ in DEMO_ACCOUNTS]
    rule_count = sum(1 for r in results if r["tier"] == "rule")
    high_count = sum(1 for r in results if r["confidence_band"] == "high")
    med_count = sum(1 for r in results if r["confidence_band"] == "medium")
    low_count = sum(1 for r in results if r["confidence_band"] == "low")

    print(f"\n{'=' * 70}")
    print(f"DEMO SUMMARY ({len(DEMO_ACCOUNTS)} accounts)")
    print(f"{'=' * 70}")
    print(f"  Rule-matched:       {rule_count}")
    print(f"  Model — HIGH:       {high_count - rule_count}")
    print(f"  Model — MEDIUM:     {med_count}")
    print(f"  Model — LOW:        {low_count}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Single account classification
        name = " ".join(sys.argv[1:])
        result = classify_account(name)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        run_demo()
