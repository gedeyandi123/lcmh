import Link from "next/link";
import { loadEpds } from "../../lib/data";
import { summarizeCorpus, toComparatorRow } from "../../lib/comparability";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 rounded";
const H2 = "mb-2 text-base font-semibold text-slate-900";
const SECTION = "py-6 first:pt-0 border-b border-slate-200 last:border-b-0";
const P = "text-sm leading-relaxed text-slate-600";
const LIST = "list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600";
const CODE = "rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-700";

export default function Methodology() {
  const corpus = loadEpds();
  const s = summarizeCorpus(corpus.products.map(toComparatorRow), corpus.files.length, corpus.warnings.length);
  const notComparable = s.notComparable + s.missing;

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Methodology</h1>
      <p className="mb-6">
        <Link className={`text-sm text-blue-700 underline ${FOCUS_RING}`} href="/">
          ← Back to comparator
        </Link>
      </p>

      <section className={SECTION}>
        <h2 className={H2}>What you are comparing</h2>
        <p className={P}>
          An <strong className="text-slate-900">EPD</strong> reports a concrete product&apos;s environmental impacts
          per a <strong className="text-slate-900">declared unit</strong> (here, ~1 m³).{" "}
          <strong className="text-slate-900">GWP total</strong> is reported per{" "}
          <strong className="text-slate-900">lifecycle module</strong> (A1-A3 production, A4 transport, A5
          installation, B use stage, C end-of-life, D beyond-system).
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>How the data was produced</h2>
        <p className={P}>
          Values were extracted from EPD tables, then source-reviewed against the original PDF (see{" "}
          <code className={CODE}>EXTRACTION.md</code>). Only reviewed values with complete value-level provenance are
          used.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Honesty rules</h2>
        <ul className={LIST}>
          <li>
            <strong className="text-slate-900">Not declared is never zero.</strong> Missing, not declared, and not
            reported are distinct states, shown as words — never a blank cell or a 0.
          </li>
          <li>
            Only a <strong className="text-slate-900">declared, reviewed, provenance-backed A1-A3</strong> value with
            a reviewed-equivalent declared unit drives comparison and sorting.
          </li>
          <li>
            We do not compute anonymous totals, carbon scores, or a &quot;best product&quot;. A1-A3 is labelled as
            A1-A3 only, never a headline footprint.
          </li>
        </ul>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Review notes</h2>
        <p className={P}>
          The comparator banner shows a count of review notes ({s.warningCount} currently). A review note is raised
          per product for any of: an unknown compressive strength or manufacturing location, an incomplete
          lifecycle-module declaration, or a comparison status other than{" "}
          <span className={CODE}>comparison_eligible</span>. These flag gaps in what an EPD declared — they are not
          extraction errors, and none of them change a reported value.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Computed labels</h2>
        <ul className={LIST}>
          <li>
            <strong className="text-slate-900">A1-A3 production-stage GWP total</strong> — the one comparable,
            sortable figure.
          </li>
          <li>
            <strong className="text-slate-900">Declared A1-A3 + A4 + A5 subtotal</strong> — shown only when all three
            are declared; otherwise reported as unavailable, naming the missing module.
          </li>
          <li>
            <strong className="text-slate-900">Declared modules subtotal</strong> — per product, always listing its
            included modules; never used to rank products.
          </li>
        </ul>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Coverage</h2>
        <p className={P}>
          {s.fileCount}/20 EPD documents reviewed. {s.comparable} comparable, {s.review} need review, {s.grouped}{" "}
          grouped{notComparable > 0 ? `, ${notComparable} missing or not comparable` : ""}. Declared units vary
          verbatim (&quot;1 cubic metre&quot;, &quot;1 m3 of ready-mix concrete&quot;, …) but were reviewed as
          equivalent per 1 m³; no numeric normalization is performed.
        </p>
      </section>
    </main>
  );
}
