import { z } from "zod";

export const lifecycleModuleValues = [
  "A1",
  "A2",
  "A3",
  "A1-A3",
  "A4",
  "A5",
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
  "B6",
  "B7",
  "C1",
  "C2",
  "C3",
  "C4",
  "D",
] as const;

export const dataStatusValues = [
  "declared",
  "not_declared",
  "missing",
  "not_applicable",
] as const;

export const reviewStatusValues = ["unreviewed", "reviewed", "needs_review"] as const;

export const extractionMethodValues = [
  "manual",
  "pdf_text_manual_verified",
  "pdf_table_manual_verified",
  "ai_assisted_manual_verified",
] as const;

export const comparisonStatusValues = [
  "comparison_eligible",
  "review_required",
  "grouped_declaration",
  "missing_core_data",
  "not_comparable",
] as const;

const nullableTextSchema = z.string().min(1).nullable();

export const lifecycleModuleSchema = z.enum(lifecycleModuleValues);
export const dataStatusSchema = z.enum(dataStatusValues);
export const reviewStatusSchema = z.enum(reviewStatusValues);
export const extractionMethodSchema = z.enum(extractionMethodValues);
export const comparisonStatusSchema = z.enum(comparisonStatusValues);

export const provenanceSchema = z
  .object({
    pdfFile: z.string().min(1),
    page: z.number().int().positive().nullable(),
    section: nullableTextSchema,
    tableLabel: nullableTextSchema,
    rowLabel: nullableTextSchema,
    columnLabel: nullableTextSchema,
    sourceLabel: nullableTextSchema.optional(),
    rawText: z.string().min(1),
    extractionMethod: extractionMethodSchema,
  })
  .strict();

export const sourcedStringSchema = z
  .object({
    value: z.string().min(1).nullable(),
    unit: nullableTextSchema.optional(),
    status: dataStatusSchema.optional(),
    provenance: provenanceSchema.nullable(),
    reviewStatus: reviewStatusSchema,
    reviewNote: z.string().min(1).optional(),
  })
  .strict();

export const sourcedNumberSchema = z
  .object({
    value: z.number().nullable(),
    unit: nullableTextSchema.optional(),
    status: dataStatusSchema.optional(),
    provenance: provenanceSchema.nullable(),
    reviewStatus: reviewStatusSchema,
    reviewNote: z.string().min(1).optional(),
  })
  .strict();

export const lifecycleImpactSchema = z
  .object({
    indicator: z.literal("gwp_total"),
    sourceLabel: z.string().min(1),
    module: lifecycleModuleSchema,
    value: z.number().nullable(),
    rawValue: z.string().min(1).nullable(),
    unit: nullableTextSchema,
    status: dataStatusSchema,
    provenance: provenanceSchema,
    extractionConfidence: z.enum(["high", "medium", "low"]),
    reviewStatus: reviewStatusSchema,
    reviewNote: z.string().min(1).optional(),
  })
  .strict();

export const lifecycleModuleImpactSchema = z
  .object({
    gwpTotal: lifecycleImpactSchema,
  })
  .strict();

const lifecycleModulesShape = Object.fromEntries(
  lifecycleModuleValues.map((module) => [module, lifecycleModuleImpactSchema.optional()]),
) as Record<(typeof lifecycleModuleValues)[number], z.ZodOptional<typeof lifecycleModuleImpactSchema>>;

export const lifecycleModulesSchema = z.object(lifecycleModulesShape).partial().strict();

export const concreteProductSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    manufacturer: nullableTextSchema,
    declaredUnit: sourcedStringSchema,
    declaredUnitMassKg: sourcedNumberSchema.optional(),
    compressiveStrength: sourcedNumberSchema,
    manufacturingLocation: sourcedStringSchema,
    comparisonStatus: comparisonStatusSchema,
    comparisonStatusReason: z.string().min(1),
    lifecycleModules: lifecycleModulesSchema,
    reviewNotes: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const epdDataFileSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    extractionVersion: z.string().min(1),
    sourcePdf: z
      .object({
        fileName: z.string().min(1),
        pageCount: z.number().int().positive(),
        textCharCount: z.number().int().nonnegative().optional(),
        family: nullableTextSchema,
      })
      .strict(),
    epd: z
      .object({
        declarationNumber: nullableTextSchema,
        programOperator: nullableTextSchema,
        publisher: nullableTextSchema,
        validUntil: nullableTextSchema,
      })
      .strict(),
    products: z.array(concreteProductSchema).min(1),
    reviewNotes: z.array(z.string().min(1)),
  })
  .strict();

export type LifecycleModule = z.infer<typeof lifecycleModuleSchema>;
export type DataStatus = z.infer<typeof dataStatusSchema>;
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
export type ExtractionMethod = z.infer<typeof extractionMethodSchema>;
export type ComparisonStatus = z.infer<typeof comparisonStatusSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type LifecycleImpact = z.infer<typeof lifecycleImpactSchema>;
export type LifecycleModuleImpact = z.infer<typeof lifecycleModuleImpactSchema>;
export type ConcreteProduct = z.infer<typeof concreteProductSchema>;
export type EpdDataFile = z.infer<typeof epdDataFileSchema>;

const forbiddenCarbonKeys = new Set([
  "carbonScore",
  "lifecycleScore",
  "totalCarbon",
  "lifecycleTotal",
  "anonymousTotalCarbon",
]);

export type ValidationResult<T> =
  | { success: true; data: T; errors: string[]; warnings: string[] }
  | { success: false; errors: string[]; warnings: string[] };

export function findForbiddenKeys(value: unknown, path: string[] = []): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenKeys(item, [...path, String(index)]));
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const currentPath = [...path, key];
    const matches = forbiddenCarbonKeys.has(key) ? [currentPath.join(".")] : [];
    return [...matches, ...findForbiddenKeys(child, currentPath)];
  });
}

export function validateLifecycleImpactRules(impact: unknown): string[] {
  const parsed = lifecycleImpactSchema.safeParse(impact);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => formatIssue(issue));
  }

  const value = parsed.data;
  const errors: string[] = [];

  if (value.status === "declared" && typeof value.value !== "number") {
    errors.push("declared impact must have numeric value");
  }

  if (value.status !== "declared" && value.value !== null) {
    errors.push(`${value.status} impact must have value null`);
  }

  if (!value.provenance.rawText.trim()) {
    errors.push("carbon figure provenance must include raw source context");
  }

  if (!value.provenance.pdfFile.trim()) {
    errors.push("carbon figure provenance must include source PDF filename");
  }


  return errors;
}

export function validateEpdDataFile(value: unknown): ValidationResult<EpdDataFile> {
  const forbidden = findForbiddenKeys(value).map((key) => `forbidden anonymous carbon field: ${key}`);
  const parsed = epdDataFileSchema.safeParse(value);
  const schemaErrors = parsed.success ? [] : parsed.error.issues.map((issue) => formatIssue(issue));
  const lifecycleErrors = parsed.success ? collectLifecycleErrors(parsed.data) : [];
  const warnings = parsed.success ? collectWarnings(parsed.data) : [];
  const errors = [...forbidden, ...schemaErrors, ...lifecycleErrors];

  if (errors.length > 0 || !parsed.success) {
    return { success: false, errors, warnings };
  }

  return { success: true, data: parsed.data, errors: [], warnings };
}

function collectLifecycleErrors(file: EpdDataFile): string[] {
  const errors: string[] = [];

  for (const product of file.products) {
    for (const [module, impact] of Object.entries(product.lifecycleModules)) {
      if (!impact) {
        continue;
      }

      const ruleErrors = validateLifecycleImpactRules(impact.gwpTotal);
      if (product.comparisonStatus === "comparison_eligible" && impact.gwpTotal.reviewStatus !== "reviewed") {
        ruleErrors.push("comparison-eligible value must be reviewed before use");
      }
      for (const error of ruleErrors) {
        errors.push(`${product.id}.${module}.gwpTotal: ${error}`);
      }
    }
  }

  return errors;
}

function collectWarnings(file: EpdDataFile): string[] {
  const warnings: string[] = [];

  for (const product of file.products) {
    if (product.compressiveStrength.value === null) {
      warnings.push(`${product.id}: compressive strength is unknown`);
    }

    if (product.manufacturingLocation.value === null) {
      warnings.push(`${product.id}: manufacturing location is unknown`);
    }

    if (product.comparisonStatus !== "comparison_eligible") {
      warnings.push(`${product.id}: product status is ${product.comparisonStatus}`);
    }

    const modules = Object.keys(product.lifecycleModules);
    for (const expectedModule of ["A1-A3", "A4", "A5", "C1", "C2", "C3", "C4", "D"]) {
      if (!modules.includes(expectedModule)) {
        warnings.push(`${product.id}: lifecycle module ${expectedModule} is not present`);
      }
    }
  }

  return warnings;
}

function formatIssue(issue: z.ZodIssue): string {
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}
