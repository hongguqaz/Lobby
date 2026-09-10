"""Public-repository guard.

Fails when raw data could be leaking into this public repository:

1. any spreadsheet-like file is present anywhere in the tree;
2. market-board-facade/data/dashboard.json is missing, malformed, or carries keys outside the
   aggregate schema (row-level fields, file names, identifiers, ...);
3. market-board-facade/data/dashboard.js does not match market-board-facade/data/dashboard.json;
4. any published label looks like an e-mail, phone number, URL, IBAN or free text.

Run locally with:  python scripts/check_public_data.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FORBIDDEN_SUFFIXES = {".xlsx", ".xlsm", ".xls", ".xlsb", ".csv", ".tsv", ".ods", ".numbers"}
FORBIDDEN_UPLOADS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"}   # photographs are not published either
SKIP_DIRS = {".git", "node_modules", "site"}

ALLOWED = {
    "top": {"schema_version", "generated_on", "source_revision", "source", "period",
            "fields", "dimensions", "facts", "headline"},
    "source": {"sample", "files", "rows", "skipped_rows", "grain", "anonymized", "currency"},
    "period": {"start", "end", "keys"},
    "fields": {"category", "region", "status", "on_time", "rating", "quantity"},
    "dimensions": {"vendors", "categories", "regions", "statuses"},
    "fact": {"p", "v", "c", "r", "s", "amount", "count", "on_time", "on_time_n",
             "rating_sum", "rating_n", "qty"},
    "headline": {"total_spend", "vendors", "transactions", "avg_transaction",
                 "top_vendor_share", "on_time_rate", "avg_rating"},
}
PATTERNS = [
    ("e-mail address", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("URL", re.compile(r"https?://|www\.", re.I)),
    ("IBAN / account number", re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b")),
    ("long digit sequence", re.compile(r"\d{7,}")),
]
PHONE = re.compile(r"\+?\d[\d\s().-]{7,}\d")


def check_keys(obj, allowed: set[str], where: str, problems: list[str]) -> None:
    if not isinstance(obj, dict):
        problems.append(f"{where}: expected an object")
        return
    for key in obj:
        if key not in allowed:
            problems.append(f"{where}: key {key!r} is not part of the aggregate schema")


def main() -> int:
    problems: list[str] = []

    for path in ROOT.rglob("*"):
        if any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts):
            continue
        if path.is_file() and path.suffix.lower() in FORBIDDEN_SUFFIXES:
            problems.append(f"raw data file committed to the public repository: {path.relative_to(ROOT)}")
        if path.is_file() and path.suffix.lower() in FORBIDDEN_UPLOADS:
            problems.append(f"photograph committed to the public repository: {path.relative_to(ROOT)} (artwork is drawn as SVG)")

    json_path = ROOT / "market-board-facade" / "data" / "dashboard.json"
    js_path = ROOT / "market-board-facade" / "data" / "dashboard.js"
    model = None
    if not json_path.exists():
        problems.append("market-board-facade/data/dashboard.json is missing")
    else:
        try:
            model = json.loads(json_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            problems.append(f"market-board-facade/data/dashboard.json is not valid JSON: {exc}")

    if isinstance(model, dict):
        check_keys(model, ALLOWED["top"], "dashboard.json", problems)
        for section in ("source", "period", "fields", "dimensions", "headline"):
            check_keys(model.get(section, {}), ALLOWED[section], section, problems)
        facts = model.get("facts")
        if not isinstance(facts, list):
            problems.append("facts: expected a list")
        else:
            for i, fact in enumerate(facts):
                check_keys(fact, ALLOWED["fact"], f"facts[{i}]", problems)
                if isinstance(fact, dict):
                    for k, v in fact.items():
                        if k == "p":
                            if not isinstance(v, str):
                                problems.append(f"facts[{i}].p must be a string")
                        elif not isinstance(v, (int, float)) or isinstance(v, bool):
                            problems.append(f"facts[{i}].{k} must be a number")
                if len(problems) > 40:
                    break
        dims = model.get("dimensions", {})
        if isinstance(dims, dict):
            for dim, names in dims.items():
                for name in names if isinstance(names, list) else []:
                    if not isinstance(name, str):
                        problems.append(f"dimensions.{dim}: non-string label {name!r}")
                        continue
                    if len(name) > 80:
                        problems.append(f"dimensions.{dim}: label longer than 80 characters (free text?)")
                    for what, rx in PATTERNS:
                        if rx.search(name):
                            problems.append(f"dimensions.{dim}: label {name!r} looks like a(n) {what}")
                    m = PHONE.search(name)
                    if m and sum(ch.isdigit() for ch in m.group(0)) >= 9:
                        problems.append(f"dimensions.{dim}: label {name!r} looks like a phone number")
    elif model is not None:
        problems.append("dashboard.json: top level must be an object")

    if not js_path.exists():
        problems.append("market-board-facade/data/dashboard.js is missing")
    elif model is not None:
        text = js_path.read_text(encoding="utf-8")
        m = re.search(r"window\.__VENDOR_DASHBOARD__\s*=\s*(.*);\s*$", text, re.S)
        if not m:
            problems.append("market-board-facade/data/dashboard.js does not assign window.__VENDOR_DASHBOARD__")
        else:
            try:
                if json.loads(m.group(1)) != model:
                    problems.append("market-board-facade/data/dashboard.js does not match market-board-facade/data/dashboard.json")
            except json.JSONDecodeError as exc:
                problems.append(f"market-board-facade/data/dashboard.js payload is not valid JSON: {exc}")

    if problems:
        print("Public data check FAILED:")
        for p in problems:
            print(f"  - {p}")
        return 1
    n = len(model.get("facts", [])) if isinstance(model, dict) else 0
    print(f"Public data check passed: no raw data files, {n} aggregate facts, JS matches JSON.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
