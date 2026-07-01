import type { CellState, Subtotal } from "./comparability";

export function formatKgCo2e(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${String(rounded)} kg CO₂e`;
}

/** Bare numeric formatting (no repeated unit) for dense table cells. Unit is stated once at table/header level. */
export function formatKgCo2eNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function cellLabel(state: CellState): string {
  switch (state.kind) {
    case "declared": return formatKgCo2e(state.value);
    case "not_declared": return "Not declared";
    case "missing": return "Missing";
    case "not_applicable": return "N/A";
    case "not_reported": return "Not reported";
    case "needs_review": return "Needs review";
    default: { const _e: never = state; throw new Error(`unhandled ${_e}`); }
  }
}

/** Same states as cellLabel, but a declared value renders as a bare number for dense table cells. */
export function tableCellLabel(state: CellState): string {
  return state.kind === "declared" ? formatKgCo2eNumber(state.value) : cellLabel(state);
}

export interface LocationDisplay { group: string; primary: string; secondary?: string }

// Display-only grouping for the reviewed manufacturing-location values in this static corpus.
// Filter values/semantics are never derived from this table — only the label shown to the user.
const LOCATION_DISPLAY: Record<string, LocationDisplay> = {
  "Melbourne": { group: "Victoria", primary: "Melbourne" },
  "Melbourne South-East": { group: "Victoria", primary: "Melbourne South-East" },
  "Port Melbourne": { group: "Victoria", primary: "Port Melbourne" },
  "Rockbank": { group: "Victoria", primary: "Rockbank" },
  "Hunter Valley, NSW, Australia": { group: "New South Wales", primary: "Hunter Valley" },
  "Brisbane": { group: "Queensland", primary: "Brisbane" },
  "South East Queensland, QLD": { group: "Queensland", primary: "South East Queensland" },
  "21 Mackay Slade Point Road, Mackay, Australia": {
    group: "Queensland", primary: "Mackay", secondary: "Slade Point Road",
  },
  "11 McIntosh Drive, Airlie Beach, Australia": {
    group: "Queensland", primary: "Airlie Beach", secondary: "McIntosh Drive",
  },
};

const LOCATION_GROUP_ORDER = ["Victoria", "New South Wales", "Queensland", "Other"];

/** Falls back to an "Other" group showing the full raw value — an unmapped future location is never hidden. */
export function locationDisplay(value: string): LocationDisplay {
  return LOCATION_DISPLAY[value] ?? { group: "Other", primary: value };
}

export function groupLocationOptions(
  values: string[],
): { group: string; options: (LocationDisplay & { value: string })[] }[] {
  const byGroup = new Map<string, (LocationDisplay & { value: string })[]>();
  for (const value of values) {
    const display = locationDisplay(value);
    const list = byGroup.get(display.group) ?? [];
    list.push({ ...display, value });
    byGroup.set(display.group, list);
  }
  const orderedGroups = [...LOCATION_GROUP_ORDER, ...[...byGroup.keys()].filter((g) => !LOCATION_GROUP_ORDER.includes(g))];
  return orderedGroups.filter((g) => byGroup.has(g)).map((group) => ({ group, options: byGroup.get(group)! }));
}

export type RowStatusKind = "comparable" | "needs_review" | "grouped" | "missing_core_data" | "not_comparable";

export const ROW_STATUS_LABEL: Record<RowStatusKind, string> = {
  comparable: "Comparable",
  needs_review: "Needs review",
  grouped: "Grouped declaration",
  missing_core_data: "Missing core data",
  not_comparable: "Not comparable",
};

// Distinct hues per comparison-status kind so the four excluded states scan apart without reading text.
export const ROW_STATUS_BADGE_CLASS: Record<RowStatusKind, string> = {
  comparable: "bg-emerald-50 text-emerald-800",
  needs_review: "bg-amber-50 text-amber-800",
  grouped: "bg-slate-100 text-slate-700",
  missing_core_data: "bg-rose-50 text-rose-700",
  not_comparable: "bg-rose-50 text-rose-700",
};

export const A1A3_LABEL = "A1-A3 production-stage GWP total";
export const A1A3A4A5_LABEL = "Declared A1-A3 + A4 + A5 subtotal";
export const DECLARED_MODULES_LABEL = "Declared modules subtotal";

export function subtotalText(s: Subtotal): string {
  return s.kind === "available"
    ? formatKgCo2e(s.value)
    : `Incomplete lifecycle coverage — ${s.missing.join(", ")} not declared`;
}
