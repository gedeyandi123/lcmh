import type {
  ComparisonStatus,
  ConcreteProduct,
  LifecycleImpact,
  LifecycleModule,
  Provenance,
} from "./schema";
import type { LoadedProduct } from "./data";

export interface ComparableImpact {
  value: number;
  unit: string | null;
  module: LifecycleModule;
  sourceLabel: string;
  provenance: Provenance;
}

/** A GWP value may drive comparison only with COMPLETE value-level provenance. */
export function asComparableGwp(impact: LifecycleImpact | undefined): ComparableImpact | null {
  if (!impact) return null;
  if (impact.status !== "declared") return null;
  if (typeof impact.value !== "number") return null;
  if (impact.reviewStatus !== "reviewed") return null;
  const pr = impact.provenance;
  if (!pr) return null;
  const required = [pr.pdfFile, pr.rawText, pr.tableLabel, pr.rowLabel, pr.columnLabel, pr.sourceLabel];
  if (pr.page === null || required.some((v) => v === null || v === undefined || v === "")) return null;
  return {
    value: impact.value,
    unit: impact.unit,
    module: impact.module,
    sourceLabel: impact.sourceLabel,
    provenance: pr,
  };
}

/** Reviewed declared-unit equivalence (Part 1 review). NOT numeric normalization. */
export const REVIEWED_EQUIVALENT_UNITS: Record<string, string> = {
  "1 cubic metre": "m3",
  "1 m3 of ready-mix concrete": "m3",
  "1 cubic metre (m3) of Premixed concrete": "m3",
  "1m3 of Premix Concrete": "m3",
};

export function comparableDeclaredUnitKey(unit: string | null): string | null {
  if (!unit) return null;
  return REVIEWED_EQUIVALENT_UNITS[unit] ?? null;
}

interface Subtotals {
  a1a3a4a5: Subtotal;
  declaredModules: DeclaredModulesSubtotal;
}
export type Subtotal =
  | { kind: "available"; value: number; unit: string | null }
  | { kind: "unavailable"; missing: LifecycleModule[] };
export interface DeclaredModulesSubtotal {
  value: number;
  unit: string | null;
  modules: { module: LifecycleModule; value: number; provenance: Provenance }[];
}

// Canonical non-overlapping module order for subtotals & columns.
const MODULE_ORDER: LifecycleModule[] = [
  "A1", "A2", "A3", "A1-A3", "A4", "A5",
  "B1", "B2", "B3", "B4", "B5", "B6", "B7",
  "C1", "C2", "C3", "C4", "D",
];

function declaredModuleImpacts(product: ConcreteProduct): { module: LifecycleModule; value: number; unit: string | null; provenance: Provenance }[] {
  const has = (m: LifecycleModule) => asComparableGwp(product.lifecycleModules[m]?.gwpTotal) !== null;
  const collapseA1A3 = has("A1-A3"); // avoid double-count with A1/A2/A3
  const out: { module: LifecycleModule; value: number; unit: string | null; provenance: Provenance }[] = [];
  for (const m of MODULE_ORDER) {
    if (collapseA1A3 && (m === "A1" || m === "A2" || m === "A3")) continue;
    const imp = asComparableGwp(product.lifecycleModules[m]?.gwpTotal);
    if (imp) out.push({ module: m, value: imp.value, unit: imp.unit, provenance: imp.provenance });
  }
  return out;
}

export function computeSubtotals(product: ConcreteProduct): Subtotals {
  const declared = declaredModuleImpacts(product);
  const units = new Set(declared.map((d) => d.unit));
  if (units.size > 1) throw new Error(`Inconsistent GWP units for ${product.id}: ${[...units].join(", ")}`);
  const unit = declared[0]?.unit ?? null;

  const need: LifecycleModule[] = ["A1-A3", "A4", "A5"];
  const missing = need.filter((m) => asComparableGwp(product.lifecycleModules[m]?.gwpTotal) === null);
  const a1a3a4a5: Subtotal = missing.length === 0
    ? { kind: "available", value: need.reduce((s, m) => s + asComparableGwp(product.lifecycleModules[m]!.gwpTotal)!.value, 0), unit }
    : { kind: "unavailable", missing };

  return {
    a1a3a4a5,
    declaredModules: {
      value: declared.reduce((s, d) => s + d.value, 0),
      unit,
      modules: declared.map(({ module, value, provenance }) => ({ module, value, provenance })),
    },
  };
}

interface RowBase { key: string; fileName: string; product: ConcreteProduct }
export type ComparableRow = RowBase & {
  kind: "comparable";
  unitGroup: string;
  declaredUnit: string;
  a1a3: ComparableImpact;
  subtotals: Subtotals;
};
export type ComparatorRow =
  | ComparableRow
  | (RowBase & { kind: "needs_review"; status: ComparisonStatus; reason: string })
  | (RowBase & { kind: "grouped"; status: ComparisonStatus; reason: string })
  | (RowBase & { kind: "missing_core_data"; status: ComparisonStatus; reason: string })
  | (RowBase & { kind: "not_comparable"; status: ComparisonStatus; reason: string });

function nonComparable(loaded: LoadedProduct, kind: Exclude<ComparatorRow["kind"], "comparable">): ComparatorRow {
  const { product } = loaded;
  return { kind, key: loaded.key, fileName: loaded.fileName, product, status: product.comparisonStatus, reason: product.comparisonStatusReason };
}

export function toComparatorRow(loaded: LoadedProduct): ComparatorRow {
  const { product } = loaded;
  const status = product.comparisonStatus;

  // Sections follow the reviewed status.
  if (status === "grouped_declaration") return nonComparable(loaded, "grouped");
  if (status === "review_required") return nonComparable(loaded, "needs_review");
  if (status === "missing_core_data") return nonComparable(loaded, "missing_core_data");
  if (status === "not_comparable") return nonComparable(loaded, "not_comparable");

  // comparison_eligible: enforce the value-level + product-context contract.
  const a1a3 = asComparableGwp(product.lifecycleModules["A1-A3"]?.gwpTotal);
  const unitGroup = comparableDeclaredUnitKey(product.declaredUnit.value);
  const strengthOk =
    typeof product.compressiveStrength.value === "number" &&
    product.compressiveStrength.status === "declared" &&
    product.compressiveStrength.reviewStatus === "reviewed" &&
    product.compressiveStrength.provenance !== null;
  const locationOk =
    product.manufacturingLocation.value !== null &&
    product.manufacturingLocation.status === "declared" &&
    product.manufacturingLocation.reviewStatus === "reviewed" &&
    product.manufacturingLocation.provenance !== null;

  if (!a1a3 || !unitGroup || !strengthOk || !locationOk) {
    // Contradiction: reviewed as eligible but fails the machine contract.
    throw new Error(
      `Product ${loaded.key} is comparison_eligible but fails the comparable contract ` +
      `(a1a3=${!!a1a3}, unitGroup=${unitGroup}, strength=${strengthOk}, location=${locationOk}).`,
    );
  }

  return {
    kind: "comparable",
    key: loaded.key,
    fileName: loaded.fileName,
    product,
    unitGroup,
    declaredUnit: product.declaredUnit.value as string,
    a1a3,
    subtotals: computeSubtotals(product),
  };
}

export interface Sections {
  comparable: ComparableRow[];
  review: ComparatorRow[]; // needs_review + grouped
  excluded: ComparatorRow[]; // missing_core_data + not_comparable
}

export function partition(rows: ComparatorRow[]): Sections {
  const sections: Sections = { comparable: [], review: [], excluded: [] };
  for (const row of rows) {
    switch (row.kind) {
      case "comparable": sections.comparable.push(row); break;
      case "needs_review":
      case "grouped": sections.review.push(row); break;
      case "missing_core_data":
      case "not_comparable": sections.excluded.push(row); break;
      default: { const _exhaustive: never = row; throw new Error(`unhandled ${_exhaustive}`); }
    }
  }
  return sections;
}

export type CellState =
  | { kind: "declared"; value: number; unit: string | null; provenance: Provenance }
  | { kind: "not_declared" }
  | { kind: "missing" }
  | { kind: "not_applicable" }
  | { kind: "needs_review"; value: number | null }
  | { kind: "not_reported" };

export function cellState(product: ConcreteProduct, module: LifecycleModule): CellState {
  const impact = product.lifecycleModules[module]?.gwpTotal;
  if (!impact) return { kind: "not_reported" };
  if (impact.reviewStatus !== "reviewed") return { kind: "needs_review", value: impact.value };
  switch (impact.status) {
    case "declared":
      return typeof impact.value === "number"
        ? { kind: "declared", value: impact.value, unit: impact.unit, provenance: impact.provenance }
        : { kind: "missing" };
    case "not_declared": return { kind: "not_declared" };
    case "missing": return { kind: "missing" };
    case "not_applicable": return { kind: "not_applicable" };
    default: { const _e: never = impact.status; throw new Error(`unhandled ${_e}`); }
  }
}

/** Toggle membership of a value in a list, preserving order. Used for filter checkbox state. */
export function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export interface FilterState { strengths: number[]; locations: string[] }

// Strength and location are guaranteed declared+reviewed+provenance-backed for every ComparableRow
// (toComparatorRow throws otherwise), so filtering never needs an "undetermined" bucket for null fields.
export function applyFilters(rows: ComparableRow[], f: FilterState): { matched: ComparableRow[] } {
  const matched: ComparableRow[] = [];
  for (const row of rows) {
    const strength = row.product.compressiveStrength.value;
    const location = row.product.manufacturingLocation.value;
    const strengthOk = f.strengths.length === 0 || (typeof strength === "number" && f.strengths.includes(strength));
    const locationOk = f.locations.length === 0 || (location !== null && f.locations.includes(location));
    if (strengthOk && locationOk) matched.push(row);
  }
  return { matched };
}

export function distinctStrengths(rows: ComparableRow[]): number[] {
  return [...new Set(rows.map((r) => r.product.compressiveStrength.value).filter((v): v is number => typeof v === "number"))].sort((a, b) => a - b);
}
export function distinctLocations(rows: ComparableRow[]): string[] {
  return [...new Set(rows.map((r) => r.product.manufacturingLocation.value).filter((v): v is string => v !== null))].sort();
}

export const USE_STAGE_MODULES: LifecycleModule[] = ["B1", "B2", "B3", "B4", "B5", "B6", "B7"];

/** Whether any row has a declared value for any of the given modules — drives table column grouping decisions. */
export function anyDeclaredModule(rows: ComparableRow[], modules: LifecycleModule[]): boolean {
  return rows.some((r) => modules.some((m) => cellState(r.product, m).kind === "declared"));
}

export function sortByA1A3(rows: ComparableRow[], dir: "asc" | "desc"): ComparableRow[] {
  return [...rows].sort((a, b) => {
    const d = a.a1a3.value - b.a1a3.value;
    if (d !== 0) return dir === "asc" ? d : -d;
    return a.product.name.localeCompare(b.product.name); // stable tiebreak
  });
}

export function modulesPresentInCorpus(products: ConcreteProduct[]): LifecycleModule[] {
  const present = new Set<LifecycleModule>();
  for (const p of products) for (const m of Object.keys(p.lifecycleModules) as LifecycleModule[]) present.add(m);
  return MODULE_ORDER.filter((m) => present.has(m));
}

export interface CorpusSummary {
  fileCount: number; productCount: number;
  comparable: number; review: number; grouped: number; missing: number; notComparable: number;
  warningCount: number;
}
export function summarizeCorpus(rows: ComparatorRow[], fileCount: number, warningCount: number): CorpusSummary {
  const s: CorpusSummary = { fileCount, productCount: rows.length, comparable: 0, review: 0, grouped: 0, missing: 0, notComparable: 0, warningCount };
  for (const r of rows) {
    if (r.kind === "comparable") s.comparable++;
    else if (r.kind === "needs_review") s.review++;
    else if (r.kind === "grouped") s.grouped++;
    else if (r.kind === "missing_core_data") s.missing++;
    else s.notComparable++;
  }
  return s;
}
