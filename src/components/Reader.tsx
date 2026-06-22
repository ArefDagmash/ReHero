import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { log } from "@/lib/logger";
import { Skeleton } from "@/components/ui/skeleton";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
log.pdf.debug("PDF.js worker configured", { workerSrc: pdfjsWorker });

async function loadPdfBytes(key: string): Promise<Uint8Array | null> {
  log.pdf.info("Loading PDF bytes", { key: key.slice(0, 60) });

  if (key.startsWith("blob:") || key.startsWith("http")) {
    log.pdf.debug("Detected URL, using fetch");
    try {
      const res = await fetch(key);
      if (!res.ok) {
        log.pdf.warn("Fetch returned non-OK status", { status: res.status });
        return null;
      }
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      log.pdf.info("Fetched PDF bytes", {
        size: `${(bytes.length / 1024 / 1024).toFixed(2)}MB`,
        type: key.startsWith("blob:") ? "blob" : "http",
      });
      return bytes;
    } catch (e) {
      log.pdf.error("Fetch failed", e);
      return null;
    }
  }

  log.pdf.debug("Detected filesystem path, trying Tauri readFile");
  try {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(key);
    log.pdf.info("Read PDF via Tauri FS", {
      size: `${(bytes.length / 1024 / 1024).toFixed(2)}MB`,
    });
    return bytes;
  } catch (e) {
    log.pdf.error("Tauri readFile failed", e);
    return null;
  }
}

const LOAD_TIMEOUT_MS = 30_000;

function Reader() {
  const activePaperPath = useAppStore((s) => s.activePaperPath);
  const currentPage = useAppStore((s) => s.currentPage);
  const zoom = useAppStore((s) => s.zoom);
  const updatePaperLastPage = useAppStore((s) => s.updatePaperLastPage);
  const updatePaperTotalPages = useAppStore((s) => s.updatePaperTotalPages);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skeletonDimensions, setSkeletonDimensions] = useState<{ width: number; height: number } | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const activeLoadKeyRef = useRef<string | null>(null);

  const loadPdf = useCallback(
    async (key: string) => {
      activeLoadKeyRef.current = key;

      log.reader.info("loadPdf started", { key: key.slice(0, 60) });
      setDocLoading(true);
      setError(null);
      setPdfDoc(null);

      const timeoutId = setTimeout(() => {
        if (activeLoadKeyRef.current === key) {
          log.reader.warn("PDF load timed out", { key: key.slice(0, 60) });
          setDocLoading(false);
          setError("PDF load timed out after 30 seconds. The file may be too large or corrupted.");
        }
      }, LOAD_TIMEOUT_MS);

      try {
        const bytes = await loadPdfBytes(key);
        if (!bytes) {
          log.reader.warn("loadPdfBytes returned null");
          setDocLoading(false);
          setError("Could not read the file. It may have been moved or deleted.");
          return;
        }

        if (activeLoadKeyRef.current !== key) {
          log.reader.debug("Stale load, active key changed");
          return;
        }

        log.reader.info("Parsing PDF document", { byteLength: bytes.length });
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        log.reader.info("PDF document loaded", { numPages: doc.numPages });

        if (activeLoadKeyRef.current !== key) {
          log.reader.debug("Stale load after doc parsed, discarding");
          doc.destroy();
          return;
        }

        setPdfDoc(doc);
        updatePaperTotalPages(key, doc.numPages);
      } catch (e: any) {
        log.reader.error("loadPdf failed", {
          message: e?.message ?? String(e),
          name: e?.name ?? "unknown",
        });
        setError(`Failed to load PDF: ${e?.message ?? "Unknown error"}`);
      } finally {
        clearTimeout(timeoutId);
        if (activeLoadKeyRef.current === key) {
          setDocLoading(false);
        }
      }
    },
    [updatePaperTotalPages],
  );

  useEffect(() => {
    if (activePaperPath) {
      loadPdf(activePaperPath);
    } else {
      log.reader.debug("activePaperPath is null, clearing state");
      activeLoadKeyRef.current = null;
      setPdfDoc(null);
      setError(null);
      setDocLoading(false);
    }
    return () => {
      log.reader.debug("Cancelling previous render task");
      renderTaskRef.current?.cancel();
    };
  }, [activePaperPath, loadPdf]);

  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current || !textLayerRef.current) return;

      renderTaskRef.current?.cancel();
      setPageLoading(true);

      try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        const textLayerDiv = textLayerRef.current;

        const pixelRatio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: zoom });
        const cssW = viewport.width;
        const cssH = viewport.height;

        canvas.width = Math.round(cssW * pixelRatio);
        canvas.height = Math.round(cssH * pixelRatio);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        const ctx = canvas.getContext("2d")!;
        ctx.scale(pixelRatio, pixelRatio);
        ctx.clearRect(0, 0, cssW, cssH);

        renderTaskRef.current = page.render({
          canvasContext: ctx,
          viewport,
        });
        await renderTaskRef.current.promise;

        textLayerDiv.innerHTML = "";
        textLayerDiv.style.position = "absolute";
        textLayerDiv.style.top = "0";
        textLayerDiv.style.left = "0";
        textLayerDiv.style.width = `${cssW}px`;
        textLayerDiv.style.height = `${cssH}px`;
        textLayerDiv.style.setProperty("--scale-factor", String(zoom));

        const textContent = await page.getTextContent();
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        });
        await textLayer.render();

        setSkeletonDimensions({ width: cssW, height: cssH });

        if (activePaperPath) {
          updatePaperLastPage(activePaperPath, pageNum);
        }
      } catch (e) {
        if ((e as Error)?.name !== "RenderingCancelledException") {
          log.reader.error("renderPage failed", e);
        }
      }

      setPageLoading(false);
    },
    [pdfDoc, zoom, activePaperPath, updatePaperLastPage],
  );

  useEffect(() => {
    renderPage(currentPage);
  }, [currentPage, zoom, renderPage]);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      const text = selection.toString().trim();
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      useAppStore.setState({
        highlightMenuVisible: true,
        highlightText: text,
        highlightRect: {
          x: rect.left + rect.width / 2,
          y: rect.top,
        },
      });
    }
  }, []);

  if (!activePaperPath) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p>Open a PDF to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-background"
      onMouseUp={handleMouseUp}
    >
      {error && !pdfDoc && (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-destructive text-center max-w-sm">
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {docLoading && (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="rounded-lg" style={{ width: "450px", height: "600px" }} />
            <p className="text-sm text-muted-foreground">Loading document...</p>
          </div>
        </div>
      )}

      {pdfDoc && (
        <div className="flex items-center justify-center min-h-full p-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activePaperPath}-${currentPage}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="relative"
              style={{
                boxShadow:
                  "0 4px 6px -1px rgba(0,0,0,0.3), 0 2px 4px -2px rgba(0,0,0,0.3)",
              }}
            >
              {pageLoading && skeletonDimensions && (
                <div
                  className="absolute inset-0 z-10 rounded-none"
                  style={{
                    width: `${skeletonDimensions.width}px`,
                    height: `${skeletonDimensions.height}px`,
                  }}
                >
                  <Skeleton className="w-full h-full rounded-none" />
                </div>
              )}
              <div
                className="relative inline-block"
                style={{
                  width: `${skeletonDimensions?.width || 600}px`,
                  height: `${skeletonDimensions?.height || 800}px`,
                }}
              >
                <canvas ref={canvasRef} className="block" />
                <div ref={textLayerRef} className="pdf-text-layer" />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default Reader;
