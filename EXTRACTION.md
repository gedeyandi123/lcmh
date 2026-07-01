# EXTRACTION.md — Concrete EPD Comparator (Part 1)

## Strategy: provenance, not summarisation

I treated extraction as a **provenance problem**. The goal was not to summarise each
EPD's carbon number but to make every reported GWP-total value traceable to the exact
page, table, row, and column it came from, and to keep *not declared*, *missing*, and
*not applicable* strictly separate from a real numeric value. Every carbon figure that
can drive the app is reviewed, declared, and carries value-level provenance; anything
short of that is visible but excluded from comparison.

All 20 EPDs went through one uniform pipeline, so the corpus is consistent and reproducible
rather than a mix of hand and machine work.

## Tool decision: pdfplumber table extraction

The 20 PDFs are all searchable (confirmed by inspecting the text layer of each). GWP-total
values live in lifecycle-impact tables where **column alignment carries the meaning** — the
same row of numbers maps to A1, A2, A3, A4, A5, C1–C4, D by position. So I used
`pdfplumber.extract_tables()`, which returns real cells and per-page coordinates, letting me
map each value to its module by header index instead of guessing from a flat text stream.

I rejected the alternatives deliberately:

- **OCR / document-AI**: unjustified — the PDFs have a real text layer.
- **LLM extraction**: forbidden as a source of truth; hallucination risk on exactly the
  column-mapping step that matters most.
- **pypdf / raw text**: line-based parsing mis-maps columns, and 3 Holcim EPD Australasia
  files return nothing to naive text extraction (custom fonts) — pdfplumber decoded them via
  the embedded ToUnicode map, turning them into full-lifecycle candidates with no OCR.
- **Camelot**: lattice mode fails on these borderless tables; stream mode adds heavy deps
  for no gain over pdfplumber.

## Data model

One JSON file per EPD (`/data/*.json`), validated by a shared Zod schema
(`src/lib/schema.ts`). Each product carries sourced `declaredUnit`, `compressiveStrength`, and
`manufacturingLocation`, a `comparisonStatus`, and a `lifecycleModules` map keyed by module.
Each `gwpTotal` records its `status` (declared / not_declared / missing / not_applicable),
`rawValue`, the canonical `gwp_total`, the EPD's original `sourceLabel`, and full value-level
provenance (`pdfFile`, `page`, `tableLabel`, `rowLabel`, `columnLabel`, `rawText`,
`extractionMethod`).

## Accuracy controls

Automation produced **candidates only** (`scripts/extract_epds.py` →
`scratch/extraction-candidates/`, never `/data`). Each value was then reviewed by
**text/table cross-validation**: because page rendering was unavailable in the build
environment, "reviewed" means the pdfplumber cell was confirmed against the EPD's own
totals/summary box where present, header-to-column alignment was checked, and ND / scope
statements were honoured — not a visual page scan. Specific rules:

- **ND is never zero**; `not_declared` and `missing` are distinct statuses with `value: null`.
- **Negative Module D** values (recycling credit) are preserved with a note.
- **Declared zeros** (Holcim module C4 prints `0` for every indicator) are kept as declared
  zeros with a review note — a real declared value, not a blank.
- Grouped or multi-mix declarations are **not forced** into product-level comparison.
- **Two-column metadata**: EPD Hub cover blocks are two-column, so a naive left-to-right text
  read merged the neighbouring aggregate/slump cell into `Place of production` (e.g.
  "Hunter Valley, NSW, Australia 10mm … 100mm slump"). Location is extracted column-aware
  (word x-coordinates, stopping at the column gap) so the manufacturing location — the app's
  filter axis — is the plant, not plant + mix text.
- **Value cross-check**: every `gwpTotal` was re-verified module-by-module against its source
  detailed GWP-total table row — 0 mismatches across the 15 comparison-eligible products. The
  check also confirmed both period- and comma-decimal EPDs parse correctly (Tandy files write
  `2,13E+02` = 213) and that GWP-total is never confused with GWP-fossil.

## Results

Validation (`npm run validate:data`) passes: **20/20 files valid, 0 errors**.

- **15 comparison-eligible** products (10 EPD Hub / One Click LCA, 3 Holcim, ACM Rockbank,
  Greencrete).
- **4 review-required**: multi-mix / site-variation EPDs (P252080, Heidelberg, Hymix, and
  **Adbri** sn252f100) whose GWP totals sit in mix-specific tables without a single clean
  module header — visible, excluded, honestly noted.
- **1 grouped declaration**: Hallett (multi-product/multi-plant), kept out of product-level
  comparison.

## Limitations

Strength for some comparison-eligible Australasian products is read from the mix designation
(e.g. `S25/20/100`, `VE322`) and carries a review note saying so. The 4 review-required and 1
grouped EPDs keep `needs_review` strength and location (their values sit in non-standard,
mix-specific, or multi-plant layouts) — consistent with their exclusion from comparison. All of
these are surfaced honestly rather than guessed, and none drive a comparison value.

`manufacturer` is a plain identity field (not provenance-gated, not a carbon figure). It is
recorded for all 20 products from each EPD's cover / "owner of the declaration" metadata (Boral,
Tandy Concrete, Entire Concrete, Hanson Construction Materials, Heidelberg Materials, Hymix,
Aurora Construction Materials, Holcim, Hallett, Adbri, Piave) and shown in the product detail
panel so a non-expert builder can see who to source from.
