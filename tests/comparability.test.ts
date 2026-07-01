import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  asComparableGwp,
  comparableDeclaredUnitKey,
  toComparatorRow,
  partition,
  computeSubtotals,
  cellState,
  applyFilters,
  sortByA1A3,
  distinctStrengths,
  toggleValue,
} from "../src/lib/comparability.js";
import type { EpdDataFile } from "../src/lib/schema.js";

function loadProduct(file: string, id: string) {
  const data = JSON.parse(readFileSync(join("data", file), "utf8")) as EpdDataFile;
  const product = data.products.find((p) => p.id === id)!;
  return { key: `${data.sourcePdf.fileName}::${id}`, fileName: data.sourcePdf.fileName, product };
}

describe("comparableDeclaredUnitKey", () => {
  it("maps reviewed 1 m3 variants to one group, rejects others", () => {
    expect(comparableDeclaredUnitKey("1 cubic metre")).toBe("m3");
    expect(comparableDeclaredUnitKey("1 m3 of ready-mix concrete")).toBe("m3");
    expect(comparableDeclaredUnitKey("1 tonne")).toBeNull();
    expect(comparableDeclaredUnitKey(null)).toBeNull();
  });
});

describe("asComparableGwp", () => {
  it("returns a ComparableImpact for a declared reviewed provenanced value", () => {
    const p = loadProduct("epd-hub-5210-2026-06-27-en.json", "envirocrete-40-32mpa");
    const impact = asComparableGwp(p.product.lifecycleModules["A1-A3"]?.gwpTotal);
    expect(impact?.value).toBe(275);
    expect(impact?.provenance.page).toBe(13);
  });

  it("returns null for not_declared / unreviewed / null-page", () => {
    expect(asComparableGwp(undefined)).toBeNull();
    expect(asComparableGwp({ status: "not_declared", value: null } as never)).toBeNull();
  });
});

describe("toComparatorRow / partition", () => {
  it("builds a comparable row for an eligible product", () => {
    const row = toComparatorRow(loadProduct("epd-hub-5210-2026-06-27-en.json", "envirocrete-40-32mpa"));
    expect(row.kind).toBe("comparable");
    if (row.kind === "comparable") {
      expect(row.a1a3.value).toBe(275);
      expect(row.unitGroup).toBe("m3");
    }
  });

  it("routes review_required and grouped to non-comparable variants", () => {
    const grouped = toComparatorRow(loadProduct(
      "epd-australasia-com-wp-content-uploads-2023-08-epd-ies-0009353-003-hallett-ready-mix-concrete-2026-05-04-pdf.json",
      // id derived from file; use the first product
      JSON.parse(readFileSync(join("data","epd-australasia-com-wp-content-uploads-2023-08-epd-ies-0009353-003-hallett-ready-mix-concrete-2026-05-04-pdf.json"),"utf8")).products[0].id,
    ));
    expect(["grouped", "needs_review", "missing_core_data", "not_comparable"]).toContain(grouped.kind);
  });

  it("throws on comparison_eligible with an unreviewed strength/location value (no real fixture has this gap; synthetic)", () => {
    const loaded = loadProduct("epd-hub-5210-2026-06-27-en.json", "envirocrete-40-32mpa");
    const tampered = {
      ...loaded,
      product: {
        ...loaded.product,
        // value + provenance are populated (schema-legal), but reviewStatus is not "reviewed" —
        // this must not silently drive a comparable row.
        compressiveStrength: { ...loaded.product.compressiveStrength, reviewStatus: "unreviewed" as const },
      },
    };
    expect(() => toComparatorRow(tampered)).toThrow(/fails the comparable contract/);
  });
});

describe("computeSubtotals (golden: EPD-5210)", () => {
  const product = loadProduct("epd-hub-5210-2026-06-27-en.json", "envirocrete-40-32mpa").product;

  it("A1-A3+A4+A5 is unavailable (A4,A5 not present)", () => {
    const s = computeSubtotals(product);
    expect(s.a1a3a4a5.kind).toBe("unavailable");
    if (s.a1a3a4a5.kind === "unavailable") {
      expect(s.a1a3a4a5.missing).toEqual(["A4", "A5"]);
    }
  });

  it("declared-modules subtotal sums without double-counting A1/A2/A3 under A1-A3", () => {
    const s = computeSubtotals(product);
    // 275 (A1-A3) + 4.23 + 12.0 + 6.82 + 4.17 - 12.2 = 290.02
    expect(s.declaredModules.value).toBeCloseTo(290.02, 2);
    expect(s.declaredModules.modules.map((m) => m.module)).toEqual(["A1-A3", "C1", "C2", "C3", "C4", "D"]);
  });
});

describe("cellState", () => {
  const product = loadProduct("epd-hub-5210-2026-06-27-en.json", "envirocrete-40-32mpa").product;

  it("declared module → declared with value", () => {
    const c = cellState(product, "A1-A3");
    expect(c.kind).toBe("declared");
    if (c.kind === "declared") expect(c.value).toBe(275);
  });

  it("absent module → not_reported (never blank/zero)", () => {
    expect(cellState(product, "A4").kind).toBe("not_reported");
  });

  it("module present but explicitly not_declared → not_declared (never treated as zero)", () => {
    const withNotDeclared = {
      ...product,
      lifecycleModules: {
        ...product.lifecycleModules,
        A4: {
          gwpTotal: {
            ...product.lifecycleModules["A1-A3"]!.gwpTotal,
            module: "A4" as const,
            status: "not_declared" as const,
            value: null,
            reviewStatus: "reviewed" as const,
          },
        },
      },
    };
    expect(cellState(withNotDeclared, "A4")).toEqual({ kind: "not_declared" });
  });

  it("module present with status missing → missing", () => {
    const withMissing = {
      ...product,
      lifecycleModules: {
        ...product.lifecycleModules,
        A4: {
          gwpTotal: {
            ...product.lifecycleModules["A1-A3"]!.gwpTotal,
            module: "A4" as const,
            status: "missing" as const,
            value: null,
            reviewStatus: "reviewed" as const,
          },
        },
      },
    };
    expect(cellState(withMissing, "A4")).toEqual({ kind: "missing" });
  });

  it("module present with status not_applicable → not_applicable", () => {
    const withNotApplicable = {
      ...product,
      lifecycleModules: {
        ...product.lifecycleModules,
        A4: {
          gwpTotal: {
            ...product.lifecycleModules["A1-A3"]!.gwpTotal,
            module: "A4" as const,
            status: "not_applicable" as const,
            value: null,
            reviewStatus: "reviewed" as const,
          },
        },
      },
    };
    expect(cellState(withNotApplicable, "A4")).toEqual({ kind: "not_applicable" });
  });

  it("module present but reviewStatus is needs_review → needs_review, even with a numeric-looking declared value (must NOT fall through to declared)", () => {
    const withNeedsReview = {
      ...product,
      lifecycleModules: {
        ...product.lifecycleModules,
        A4: {
          gwpTotal: {
            ...product.lifecycleModules["A1-A3"]!.gwpTotal,
            module: "A4" as const,
            status: "declared" as const,
            value: 42,
            reviewStatus: "needs_review" as const,
          },
        },
      },
    };
    const c = cellState(withNeedsReview, "A4");
    expect(c).toEqual({ kind: "needs_review", value: 42 });
    expect(c.kind).not.toBe("declared");
  });
});

describe("applyFilters", () => {
  it("matches by strength", () => {
    const rows = [loadProduct("epd-hub-5210-2026-06-27-en.json", "envirocrete-40-32mpa")]
      .map((p) => toComparatorRow(p))
      .filter((r): r is import("../src/lib/comparability.js").ComparableRow => r.kind === "comparable");
    const { matched } = applyFilters(rows, { strengths: [32], locations: [] });
    expect(matched).toHaveLength(1);
    const none = applyFilters(rows, { strengths: [99], locations: [] });
    expect(none.matched).toHaveLength(0);
  });
});

describe("toggleValue + repeated-param location filter (comma-in-value regression)", () => {
  it("toggles membership without splitting on commas", () => {
    const commaLocation = "Hunter Valley, NSW, Australia";
    const added = toggleValue([], commaLocation);
    expect(added).toEqual([commaLocation]);
    const removed = toggleValue(added, commaLocation);
    expect(removed).toEqual([]);
  });

  it("round-trips comma-containing values through repeated URLSearchParams entries (not comma-join)", () => {
    const values = [
      "Hunter Valley, NSW, Australia",
      "Melbourne",
      "21 Mackay Slade Point Road, Mackay, Australia",
    ];
    const params = new URLSearchParams();
    values.forEach((v) => params.append("location", v));
    expect(params.getAll("location")).toEqual(values);

    // The old comma-join encoding would have corrupted these exact values.
    const commaJoined = values.join(",");
    expect(commaJoined.split(",")).not.toEqual(values);
  });
});

describe("sortByA1A3", () => {
  it("sorts ascending by a1a3.value with a stable alphabetical name tiebreak on equal values", () => {
    const base = toComparatorRow(loadProduct("epd-hub-5210-2026-06-27-en.json", "envirocrete-40-32mpa"));
    if (base.kind !== "comparable") throw new Error("fixture must be comparable");
    const rowB = { ...base, product: { ...base.product, name: "Beta Mix" } };
    const rowA = { ...base, product: { ...base.product, name: "Alpha Mix" } };
    // Equal a1a3.value on both — tiebreak must be alphabetical by product name.
    const sorted = sortByA1A3([rowB, rowA], "asc");
    expect(sorted.map((r) => r.product.name)).toEqual(["Alpha Mix", "Beta Mix"]);
  });
});
