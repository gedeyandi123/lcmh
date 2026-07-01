import "server-only";
import { cache } from "react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateEpdDataFile, type EpdDataFile, type ConcreteProduct } from "./schema";

export class DataValidationError extends Error {
  constructor(public failures: { file: string; errors: string[] }[]) {
    super(`Invalid EPD data in ${failures.length} file(s): ${failures.map((f) => f.file).join(", ")}`);
    this.name = "DataValidationError";
  }
}

export interface LoadedProduct {
  key: string;
  fileName: string;
  product: ConcreteProduct;
}

export interface LoadedCorpus {
  files: EpdDataFile[];
  products: LoadedProduct[];
  warnings: string[];
}

export function loadCorpusFrom(dir: string): LoadedCorpus {
  const jsonFiles = readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
  const failures: { file: string; errors: string[] }[] = [];
  const files: EpdDataFile[] = [];
  const products: LoadedProduct[] = [];
  const warnings: string[] = [];
  const seenKeys = new Set<string>();

  for (const fileName of jsonFiles) {
    const parsed = JSON.parse(readFileSync(join(dir, fileName), "utf8")) as unknown;
    const result = validateEpdDataFile(parsed);
    if (!result.success) {
      failures.push({ file: fileName, errors: result.errors });
      continue;
    }
    files.push(result.data);
    warnings.push(...result.warnings);
    for (const product of result.data.products) {
      const key = `${result.data.sourcePdf.fileName}::${product.id}`;
      if (seenKeys.has(key)) {
        throw new Error(`Duplicate product key: ${key}`);
      }
      seenKeys.add(key);
      products.push({ key, fileName: result.data.sourcePdf.fileName, product });
    }
  }

  if (failures.length > 0) {
    throw new DataValidationError(failures);
  }
  return { files, products, warnings };
}

const DATA_DIR = join(process.cwd(), "data");
export const loadEpds = cache((): LoadedCorpus => loadCorpusFrom(DATA_DIR));
