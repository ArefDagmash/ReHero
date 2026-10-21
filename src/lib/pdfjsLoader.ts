import type * as PdfjsLib from "pdfjs-dist";

// pdfjs-dist is ~1MB+ on its own — dynamic-imported and memoized so callers
// on the always-visible library views (thumbnails, background text index)
// don't force it into the initial bundle. Reader.tsx still imports it
// statically, but Reader itself is lazy-loaded from App.tsx.
let pdfjsPromise: Promise<typeof PdfjsLib> | null = null;

export function getPdfjs(): Promise<typeof PdfjsLib> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [pdfjsLib, workerUrl] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.mjs?url"),
      ]);
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.default;
      return pdfjsLib;
    })();
  }
  return pdfjsPromise;
}
