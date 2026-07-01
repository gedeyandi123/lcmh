import { describe, expect, it } from "vitest";
import { formatKgCo2e, cellLabel, subtotalText, groupLocationOptions, locationDisplay } from "../src/lib/formatting.js";

describe("formatKgCo2e", () => {
  it("formats positive and negative", () => {
    expect(formatKgCo2e(275)).toBe("275 kg CO₂e");
    expect(formatKgCo2e(-12.2)).toBe("-12.2 kg CO₂e");
  });
});

describe("cellLabel", () => {
  it("renders explicit words, never blank or zero", () => {
    expect(cellLabel({ kind: "not_declared" })).toBe("Not declared");
    expect(cellLabel({ kind: "missing" })).toBe("Missing");
    expect(cellLabel({ kind: "not_reported" })).toBe("Not reported");
    expect(cellLabel({ kind: "not_applicable" })).toBe("N/A");
    expect(cellLabel({ kind: "declared", value: 275, unit: "kg CO2e", provenance: {} as never })).toBe("275 kg CO₂e");
  });

  it("never leaks the raw value for needs_review", () => {
    expect(cellLabel({ kind: "needs_review", value: 999 })).not.toContain("999");
  });
});

describe("locationDisplay / groupLocationOptions", () => {
  it("maps a known comma-containing location to a short primary label without altering the raw value", () => {
    const d = locationDisplay("Hunter Valley, NSW, Australia");
    expect(d.group).toBe("New South Wales");
    expect(d.primary).toBe("Hunter Valley");
  });

  it("falls back to an Other group showing the full raw value for an unmapped location (never hidden)", () => {
    const d = locationDisplay("Some New Depot, NT");
    expect(d.group).toBe("Other");
    expect(d.primary).toBe("Some New Depot, NT");
  });

  it("preserves every input value across groups, with no value dropped or duplicated", () => {
    const values = ["Melbourne", "Brisbane", "Rockbank", "Melbourne South-East"];
    const groups = groupLocationOptions(values);
    const flat = groups.flatMap((g) => g.options.map((o) => o.value));
    expect(flat.sort()).toEqual([...values].sort());
  });
});

describe("subtotalText", () => {
  it("names the missing modules when unavailable", () => {
    expect(subtotalText({ kind: "unavailable", missing: ["A4", "A5"] })).toBe(
      "Incomplete lifecycle coverage — A4, A5 not declared",
    );
  });
});
