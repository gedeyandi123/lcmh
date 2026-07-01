"""Candidate extraction helper for the Concrete EPD Comparator (Part 1).

This script is a CANDIDATE helper only. It does not produce final data.
It reads the source EPD PDFs with pdfplumber, uses table extraction to find
GWP-total lifecycle rows, and writes rough candidate JSON to a gitignored
folder for manual source review.

Rules this script obeys (see AGENTS.md / FINAL_PROMPT.md):
  - It never writes to /data.
  - It never marks a value as reviewed or comparison-eligible.
  - Every candidate value carries page + row + column (module) + raw row text
    so a human can cross-check it against the source EPD.
  - ND is captured as not_declared, never as zero.

Final reviewed data is produced by a separate, human-reviewed encode step and
lives in /data/*.json. Run:  python scripts/extract_epds.py
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "assessment" / "Resources"
CANDIDATE_DIR = ROOT / "scratch" / "extraction-candidates"

# Lifecycle module tokens we recognise as table headers.
MODULE_TOKENS = [
    "A1-A3", "A1", "A2", "A3", "A4", "A5",
    "B1", "B2", "B3", "B4", "B5", "B6", "B7",
    "C1", "C2", "C3", "C4", "D",
]

# GWP-total row labels (canonical + variants). Order matters: check total first.
GWP_TOTAL_HINTS = [
    "gwp-total", "gwp - total", "gwp total", "gwptotal", "gwp-tot", "gwpt",
    "gwp – total", "total global warming", "climate change (total)",
]
# Rows that look like GWP but are NOT the total indicator.
GWP_EXCLUDE = ["fossil", "biogenic", "luluc", "land use", "-ghg", " ghg", "ghg9", "gwp-ghg"]


def clean(value: str | None) -> str:
    if not value:
        return ""
    replacements = {
        "−": "-", "‐": "-", "‑": "-", "‒": "-",
        "–": "-", "—": "-", "―": "-", " ": " ",
    }
    for src, dst in replacements.items():
        value = value.replace(src, dst)
    return " ".join(value.split())


def parse_number(raw: str) -> float | None:
    token = clean(raw).strip()
    if not token:
        return None
    if token.upper() in {"ND", "N/A", "NA", "-", "*"}:
        return None
    # en-GB EPD Hub files use a comma as the decimal separator (e.g. 2,13E+02).
    # No thousands separators appear in these tables, so a lone comma is decimal.
    if token.count(",") == 1 and "." not in token:
        token = token.replace(",", ".")
    token = token.replace(" ", "")
    try:
        return float(token)
    except ValueError:
        return None


def classify(raw: str) -> str:
    token = clean(raw).strip().upper()
    if token in {"ND", "NOT DECLARED"}:
        return "not_declared"
    if parse_number(raw) is not None:
        return "declared"
    if token in {"", "-", "N/A", "NA"}:
        return "missing"
    return "missing"


def canonical_source_label(row_label: str) -> str:
    low = row_label.lower()
    if "climate change" in low:
        return "Climate change (total)"
    if "total global warming" in low:
        return "Total global warming potential"
    if "gwpt" in low:
        return "GWPt"
    if "gwp-tot" in low:
        return "GWP-tot"
    return clean(row_label) or "GWP total"


def is_gwp_total(label: str) -> bool:
    low = label.lower()
    if any(bad in low for bad in GWP_EXCLUDE):
        return False
    return any(hint in low for hint in GWP_TOTAL_HINTS)


def header_modules(row: list[str]) -> list[tuple[int, str]]:
    """Return (cell_index, module) for header cells that are module tokens."""
    found = []
    for idx, cell in enumerate(row):
        tok = clean(cell).upper().replace(" ", "")
        tok = tok.replace("MODULE", "")
        for mod in MODULE_TOKENS:
            if tok == mod:
                found.append((idx, mod))
                break
    return found


def extract_lifecycle(pdf: "pdfplumber.PDF", file_name: str) -> tuple[list[dict[str, Any]], list[str]]:
    candidates: list[dict[str, Any]] = []
    notes: list[str] = []
    for page_index, page in enumerate(pdf.pages, start=1):
        try:
            tables = page.extract_tables()
        except Exception as exc:  # pragma: no cover
            notes.append(f"Page {page_index}: extract_tables failed: {exc}")
            continue
        for table in tables:
            rows = [[clean(c) for c in row] for row in table]
            # Find a header row that carries module tokens.
            header = None
            header_map: list[tuple[int, str]] = []
            for row in rows:
                mods = header_modules(row)
                if len(mods) >= 3:
                    header = row
                    header_map = mods
                    break
            if not header_map:
                continue
            for row in rows:
                label = row[0] if row else ""
                if not is_gwp_total(label):
                    continue
                raw_row_text = clean(" ".join(c for c in row if c))
                for idx, module in header_map:
                    raw_value = row[idx] if idx < len(row) else ""
                    candidates.append({
                        "module": module,
                        "sourceLabel": canonical_source_label(label),
                        "rawValue": clean(raw_value),
                        "value": parse_number(raw_value),
                        "status": classify(raw_value),
                        "provenance": {
                            "pdfFile": file_name,
                            "page": page_index,
                            "rowLabel": clean(label),
                            "columnLabel": module,
                            "rawText": raw_row_text[:400],
                            "extractionMethod": "pdfplumber_extract_tables_candidate",
                        },
                        "reviewStatus": "unreviewed",
                    })
    if not candidates:
        notes.append("No GWP-total lifecycle row was mapped from tables in the automated pass.")
    return candidates, notes


def find_summary_a1a3(pdf: "pdfplumber.PDF") -> dict[str, Any] | None:
    """EPD Hub files repeat A1-A3 in a summary box; capture it for cross-check."""
    pat = re.compile(r"GWP[- ]total,?\s*A1[- ]A3\s*\(kg\s*CO2?e\)\s*([0-9.,E+\-]+)", re.IGNORECASE)
    for page_index, page in enumerate(pdf.pages, start=1):
        text = clean(page.extract_text() or "")
        m = pat.search(text)
        if m:
            return {"page": page_index, "rawValue": m.group(1), "value": parse_number(m.group(1))}
    return None


def first_match(patterns: list[str], text: str) -> str | None:
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return clean(m.group(1))
    return None


def place_of_production_columnaware(pdf: "pdfplumber.PDF", gap: float = 40.0) -> str | None:
    """Read the 'Place of production' value column-aware.

    These EPDs use a two-column metadata block; a naive left-to-right
    extract_text() concatenates the neighbouring cell (e.g. aggregate size /
    slump) into the location. We instead take the words that follow the label
    on its own line and stop at the first large x-gap (the column break), then
    fold in a wrapped continuation line only when the value ends with a comma.
    """
    def row(words, top, x_from):
        line = sorted((w for w in words if abs(w["top"] - top) < 3 and w["x0"] >= x_from), key=lambda w: w["x0"])
        out, prev = [], None
        for w in line:
            if prev is not None and w["x0"] - prev > gap:
                break
            out.append(w["text"])
            prev = w["x1"]
        return out

    for page in pdf.pages[:6]:
        words = page.extract_words()
        for i in range(len(words) - 2):
            if [words[i]["text"], words[i + 1]["text"], words[i + 2]["text"]] == ["Place", "of", "production"]:
                top, endx, x0 = words[i]["top"], words[i + 2]["x1"], words[i]["x0"]
                value = " ".join(row(words, top, endx)).strip()
                if value.endswith(","):
                    next_tops = sorted({round(w["top"]) for w in words if 8 < (w["top"] - top) < 22})
                    if next_tops:
                        value = (value + " " + " ".join(row(words, next_tops[0], x0 - 2))).strip()
                return value or None
    return None


def extract_metadata(pdf: "pdfplumber.PDF", file_name: str) -> dict[str, Any]:
    text = clean("\n".join((p.extract_text() or "") for p in pdf.pages[:6]))
    return {
        "productNameCandidate": first_match([
            r"Product name\s+(.+?)(?:\s+Product reference|\s+Declared unit|\s+Manufacturer|$)",
        ], text),
        "manufacturerCandidate": first_match([
            r"Owner of the declaration\s+(.+?)(?:\s+Product|\s+EPD|$)",
            r"Manufacturer\s+(.+?)(?:\s+Product|\s+EPD|\s+Address|$)",
        ], text),
        "declaredUnitCandidate": first_match([
            r"Declared unit\s+(.+?)(?:\s+Declared unit mass|\s+Scope|\s+GWP|$)",
        ], text),
        "compressiveStrengthCandidate": first_match([
            r"Compressive strength class:?\s*([NSCG]?\d{2}(?:/\d{2})?)",
            r"\b(\d{2})\s*MPa\b",
        ], text),
        # Column-aware first (avoids merging the adjacent slump/aggregate cell);
        # fall back to regex on merged text for layouts without the labelled field.
        "manufacturingLocationCandidate": place_of_production_columnaware(pdf) or first_match([
            r"Place of production\s+(.+?)(?:\s+Programme|\s+Product|\s+Declared|$)",
            r"Production Site:?\s*(.+?)(?:\s+Programme|\s+Product|$)",
        ], text),
        "scopeCandidate": first_match([
            r"Scope of the EPD\s+(.+?)(?:\s+EPD author|\s+Reference|$)",
        ], text),
        "declarationNumberCandidate": first_match([
            r"(EPD[- ]?(?:HUB|IES)[- ]?[0-9][A-Z0-9\-/]*)",
        ], text),
    }


def infer_family(file_name: str) -> str:
    low = file_name.lower()
    if low.startswith("epd_hub"):
        return "EPD Hub / One Click LCA"
    if "hallett" in low:
        return "Hallett multi-product"
    if "holcim" in low or "ecopact" in low or "geostone" in low:
        return "Holcim EPD Australasia"
    return "Other IES / consultant EPD"


def extract_pdf(path: Path) -> dict[str, Any]:
    file_name = path.name
    with pdfplumber.open(str(path)) as pdf:
        page_count = len(pdf.pages)
        lifecycle, notes = extract_lifecycle(pdf, file_name)
        summary = find_summary_a1a3(pdf)
        meta = extract_metadata(pdf, file_name)
    if "hallett" in file_name.lower():
        notes.append("Multi-product/multi-plant declaration; do not force product-level comparison without manual split.")
    return {
        "schemaVersion": "candidate-0.2.0",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sourcePdf": {
            "fileName": file_name,
            "pageCount": page_count,
            "family": infer_family(file_name),
        },
        "metadataCandidates": meta,
        "summaryBoxA1A3": summary,
        "lifecycleCandidates": lifecycle,
        "reviewNotes": notes,
        "warning": "CANDIDATE DATA. Not reviewed. Not for /data. Values require manual source review.",
    }


def main() -> None:
    CANDIDATE_DIR.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    print(f"Found {len(pdfs)} PDFs")
    for path in pdfs:
        data = extract_pdf(path)
        out = CANDIDATE_DIR / (path.stem.lower().replace("_", "-") + ".json")
        out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        n = len(data["lifecycleCandidates"])
        print(f"  {path.name[:52]:52} -> {n:2d} GWP-total cells")


if __name__ == "__main__":
    main()
