import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadCorpusFrom, DataValidationError } from "../src/lib/data.js";

const fx = (name: string) => join(process.cwd(), "tests", "fixtures", name);

describe("loadCorpusFrom", () => {
  it("loads a valid directory and assigns compound keys", () => {
    const corpus = loadCorpusFrom(fx("good"));
    expect(corpus.products).toHaveLength(1);
    expect(corpus.products[0].key).toBe("sample.pdf::sample-product");
    expect(corpus.files).toHaveLength(1);
  });

  it("throws DataValidationError naming the bad file", () => {
    expect(() => loadCorpusFrom(fx("bad"))).toThrow(DataValidationError);
    try {
      loadCorpusFrom(fx("bad"));
    } catch (e) {
      const err = e as DataValidationError;
      expect(err.failures[0].file).toBe("one.json");
      expect(err.failures[0].errors.length).toBeGreaterThan(0);
    }
  });

  it("throws on duplicate compound key", () => {
    expect(() => loadCorpusFrom(fx("dupe"))).toThrow(/duplicate/i);
  });
});
