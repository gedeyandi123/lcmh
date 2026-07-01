"use client";
import type { LifecycleModule } from "../lib/schema";
import type { ComparableRow } from "../lib/comparability";
import { anyDeclaredModule, cellState, USE_STAGE_MODULES } from "../lib/comparability";
import { cellLabel, formatKgCo2eNumber, tableCellLabel } from "../lib/formatting";

const STATE_CLASS: Record<string, string> = {
  not_declared: "text-slate-500 italic",
  missing: "text-rose-600",
  not_reported: "text-slate-500 italic",
  needs_review: "text-amber-700",
  not_applicable: "text-slate-500 italic",
  declared: "text-slate-900",
};

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 rounded";

const STAGE_OF: Record<string, string> = {
  A4: "Construction", A5: "Construction",
  "B1-B7": "Use stage", B1: "Use stage", B2: "Use stage", B3: "Use stage", B4: "Use stage",
  B5: "Use stage", B6: "Use stage", B7: "Use stage",
  C1: "End of life", C2: "End of life", C3: "End of life", C4: "End of life",
  D: "Beyond",
};

/** Collapses adjacent columns sharing the same lifecycle stage into one spanning group header. */
function groupRuns(columns: (LifecycleModule | "B1-B7")[]): { label: string; span: number }[] {
  const runs: { label: string; span: number }[] = [];
  for (const col of columns) {
    const label = STAGE_OF[col] ?? "";
    const last = runs[runs.length - 1];
    if (last && last.label === label) last.span++;
    else runs.push({ label, span: 1 });
  }
  return runs;
}

function groupBoundaryClass(columns: (LifecycleModule | "B1-B7")[], index: number): string {
  return index === 0 || STAGE_OF[columns[index]] !== STAGE_OF[columns[index - 1]]
    ? "border-l border-slate-200"
    : "";
}

/** Combines states from multiple modules into one honest label + color for a grouped column. Never invents a value. */
function groupedCell(product: ComparableRow["product"], modules: LifecycleModule[]): { label: string; className: string } {
  const states = modules.map((m) => cellState(product, m));
  const kinds = states.map((s) => s.kind);
  const unique = new Set(kinds);
  const first = states[0];
  // Same kind alone isn't enough when kind is "declared": modules can share a kind but
  // carry different values, and collapsing them into one label would silently drop the rest.
  const allSameDeclaredValue = first.kind === "declared" && states.every((s) => s.kind === "declared" && s.value === first.value);
  if (unique.size === 1 && (first.kind !== "declared" || allSameDeclaredValue)) {
    return { label: cellLabel(first), className: STATE_CLASS[first.kind] ?? "" };
  }
  if (kinds.some((k) => k === "declared" || k === "needs_review")) {
    return { label: "Mixed - see detail", className: "text-slate-600" };
  }
  return { label: "Mixed missing states", className: "text-slate-500" };
}

export function ComparisonTable({
  rows, modules, onSelect, sortDir, onToggleSort, selectedKey,
}: {
  rows: ComparableRow[];
  modules: LifecycleModule[];
  onSelect: (key: string) => void;
  sortDir: "asc" | "desc";
  onToggleSort: () => void;
  selectedKey?: string | null;
}) {
  // modules arrives pre-ordered in lifecycle sequence (A4, A5, B1..B7, C1..C4, D) - preserve that
  // order when collapsing the B-run into one placeholder, so grouping never reshuffles columns.
  const namedModules = modules.filter((m) => m !== "A1-A3" && !["A1", "A2", "A3"].includes(m));
  const useStageModulesPresent = namedModules.filter((m) => USE_STAGE_MODULES.includes(m));
  const useStageDeclared = useStageModulesPresent.length > 0 && anyDeclaredModule(rows, useStageModulesPresent);
  const columns: (LifecycleModule | "B1-B7")[] = [];
  let bPlaceholderInserted = false;
  for (const m of namedModules) {
    if (USE_STAGE_MODULES.includes(m)) {
      if (useStageDeclared) columns.push(m);
      else if (!bPlaceholderInserted) {
        columns.push("B1-B7");
        bPlaceholderInserted = true;
      }
    } else {
      columns.push(m);
    }
  }
  const groupHeaders = groupRuns(columns);

  return (
    <div>
      <ul className="mb-2 list-disc space-y-1 border-l-2 border-slate-200 py-1 pl-6 text-xs text-slate-500">
        <li>All lifecycle GWP values in kg CO2e per declared unit.</li>
        <li>Declared units are reviewed as equivalent per ~1 m3; not numerically normalized.</li>
        {useStageModulesPresent.length > 0 && !useStageDeclared && (
          <li>
            Use stage B1-B7 is grouped because no product declares B-module GWP in this dataset. Expand B1-B7 in product
            detail to inspect each module state.
          </li>
        )}
      </ul>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Comparison table of A1-A3 production-stage GWP and lifecycle module values for comparable concrete products
        </caption>
        <thead className="bg-slate-50">
          <tr className="text-left text-xs text-slate-500">
            <th scope="col" rowSpan={2} className="min-w-[180px] p-2 align-bottom">Product</th>
            <th scope="col" rowSpan={2} className="p-2 align-bottom">Declared unit</th>
            <th scope="colgroup" className="border-b border-l border-slate-200 p-2 text-center font-medium">Production</th>
            {groupHeaders.map((g, i) => (
              <th key={i} scope="colgroup" colSpan={g.span} className="border-b border-l border-slate-200 p-2 text-center font-medium">
                {g.label}
              </th>
            ))}
          </tr>
          <tr className="border-b border-slate-300 text-left">
            <th scope="col" className="border-l border-slate-200 p-2 text-right tabular-nums" aria-sort={sortDir === "asc" ? "ascending" : "descending"}>
              <button type="button" className={`whitespace-nowrap underline ${FOCUS_RING}`} onClick={onToggleSort} title="Sort by A1-A3 only">
                A1-A3 {sortDir === "asc" ? "^" : "v"}
              </button>
            </th>
            {columns.map((m, index) => (
              <th key={m} scope="col" className={`p-2 text-right tabular-nums ${groupBoundaryClass(columns, index)}`} title={m === "B1-B7" ? "Use stage - grouped because no product in this dataset declares a B-module GWP value" : undefined}>
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = row.key === selectedKey;
            return (
            <tr
              key={row.key}
              className={`group border-b border-slate-100 hover:bg-slate-50 ${
                isSelected ? "border-l-2 border-l-blue-400 bg-blue-50/60" : ""
              }`}
            >
              <td className="min-w-[180px] p-2 font-medium">
                <button type="button" className={`block w-full text-left ${FOCUS_RING}`} onClick={() => onSelect(row.key)}>
                  <span className="line-clamp-2 max-w-[220px] align-top" title={row.product.name}>{row.product.name}</span>
                  <span
                    className={`mt-1 inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-normal ${
                      isSelected
                        ? "border-blue-200 bg-blue-100 text-blue-800"
                        : "border-slate-200 bg-white text-slate-600 group-hover:border-slate-300 group-hover:bg-slate-50"
                    }`}
                  >
                    {isSelected ? "Viewing" : "Details"}
                  </span>
                </button>
              </td>
              <td className="p-2 text-slate-600">
                <span className="line-clamp-2 max-w-[150px]" title={row.declaredUnit}>{row.declaredUnit}</span>
              </td>
              <td className="border-l border-slate-200 p-2 text-right font-semibold tabular-nums whitespace-nowrap bg-slate-50/80">{formatKgCo2eNumber(row.a1a3.value)}</td>
              {columns.map((m, index) => {
                const groupClass = groupBoundaryClass(columns, index);
                if (m === "B1-B7") {
                  const g = groupedCell(row.product, useStageModulesPresent);
                  return (
                    <td key={m} className={`p-2 text-right tabular-nums whitespace-nowrap ${groupClass} ${g.className}`}>
                      {g.label}
                    </td>
                  );
                }
                const c = cellState(row.product, m);
                return <td key={m} className={`p-2 text-right tabular-nums whitespace-nowrap ${groupClass} ${STATE_CLASS[c.kind] ?? ""}`}>{tableCellLabel(c)}</td>;
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
