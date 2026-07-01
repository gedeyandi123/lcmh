"use client";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import type { LifecycleModule } from "../lib/schema";
import type { ComparableRow, ComparatorRow } from "../lib/comparability";
import { applyFilters, distinctLocations, distinctStrengths, sortByA1A3, toggleValue } from "../lib/comparability";
import { groupLocationOptions, locationDisplay, ROW_STATUS_BADGE_CLASS, ROW_STATUS_LABEL } from "../lib/formatting";
import { ComparisonTable } from "./ComparisonTable";
import { ProvenancePanel } from "./ProvenancePanel";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 rounded";

export interface ComparatorViewProps {
  comparable: ComparableRow[];
  review: ComparatorRow[];
  excluded: ComparatorRow[];
  modules: LifecycleModule[];
  // Rendered by the server (page.tsx) and passed through — keeps the banner a
  // Server Component (no client JS) while still living inside this client grid
  // so it top-aligns with the provenance panel column.
  banner: ReactNode;
}

export function ComparatorView({ comparable, review, excluded, modules, banner }: ComparatorViewProps) {
  const params = useSearchParams();
  const strengths = (params.get("strength") ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  // Repeated params (not comma-joined): some location values contain commas
  // (e.g. "Hunter Valley, NSW, Australia 10mm..."), which a comma-joined string would corrupt.
  const locations = params.getAll("location");
  const sortDir = params.get("sort") === "desc" ? "desc" : "asc";
  const selectedKey = params.get("product");

  const setParam = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(window.location.search);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, []);

  const setLocations = useCallback((values: string[]) => {
    const next = new URLSearchParams(window.location.search);
    next.delete("location");
    values.forEach((v) => next.append("location", v));
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, []);

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(window.location.search);
    next.delete("strength");
    next.delete("location");
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, []);

  const { matched } = applyFilters(comparable, { strengths, locations });
  const sorted = sortByA1A3(matched, sortDir);
  const selected = [...comparable, ...review, ...excluded].find((r) => r.key === selectedKey) ?? null;

  const allStrengths = distinctStrengths(comparable);
  const allLocations = distinctLocations(comparable);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        {banner}
        <FilterPanel
          allStrengths={allStrengths}
          allLocations={allLocations}
          strengths={strengths}
          locations={locations}
          onToggleStrength={(s) => setParam("strength", toggleValue(strengths.map(String), String(s)).join(","))}
          onToggleLocation={(v) => setLocations(toggleValue(locations, v))}
          onClearAll={clearFilters}
        />

        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold">
            Comparable products{" "}
            <span className="text-sm font-normal text-slate-500">
              ({sorted.length} of {comparable.length}{strengths.length || locations.length ? ", filtered" : ""})
            </span>
          </h2>
          <p className="text-xs text-slate-500">Sorted by A1-A3 only.</p>
        </div>
        <ComparisonTable rows={sorted} modules={modules} sortDir={sortDir} selectedKey={selectedKey}
          onToggleSort={() => setParam("sort", sortDir === "asc" ? "desc" : "asc")}
          onSelect={(key) => setParam("product", key)} />

        <h2 className="mt-8 mb-1 text-lg font-semibold">Needs review / grouped declarations</h2>
        <p className="mb-2 text-xs text-slate-500">
          These records are shown for transparency but excluded from product-level comparison.
        </p>
        <LedgerList rows={review} selectedKey={selectedKey} onSelect={(key) => setParam("product", key)} />

        <h2 className="mt-8 mb-1 text-lg font-semibold">Missing or not comparable</h2>
        <p className="mb-2 text-xs text-slate-500">
          These records are shown for transparency but excluded from product-level comparison.
        </p>
        <LedgerList rows={excluded} selectedKey={selectedKey} onSelect={(key) => setParam("product", key)} />
      </div>

      <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
        <ProvenancePanel row={selected} onClose={() => setParam("product", null)} />
      </div>
    </div>
  );
}

function FilterPanel({
  allStrengths, allLocations, strengths, locations, onToggleStrength, onToggleLocation, onClearAll,
}: {
  allStrengths: number[];
  allLocations: string[];
  strengths: number[];
  locations: string[];
  onToggleStrength: (s: number) => void;
  onToggleLocation: (v: string) => void;
  onClearAll: () => void;
}) {
  const [locationOpen, setLocationOpen] = useState(() => locations.length > 0);
  const hasActiveFilters = strengths.length > 0 || locations.length > 0;

  return (
    <fieldset className="mb-4 rounded-lg border border-slate-200 p-3 text-sm">
      <legend className="mb-1 px-1 font-medium">Filters</legend>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="contents"><span className="text-slate-500">Compressive strength:</span></legend>
        {allStrengths.map((s) => (
          <label key={s} className="flex items-center gap-1">
            <input type="checkbox" className={FOCUS_RING} checked={strengths.includes(s)} onChange={() => onToggleStrength(s)} />
            {s} MPa
          </label>
        ))}
      </fieldset>

      <details
        className="mt-2 w-full"
        open={locationOpen}
        onToggle={(e) => setLocationOpen(e.currentTarget.open)}
      >
        <summary className={`cursor-pointer text-slate-500 ${FOCUS_RING}`}>
          Manufacturing location — {locations.length} selected
        </summary>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          {groupLocationOptions(allLocations).map(({ group, options }) => (
            <fieldset key={group} className="flex flex-col gap-1">
              <legend className="contents"><span className="text-xs font-medium text-slate-500">{group}</span></legend>
              {options.map(({ value, primary, secondary }) => (
                <label key={value} className="flex items-start gap-1" title={value}>
                  <input type="checkbox" className={`${FOCUS_RING} mt-0.5`} checked={locations.includes(value)}
                    onChange={() => onToggleLocation(value)} />
                  <span className="leading-tight">
                    <span className="block">{primary}</span>
                    {secondary && <span className="block text-xs text-slate-500">{secondary}</span>}
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </details>

      {hasActiveFilters && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs">
          <span className="text-slate-500">Active filters:</span>
          {strengths.map((s) => (
            <button key={s} type="button" className={`rounded-full bg-slate-100 px-2 py-0.5 hover:bg-slate-200 ${FOCUS_RING}`}
              onClick={() => onToggleStrength(s)}>
              {s} MPa <span aria-hidden="true">×</span>
              <span className="sr-only"> — remove filter</span>
            </button>
          ))}
          {locations.map((v) => (
            <button key={v} type="button" className={`rounded-full bg-slate-100 px-2 py-0.5 hover:bg-slate-200 ${FOCUS_RING}`}
              title={v} onClick={() => onToggleLocation(v)}>
              {locationDisplay(v).primary} <span aria-hidden="true">×</span>
              <span className="sr-only"> — remove filter</span>
            </button>
          ))}
          <button type="button" className={`underline text-slate-500 hover:text-slate-700 ${FOCUS_RING}`} onClick={onClearAll}>
            Clear all
          </button>
        </div>
      )}
    </fieldset>
  );
}

function LedgerList({
  rows, onSelect, selectedKey,
}: {
  rows: ComparatorRow[];
  onSelect: (key: string) => void;
  selectedKey?: string | null;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">None.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => {
        const isSelected = r.key === selectedKey;
        return (
        <li
          key={r.key}
          className={`group rounded border p-2 ${isSelected ? "border-blue-400 bg-blue-50/60" : "border-slate-200"}`}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <button type="button" className={`min-w-0 text-left ${FOCUS_RING}`} onClick={() => onSelect(r.key)}>
              <span className="line-clamp-2 font-medium" title={r.product.name || r.key}>{r.product.name || r.key}</span>
              <span className="sr-only">{isSelected ? " (selected)" : ""}</span>
            </button>
            <div className="flex shrink-0 items-start gap-1.5">
              <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${ROW_STATUS_BADGE_CLASS[r.kind]}`}>
                {ROW_STATUS_LABEL[r.kind]}
              </span>
              <button
                type="button"
                className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-xs ${
                  isSelected
                    ? "border-blue-200 bg-blue-100 text-blue-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                } ${FOCUS_RING}`}
                onClick={() => onSelect(r.key)}
              >
                {isSelected ? "Viewing" : "Details"}
              </button>
            </div>
          </div>
          {"reason" in r && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">Why excluded from comparison</summary>
              <div className="mt-1 space-y-1 text-slate-600">
                <p>{r.reason}</p>
                <p className="text-xs">
                  Declared unit: {r.product.declaredUnit.value ?? "Not declared"} · Strength:{" "}
                  {r.product.compressiveStrength.value ?? "Not declared"} · Location:{" "}
                  {r.product.manufacturingLocation.value ?? "Not declared"}
                </p>
              </div>
            </details>
          )}
        </li>
        );
      })}
    </ul>
  );
}
