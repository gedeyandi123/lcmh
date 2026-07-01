import Link from "next/link";
import type { CorpusSummary } from "../lib/comparability";
import { ROW_STATUS_BADGE_CLASS } from "../lib/formatting";

export function DataQualityBanner({ summary }: { summary: CorpusSummary }) {
  const notComparable = summary.notComparable + summary.missing;
  const coverageStats: { label: string; value: string | number }[] = [
    { label: "EPDs validated", value: `${summary.fileCount}/20` },
    { label: "Concrete products", value: summary.productCount },
  ];
  const outcomeStats: { label: string; value: string | number; badgeClass: string }[] = [
    { label: "Comparable", value: summary.comparable, badgeClass: ROW_STATUS_BADGE_CLASS.comparable },
    { label: "Needs review", value: summary.review, badgeClass: ROW_STATUS_BADGE_CLASS.needs_review },
    { label: "Grouped declaration", value: summary.grouped, badgeClass: ROW_STATUS_BADGE_CLASS.grouped },
  ];
  if (notComparable > 0) {
    outcomeStats.push({
      label: "Missing or not comparable",
      value: notComparable,
      badgeClass: ROW_STATUS_BADGE_CLASS.not_comparable,
    });
  }

  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
      <div className="flex flex-wrap gap-6">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Corpus coverage</div>
          <div className="flex flex-wrap gap-4">
            {coverageStats.map((s) => (
              <div key={s.label} className="min-w-[110px]">
                <div className="text-xl font-semibold">{s.value}</div>
                <div className="text-xs text-slate-600">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="sm:border-l sm:border-slate-200 sm:pl-6">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Comparison outcome</div>
          <div className="flex flex-wrap gap-4">
            {outcomeStats.map((s) => (
              <div key={s.label} className={`min-w-[110px] rounded px-2 py-1 ${s.badgeClass}`}>
                <div className="text-xl font-semibold">{s.value}</div>
                <div className="text-xs">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        {summary.warningCount > 0 && (
          <span className="text-amber-700">{summary.warningCount} review notes (not errors) — </span>
        )}
        Only reviewed A1-A3 values drive sorting; absent data is never shown as zero.{" "}
        <Link
          className="underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
          href="/methodology"
        >
          Read the methodology
        </Link>
      </p>
    </section>
  );
}
