import { describe, expect, it } from "vitest";

import {
  findForbiddenKeys,
  validateEpdDataFile,
  validateLifecycleImpactRules,
} from "../src/lib/schema.js";

const provenance = {
  pdfFile: "sample.pdf",
  page: 7,
  section: "Environmental performance",
  tableLabel: "Life cycle assessment results",
  rowLabel: "GWP-total",
  columnLabel: "A1-A3",
  sourceLabel: "GWP-total",
  rawText: "GWP-total kg CO2 eq. A1-A3 123",
  extractionMethod: "pdf_table_manual_verified",
} as const;

const sourcedString = {
  value: "1 m3 concrete",
  unit: null,
  status: "declared",
  provenance,
  reviewStatus: "reviewed",
} as const;

const sourcedNumber = {
  value: 32,
  unit: "MPa",
  status: "declared",
  provenance,
  reviewStatus: "reviewed",
} as const;

const validImpact = {
  indicator: "gwp_total",
  sourceLabel: "GWP-total",
  module: "A1-A3",
  value: 123,
  rawValue: "123",
  unit: "kg CO2 eq.",
  status: "declared",
  provenance,
  extractionConfidence: "high",
  reviewStatus: "reviewed",
} as const;

const validFile = {
  schemaVersion: "1.0.0",
  extractionVersion: "2026-06-30T00:00:00Z",
  sourcePdf: {
    fileName: "sample.pdf",
    pageCount: 12,
    textCharCount: 1000,
    family: "EPD Hub / One Click LCA",
  },
  epd: {
    declarationNumber: "EPD-1",
    programOperator: "Program",
    publisher: "Publisher",
    validUntil: "2030-01-01",
  },
  products: [
    {
      id: "sample-product",
      name: "Sample concrete",
      manufacturer: "Sample manufacturer",
      declaredUnit: sourcedString,
      compressiveStrength: sourcedNumber,
      manufacturingLocation: sourcedString,
      comparisonStatus: "comparison_eligible",
      comparisonStatusReason: "Reviewed A1-A3 value with complete provenance.",
      lifecycleModules: {
        "A1-A3": {
          gwpTotal: validImpact,
        },
      },
      reviewNotes: [],
    },
  ],
  reviewNotes: [],
};

describe("final EPD data schema", () => {
  it("accepts a reviewed final-schema EPD file with lifecycleModules", () => {
    const result = validateEpdDataFile(validFile);

    expect(result.success).toBe(true);
  });

  it("rejects prototype lifecycleImpacts arrays in final data", () => {
    const candidate = {
      ...validFile,
      products: [
        {
          ...validFile.products[0],
          lifecycleImpacts: [validImpact],
        },
      ],
    };

    const result = validateEpdDataFile(candidate);

    expect(result.success).toBe(false);
    expect(result.errors.join("\n")).toContain("lifecycleImpacts");
  });

  it("rejects non-declared lifecycle values that carry numeric values", () => {
    const result = validateLifecycleImpactRules({
      ...validImpact,
      status: "not_declared",
      value: 12,
      rawValue: "ND",
    });

    expect(result).toContain("not_declared impact must have value null");
  });

  it("rejects declared lifecycle values without numeric values", () => {
    const result = validateLifecycleImpactRules({
      ...validImpact,
      value: null,
      rawValue: null,
    });

    expect(result).toContain("declared impact must have numeric value");
  });


  it("allows needs-review impact evidence when product is review_required", () => {
    const reviewRequiredFile = {
      ...validFile,
      products: [
        {
          ...validFile.products[0],
          comparisonStatus: "review_required",
          comparisonStatusReason: "Source row exists but still needs manual review.",
          lifecycleModules: {
            "A1-A3": {
              gwpTotal: {
                ...validImpact,
                reviewStatus: "needs_review",
              },
            },
          },
        },
      ],
    };

    const result = validateEpdDataFile(reviewRequiredFile);

    expect(result.success).toBe(true);
  });

  it("rejects comparison-eligible products with non-reviewed impact values", () => {
    const unreviewedComparisonFile = {
      ...validFile,
      products: [
        {
          ...validFile.products[0],
          lifecycleModules: {
            "A1-A3": {
              gwpTotal: {
                ...validImpact,
                reviewStatus: "needs_review",
              },
            },
          },
        },
      ],
    };

    const result = validateEpdDataFile(unreviewedComparisonFile);

    expect(result.success).toBe(false);
    expect(result.errors.join("\n")).toContain("comparison-eligible value must be reviewed before use");
  });

  it("finds forbidden anonymous carbon fields anywhere in the file", () => {
    const result = findForbiddenKeys({
      product: {
        carbonScore: 10,
        nested: {
          totalCarbon: 25,
        },
      },
    });

    expect(result).toEqual(["product.carbonScore", "product.nested.totalCarbon"]);
  });
});
