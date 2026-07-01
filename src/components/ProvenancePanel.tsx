"use client";
import type { ConcreteProduct, LifecycleModule, Provenance, ReviewStatus } from "../lib/schema";
import type { ComparatorRow } from "../lib/comparability";
import { cellState, computeSubtotals, USE_STAGE_MODULES } from "../lib/comparability";
import {
  subtotalText, A1A3A4A5_LABEL, DECLARED_MODULES_LABEL, formatKgCo2e, tableCellLabel,
  ROW_STATUS_BADGE_CLASS, ROW_STATUS_LABEL,
} from "../lib/formatting";

const STAGE_GROUPS: { label: string; modules: LifecycleModule[] }[] = [
  { label: "Production", modules: ["A1", "A2", "A3", "A1-A3"] },
  { label: "Construction", modules: ["A4", "A5"] },
  { label: "Use stage", modules: ["B1", "B2", "B3", "B4", "B5", "B6", "B7"] },
  { label: "End of life", modules: ["C1", "C2", "C3", "C4"] },
  { label: "Beyond system boundary", modules: ["D"] },
];

const MODULE_DISPLAY_ORDER: LifecycleModule[] = [
  "A1", "A2", "A3", "A1-A3", "A4", "A5",
  "B1", "B2", "B3", "B4", "B5", "B6", "B7",
  "C1", "C2", "C3", "C4", "D",
];

const MODULE_DISPLAY_GROUPS: { label: string; modules: LifecycleModule[] }[] = [
  { label: "A1-A3", modules: ["A1", "A2", "A3", "A1-A3"] },
  { label: "B1-B7", modules: ["B1", "B2", "B3", "B4", "B5", "B6", "B7"] },
  { label: "C1-C4", modules: ["C1", "C2", "C3", "C4"] },
];

/** Groups modules that cite the identical source passage so evidence is not repeated per module. */
function groupBySource(modules: LifecycleModule[], product: ConcreteProduct) {
  const groups: { key: string; provenance: Provenance; modules: LifecycleModule[] }[] = [];
  for (const m of modules) {
    const pr = product.lifecycleModules[m]?.gwpTotal?.provenance;
    if (!pr) continue;
    const key = [pr.pdfFile, pr.page, pr.tableLabel, pr.rawText].join("|");
    const existing = groups.find((g) => g.key === key);
    if (existing) existing.modules.push(m);
    else groups.push({ key, provenance: pr, modules: [m] });
  }
  return groups;
}

interface SourcedField {
  value: string | number | null;
  provenance: Provenance | null;
  reviewStatus: ReviewStatus;
}

function sourceSummary(provenance: Provenance): string {
  const page = provenance.page === null ? "page unknown" : `p.${provenance.page}`;
  return [page, provenance.tableLabel, provenance.rowLabel].filter(Boolean).join(" - ");
}

function compactModuleList(modules: LifecycleModule[]): string {
  const remaining = new Set(modules);
  const labels: string[] = [];

  for (const group of MODULE_DISPLAY_GROUPS) {
    if (group.modules.every((m) => remaining.has(m))) {
      labels.push(group.label);
      group.modules.forEach((m) => remaining.delete(m));
    }
  }

  MODULE_DISPLAY_ORDER.forEach((m) => {
    if (remaining.has(m)) labels.push(m);
  });

  return labels.join(", ");
}

function EvidenceDisclosure({ provenance, reviewStatus }: { provenance: Provenance | null; reviewStatus: ReviewStatus }) {
  if (!provenance) return null;
  if (reviewStatus !== "reviewed") {
    return <div className="text-xs italic text-slate-500">Unreviewed provenance is present but not confirmed.</div>;
  }
  return (
    <details className="mt-0.5 text-xs text-slate-500">
      <summary className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1">
        {sourceSummary(provenance)} - Evidence
      </summary>
      <div className="mt-1 rounded bg-slate-50 p-2 font-mono text-[11px] leading-snug text-slate-700">
        {provenance.rawText}
      </div>
    </details>
  );
}

function FactRow({ label, field }: { label: string; field: SourcedField }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 border-b border-slate-100 py-2 last:border-b-0">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="min-w-0">
        <div className="font-medium text-slate-900">
          {field.value ?? <span className="italic text-slate-500">Not declared</span>}
        </div>
        <EvidenceDisclosure provenance={field.provenance} reviewStatus={field.reviewStatus} />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h5 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{children}</h5>;
}

function LifecycleBreakdown({ product, modules }: { product: ConcreteProduct; modules: LifecycleModule[] }) {
  if (modules.length === 0) {
    return (
      <p className="text-xs italic text-slate-500">
        No source-reviewed lifecycle module values were recorded for this item.
      </p>
    );
  }

  return (
    <>
      <p className="mb-2 text-xs text-slate-500">All values in kg CO2e per declared unit.</p>
      <div className="space-y-3">
        {STAGE_GROUPS.map(({ label, modules: stageModules }) => {
          const present = stageModules.filter((m) => modules.includes(m));
          if (present.length === 0 && label !== "Use stage") return null;

          const displayModules = label === "Use stage" ? USE_STAGE_MODULES : present;
          const states = displayModules.map((m) => ({ module: m, state: cellState(product, m) }));
          const first = states[0];
          const absenceKinds = new Set(["missing", "not_applicable", "not_declared", "not_reported"]);
          const canGroupUseStage =
            label === "Use stage" &&
            displayModules.length === USE_STAGE_MODULES.length &&
            absenceKinds.has(first.state.kind) &&
            states.every(({ state }) => state.kind === first.state.kind && tableCellLabel(state) === tableCellLabel(first.state));
          const rows = canGroupUseStage
            ? [{ module: "B1-B7", state: first.state, detailModules: displayModules }]
            : states.map(({ module, state }) => ({ module, state, detailModules: null }));
          const stageLabel = canGroupUseStage ? "Use stage (B1-B7)" : label;

          return (
            <div key={label}>
              <div className="mb-1 text-xs font-medium text-slate-600">{stageLabel}</div>
              <table className="w-full text-sm">
                <tbody>
                  {rows.map(({ module, state, detailModules }) => (
                    <tr key={module} className="border-b border-slate-100 last:border-b-0">
                      <td className="py-0.5 text-slate-600">
                        <span>{module}</span>
                        {detailModules && (
                          <details className="mt-0.5 text-xs text-slate-500">
                            <summary className="cursor-pointer">Show modules</summary>
                            <div>{detailModules.join(", ")}</div>
                          </details>
                        )}
                      </td>
                      <td className={`py-0.5 text-right ${state.kind === "declared" ? "font-medium" : "italic text-slate-500"}`}>
                        {tableCellLabel(state)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SourceEvidence({ sourceGroups }: { sourceGroups: { key: string; provenance: Provenance; modules: LifecycleModule[] }[] }) {
  if (sourceGroups.length === 0) {
    return <p className="text-xs italic text-slate-500">No value-level source evidence is available for recorded lifecycle modules.</p>;
  }

  return (
    <ul className="space-y-2">
      {sourceGroups.map((g) => (
        <li key={g.key} className="rounded border border-slate-200 p-2">
          <div className="font-medium" title={g.modules.join(", ")}>{compactModuleList(g.modules)}</div>
          <div className="truncate text-xs text-slate-500" title={g.provenance.pdfFile}>
            {g.provenance.pdfFile} - {sourceSummary(g.provenance)} - {g.provenance.extractionMethod}
          </div>
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-slate-500">Show raw source text</summary>
            <div className="mt-1 rounded bg-slate-50 p-2 font-mono text-[11px] leading-snug text-slate-700">
              {g.provenance.rawText}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

export function ProvenancePanel({ row, onClose }: { row: ComparatorRow | null; onClose: () => void }) {
  if (!row) {
    return (
      <aside className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
        Select a product to inspect lifecycle details and source evidence.
      </aside>
    );
  }

  const product = row.product;
  const modules = Object.keys(product.lifecycleModules) as LifecycleModule[];
  const sourceGroups = groupBySource(modules, product);

  return (
    <aside className="rounded-lg border border-slate-200 p-4 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {row.kind === "comparable" ? "Selected product" : "Selected record"}
        </h3>
        <button
          type="button"
          className="rounded text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
          onClick={onClose}
          aria-label="Close"
        >
          x
        </button>
      </div>

      <div className="mb-3">
        <h4 className="font-semibold leading-snug">{product.name || row.key}</h4>
        {product.manufacturer && <p className="text-xs text-slate-500">{product.manufacturer}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-xs ${ROW_STATUS_BADGE_CLASS[row.kind]}`}>
            {ROW_STATUS_LABEL[row.kind]}
          </span>
          {row.kind === "comparable" && <span className="text-xs text-slate-500">A1-A3: {formatKgCo2e(row.a1a3.value)}</span>}
        </div>
      </div>

      {row.kind !== "comparable" && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2 text-slate-700">
          <div className="text-xs font-medium uppercase tracking-wide text-amber-800">Why not compared</div>
          <p className="mt-1 text-sm">{product.comparisonStatusReason}</p>
        </div>
      )}

      {row.kind === "comparable" && (
        <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-2">
          <div className="text-xs text-slate-500">A1-A3 production-stage GWP</div>
          <div className="text-lg font-semibold">{formatKgCo2e(row.a1a3.value)}</div>
          <div className="text-xs text-slate-500">Used for sorting and comparison - not a full lifecycle total.</div>
        </div>
      )}

      <section className="mb-4">
        <SectionTitle>Quick facts</SectionTitle>
        <div className="rounded border border-slate-200 px-2">
          <FactRow label="Declared unit" field={product.declaredUnit} />
          <FactRow label="Strength" field={product.compressiveStrength} />
          <FactRow label="Location" field={product.manufacturingLocation} />
        </div>
      </section>

      <section className="mb-4">
        <SectionTitle>Lifecycle breakdown</SectionTitle>
        <LifecycleBreakdown product={product} modules={modules} />
      </section>

      <section className="mb-4">
        <SectionTitle>Source evidence</SectionTitle>
        <SourceEvidence sourceGroups={sourceGroups} />
      </section>

      {row.kind === "comparable" && <Subtotals product={product} />}
    </aside>
  );
}

function Subtotals({ product }: { product: ConcreteProduct }) {
  const s = computeSubtotals(product);
  return (
    <section className="mt-4 rounded border border-slate-200 p-2 text-xs">
      <SectionTitle>Named module subtotals</SectionTitle>
      <div className="space-y-1 text-slate-700">
        <div>
          {A1A3A4A5_LABEL}: <strong>{subtotalText(s.a1a3a4a5)}</strong>
        </div>
        <div>
          {DECLARED_MODULES_LABEL} ({compactModuleList(s.declaredModules.modules.map((m) => m.module))}):{" "}
          <strong>{formatKgCo2e(s.declaredModules.value)}</strong>
        </div>
      </div>
    </section>
  );
}
