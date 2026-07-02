# EXTRACTION.md - Concrete EPD Comparator (Part 1)

## Overall strategy

I treated the extraction as a trust problem. A carbon number is only useful if a reviewer can trace it back to the EPD and understand whether it is safe to compare.

The final output is one reviewed JSON file per EPD in `/data`. Each comparison-driving GWP-total value is declared, reviewed, mapped to a lifecycle module, and carries value-level provenance: PDF, page, table/row/column context where available, raw text, and extraction method. Not declared, missing, not applicable, grouped, or review-required records remain visible, but they do not drive comparison. ND is never zero.

## Model and architecture

The app's trust boundary is the reviewed JSON, validated by a TypeScript/Zod schema in `src/lib/schema.ts` and `scripts/validate-data.ts`. Each product records declared unit, strength, location, comparison status, and a `lifecycleModules` map. The app reads only these files; it does not parse PDFs at runtime.

For candidate extraction I used `pdfplumber.extract_tables()`. I chose it because the GWP-total values sit in tables where column position carries the module meaning. Flat text can keep the right number but attach it to the wrong module. OCR was unnecessary because the PDFs had text layers. LLM extraction was not used as a source of truth because this task depends on exact provenance, not interpretation.

## Accuracy

The extraction script produced candidates only. Final JSON was accepted only after source review: table headers, module alignment, source labels, and raw text were checked before values were marked reviewed. I also rechecked every comparable GWP-total module against its source detailed table row; this found 0 mismatches across the 15 comparison-eligible products.

The validator enforces the invariants: declared carbon values must be numeric, non-declared states must not contain numeric values, lifecycle modules must be valid, comparison-eligible values must be reviewed, and every carbon value must include raw provenance.

I handled the main failure cases conservatively:

- ND, missing, and not applicable are separate states, never zero.
- Declared zero values remain zero only when the EPD reports them.
- Negative Module D values are preserved as reported credits.
- Hallett is kept as a grouped declaration, not forced into a product comparison.
- Four multi-mix or site-variation EPDs are marked `review_required` rather than guessed into the comparable set.

Current validation: 20/20 files valid, 0 errors, 15 comparison-eligible products, 4 review-required products, and 1 grouped declaration.

## Research and process

I started by extracting broad table coverage, then used the schema, validator, and app views to challenge whether each candidate was actually safe to compare. That review changed the data. I corrected noisy location captures from two-column EPD Hub cover pages, fixed bad product-name captures, backfilled manufacturers from source metadata, and cleaned non-carbon rawText so the provenance panel showed useful evidence rather than parser noise.

The main decision was to separate corpus coverage from comparison eligibility. All 20 EPDs are represented, but only the reviewed, provenance-backed subset is compared. Hallett and the multi-mix/site-variation files stay visible with reasons because they contain useful evidence, just not enough product-level clarity for a fair comparison.
