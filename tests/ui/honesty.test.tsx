import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ComparisonTable } from "../../src/components/ComparisonTable";
import { toComparatorRow } from "../../src/lib/comparability";
import type { ComparableRow } from "../../src/lib/comparability";
import type { EpdDataFile } from "../../src/lib/schema";

function comparableRow(): ComparableRow {
  const data = JSON.parse(
    readFileSync(join("data", "epd-hub-5210-2026-06-27-en.json"), "utf8"),
  ) as EpdDataFile;
  const product = data.products.find((p) => p.id === "envirocrete-40-32mpa")!;
  const row = toComparatorRow({
    key: `${data.sourcePdf.fileName}::${product.id}`,
    fileName: data.sourcePdf.fileName,
    product,
  });
  if (row.kind !== "comparable") throw new Error("expected comparable row for this fixture");
  return row;
}

describe("ComparisonTable honesty", () => {
  it("renders the A1-A3 value and a word (never blank/0) for an absent module", () => {
    const row = comparableRow();
    render(
      <ComparisonTable
        rows={[row]}
        modules={["A1-A3", "A4", "C1", "D"]}
        sortDir="asc"
        onToggleSort={() => {}}
        onSelect={() => {}}
      />,
    );

    // Present value: A1-A3 GWP total for EPD-5210, reviewed + provenance-backed.
    // Main table shows a bare number (unit is stated once in the table note); unit is kept in the inspector.
    expect(screen.getByText("275")).toBeInTheDocument();

    // Absent module (A4 is not reported for this product) must render a word,
    // never a blank cell and never a literal "0".
    expect(screen.getByText("Not reported")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
