// Shared pdfjs-dist loader. Loads the library once and configures the worker.
// All PDF tabs should import getPdfjs() instead of importing pdfjs-dist directly.

let pdfjsPromise: Promise<any> | null = null;

export function getPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import("pdfjs-dist");
      lib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return lib;
    })();
  }
  return pdfjsPromise;
}
