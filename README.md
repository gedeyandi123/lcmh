# Concrete EPD Comparator

A small, honest, auditable tool for comparing the embodied carbon (GWP total) of concrete
products from Environmental Product Declarations (EPDs). It is built provenance-first: every
carbon figure is traceable to the exact page, table, row, and column of its source EPD, and
*not declared* / *missing* data is never shown as zero.

- **Part 1 — Extraction** (complete): 20 reviewed JSON files under `/data`, one per EPD, plus
  [EXTRACTION.md](EXTRACTION.md) documenting the method.
- **Part 2 — App** (complete): a Next.js + TypeScript comparator over `/data` — data-quality
  banner, strength/location filters, a three-section comparison table, a provenance panel per
  product, and a methodology page.

## Live deployment

_Vercel link: pending. The app has not yet been deployed — see [Deployment](#deployment) below
for the steps to deploy it once this branch is pushed to a GitHub remote._

## Setup

```bash
npm install
npm run dev             # start the Next.js dev server (http://localhost:3000)
```

## Quality gate

Run in this order; every command must pass before submission:

```bash
npm run validate:data   # validate all /data/*.json against the Zod schema — expect 20/20, 0 errors
npm run typecheck       # tsc --noEmit
npm test                # vitest — unit tests for comparability/formatting/data + one UI honesty test
npm run lint             # eslint
npm run build            # next build (prebuild re-runs validate:data)
```

Part 1 candidate extraction additionally uses Python + `pdfplumber` (local-only; not required
to run the app). See [EXTRACTION.md](EXTRACTION.md).

## Data model

One JSON file per EPD (`src/lib/schema.ts` is the shared Zod contract). Each concrete product
carries sourced `declaredUnit`, `compressiveStrength`, `manufacturingLocation`, a
`comparisonStatus`, and a `lifecycleModules` map keyed by lifecycle module (A1…D). Each
`gwpTotal` records:

- `status`: `declared` / `not_declared` / `missing` / `not_applicable` (non-declared ⇒ `value: null`);
- canonical `gwp_total` plus the EPD's original `sourceLabel`;
- **value-level provenance**: `pdfFile`, `page`, `tableLabel`, `rowLabel`, `columnLabel`,
  `rawText`, `extractionMethod`;
- `reviewStatus`: only `reviewed` values may drive a comparison.

## Current corpus state

`npm run validate:data`: **20/20 files valid, 0 errors.**

| Status | Count | Meaning |
|---|---|---|
| `comparison_eligible` | 15 | reviewed, declared, provenance-backed, comparable |
| `review_required` | 4 | multi-mix / site-variation EPDs (incl. Adbri) — visible, excluded |
| `grouped_declaration` | 1 | Hallett multi-product/plant — not forced into comparison |

## Key decisions

- **Extraction is a provenance problem, not summarisation** — see [EXTRACTION.md](EXTRACTION.md).
- **`pdfplumber` table extraction** for candidates (column-true), then manual text/table
  cross-validation. No OCR (PDFs are searchable), no LLM as a source of truth.
- **Static reviewed JSON** as the app's only data source — no runtime PDF parsing, DB, or AI.
- **Honest states over coverage**: ND ≠ zero; missing ≠ not-declared; declared zeros and
  negative Module D are kept with notes; hard multi-mix EPDs stay `review_required`.

## Limitations

- Page rendering was unavailable in the build environment, so review is **text/table
  cross-validation**, not visual page inspection (stated in [EXTRACTION.md](EXTRACTION.md)).
- Some Australasian strengths are read from the mix designation (e.g. `S25/20/100`) and carry a
  verify-against-spec note.
- The 4 `review_required` EPDs have GWP data in non-standard mix-specific tables; they are
  surfaced for review rather than force-mapped.

## App architecture (Part 2)

The app is a static-data Next.js (App Router) + TypeScript app. There is no database, no
runtime PDF parsing, no auth, and no AI in the request path — `/data/*.json` is loaded,
validated, and rendered.

```
src/lib/schema.ts          Zod schema shared by app + scripts/validate-data.ts
src/lib/data.ts            loads + validates /data/*.json, flattens to LoadedProduct[]
src/lib/comparability.ts   comparison eligibility, cell state, subtotal computation
src/lib/formatting.ts      display labels/units/status text (no logic duplication in UI)
src/app/page.tsx           server component: loads data, renders the comparator
src/app/methodology/       methodology page explaining the comparison rules
src/components/
  DataQualityBanner.tsx    corpus coverage summary (eligible / review-required / grouped / etc.)
  ComparatorView.tsx        client component: filter state (strength, location) + sort
  ComparisonTable.tsx        three sections: comparable, needs review/grouped, missing/not comparable
  ProvenancePanel.tsx        per-product detail: manufacturer + value-level source (page/table/row/column/raw text)
```

Data loading and validation happen in Server Components at request/build time; only filter and
selected-product UI state live in Client Components, per the project's Next.js rules.

## Honesty decisions in the app

These are non-negotiable rules enforced in `src/lib/comparability.ts` and reflected in the UI,
carried over from the Part 1 provenance rule:

- **Provenance-gated comparison** — a GWP value can only drive the comparison table if it is
  `gwp_total`, `declared`, numeric, `reviewStatus: reviewed`, module-known, unit-known, and
  value-level provenance-backed. `unreviewed`/`needs_review` values are visible as evidence in
  the provenance panel but never feed the comparison.
- **ND is never zero** — `not_declared` and `missing` are distinct explicit states, both
  rendered as their own label (never a blank cell, never `0`).
- **A1-A3-only sort is labelled as such** — sorting the table by the A1-A3 column is presented
  as "A1-A3 production-stage GWP total", not an implied overall ranking; the app never computes
  an anonymous total, a carbon score, or a "best product."
- **Three honest comparison sections** — Comparable products / Needs review or grouped
  declarations / Missing or not comparable — so review-required and grouped (e.g. Hallett
  multi-plant) EPDs stay visible without being forced into a false comparison.
- **Inspectable provenance** — every rendered carbon figure links to a provenance panel showing
  the source PDF, page, table, row/column label, and raw extracted text.

## Limitations (Part 2 app)

- No live carbon "winner" or ranking is computed anywhere in the app — this is a deliberate
  scope limit per the assessment brief, not a missing feature.
- Only two filters are implemented (compressive strength, manufacturing location), matching the
  assessment's required scope; there is no free-text search or multi-select faceting.
- The 4 `review_required` and 1 `grouped_declaration` EPDs are shown for corpus-coverage
  transparency but intentionally excluded from the main comparable-products section.
- No persistence, auth, or server-side state — the app is fully static-data driven and stateless
  across requests.

## Deployment

The app has not been deployed yet (no live URL below is fabricated — deployment requires
pushing this branch to the user's own GitHub remote and importing it into their Vercel account,
neither of which the implementing agent has access to). Steps to deploy once ready:

1. Push `feat/part2-app` (or its merge into `main`) to a GitHub remote.
2. In Vercel, "Add New Project" → import the GitHub repository.
3. Framework preset is auto-detected as **Next.js**; no changes needed.
4. Build command: `npm run build` (default; runs `prebuild` → `validate:data` first).
5. No environment variables are required — the app has no external services or secrets.
6. Deploy, then replace the "pending" note under **Live deployment** above with the resulting URL.

## Repository

```
data/*.json            reviewed EPD data (one file per EPD)
src/lib/schema.ts      shared Zod schema / validator
src/lib/data.ts        data loading + validation (app-side)
src/lib/comparability.ts  comparison eligibility + subtotal logic
src/lib/formatting.ts  display labels/units/status text
src/app/               Next.js App Router pages (comparator, methodology)
src/components/        DataQualityBanner, ComparatorView, ComparisonTable, ProvenancePanel
scripts/
  extract_epds.py      pdfplumber candidate helper (candidates only, never writes /data)
  validate-data.ts     validation gate (npm run validate:data)
tests/                 schema/data-rule tests + comparability/formatting unit tests + 1 UI honesty test
EXTRACTION.md          extraction reasoning memo (Part 1)
```

## Submission checklist

- [x] 20 JSON files under `/data`, one per EPD, `lifecycleModules` map
- [x] Every carbon figure has value-level provenance; ND never zero; missing ≠ not-declared
- [x] Validation passes (`npm run validate:data`), typecheck + tests green
- [x] [EXTRACTION.md](EXTRACTION.md) covers strategy, tooling, accuracy, process
- [x] Part 2 app: comparison table, filters, provenance panel, methodology page
- [x] Full gate green: `validate:data` (20/20), `typecheck`, `test` (36/36), `lint`, `build`
- [ ] Pushed to GitHub remote and deployed to Vercel (user action — see [Deployment](#deployment))
