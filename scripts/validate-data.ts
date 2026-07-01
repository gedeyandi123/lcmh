import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateEpdDataFile } from "../src/lib/schema";

type Counts = {
  files: number;
  validFiles: number;
  invalidFiles: number;
  products: number;
  comparisonEligible: number;
  reviewRequired: number;
  groupedDeclaration: number;
  missingCoreData: number;
  notComparable: number;
  warnings: number;
  errors: number;
};

const dataDir = join(process.cwd(), "data");
const jsonFiles = readdirSync(dataDir)
  .filter((fileName) => fileName.endsWith(".json"))
  .sort();

const counts: Counts = {
  files: jsonFiles.length,
  validFiles: 0,
  invalidFiles: 0,
  products: 0,
  comparisonEligible: 0,
  reviewRequired: 0,
  groupedDeclaration: 0,
  missingCoreData: 0,
  notComparable: 0,
  warnings: 0,
  errors: 0,
};

const details: string[] = [];

for (const fileName of jsonFiles) {
  const filePath = join(dataDir, fileName);
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  const result = validateEpdDataFile(parsed);

  counts.warnings += result.warnings.length;
  counts.errors += result.errors.length;

  if (!result.success) {
    counts.invalidFiles += 1;
    details.push(`${fileName}: invalid`);
    for (const error of result.errors.slice(0, 8)) {
      details.push(`  error: ${error}`);
    }
    if (result.errors.length > 8) {
      details.push(`  error: ${result.errors.length - 8} more errors omitted`);
    }
    continue;
  }

  counts.validFiles += 1;
  counts.products += result.data.products.length;

  for (const product of result.data.products) {
    switch (product.comparisonStatus) {
      case "comparison_eligible":
        counts.comparisonEligible += 1;
        break;
      case "review_required":
        counts.reviewRequired += 1;
        break;
      case "grouped_declaration":
        counts.groupedDeclaration += 1;
        break;
      case "missing_core_data":
        counts.missingCoreData += 1;
        break;
      case "not_comparable":
        counts.notComparable += 1;
        break;
    }
  }

  if (result.warnings.length > 0) {
    details.push(`${fileName}: valid with warnings`);
    for (const warning of result.warnings.slice(0, 5)) {
      details.push(`  warning: ${warning}`);
    }
  }
}

console.log("Data validation report");
console.log(`- JSON files: ${counts.files}/20`);
console.log(`- Valid final-schema files: ${counts.validFiles}`);
console.log(`- Invalid files: ${counts.invalidFiles}`);
console.log(`- Products in valid files: ${counts.products}`);
console.log(`- Comparison eligible products: ${counts.comparisonEligible}`);
console.log(`- Review required products: ${counts.reviewRequired}`);
console.log(`- Grouped declarations: ${counts.groupedDeclaration}`);
console.log(`- Missing core data products: ${counts.missingCoreData}`);
console.log(`- Not comparable products: ${counts.notComparable}`);
console.log(`- Warnings: ${counts.warnings}`);
console.log(`- Errors: ${counts.errors}`);

if (details.length > 0) {
  console.log("");
  console.log(details.join("\n"));
}

if (counts.files !== 20 || counts.invalidFiles > 0 || counts.errors > 0) {
  process.exitCode = 1;
}