import { Suspense } from "react";
import { loadEpds } from "../lib/data";
import { partition, summarizeCorpus, toComparatorRow, modulesPresentInCorpus } from "../lib/comparability";
import { DataQualityBanner } from "../components/DataQualityBanner";
import { ComparatorView } from "../components/ComparatorView";

export default function Home() {
  const corpus = loadEpds();
  const rows = corpus.products.map(toComparatorRow);
  const sections = partition(rows);
  const summary = summarizeCorpus(rows, corpus.files.length, corpus.warnings.length);
  const modules = modulesPresentInCorpus(corpus.products.map((p) => p.product));

  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Concrete EPD Comparator</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <ComparatorView
          comparable={sections.comparable}
          review={sections.review}
          excluded={sections.excluded}
          modules={modules}
          banner={<DataQualityBanner summary={summary} />}
        />
      </Suspense>
    </main>
  );
}
