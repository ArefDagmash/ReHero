import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { motion, AnimatePresence } from "framer-motion";
import rough from "roughjs";
import { Home, ChevronLeft, ChevronRight, Minus, Plus, Settings2 } from "lucide-react";
import { loadPdf as loadPdfFromIdb } from "@/lib/pdfStorage";
import { useAppStore } from "@/store/useAppStore";
import { log } from "@/lib/logger";
import { Skeleton } from "@/components/ui/skeleton";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

async function loadPdfBytes(key: string): Promise<Uint8Array | null> {
  if (key.startsWith("idb://")) {
    const id = key.slice(6);
    return await loadPdfFromIdb(id);
  }
  if (key.startsWith("blob:") || key.startsWith("http")) {
    try {
      const res = await fetch(key);
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      return new Uint8Array(buffer);
    } catch {
      return null;
    }
  }
  try {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    return await readFile(key);
  } catch {
    return null;
  }
}

const LOAD_TIMEOUT_MS = 30_000;

type ReaderProps = {
  onBack: () => void;
};

function Reader({ onBack }: ReaderProps) {
  const activePaperPath = useAppStore((s) => s.activePaperPath);
  const currentPage = useAppStore((s) => s.currentPage);
  const zoom = useAppStore((s) => s.zoom);
  const bgTheme = useAppStore((s) => s.bgTheme);
  const setPage = useAppStore((s) => s.setPage);
  const setZoom = useAppStore((s) => s.setZoom);
  const updatePaperLastPage = useAppStore((s) => s.updatePaperLastPage);
  const updatePaperTotalPages = useAppStore((s) => s.updatePaperTotalPages);
  const doodleColor = useAppStore((s) => s.doodleColor);
  const doodleStyle = useAppStore((s) => s.doodleStyle);
  const strokeCount = useAppStore((s) => s.strokeCount);
  const sloppiness = useAppStore((s) => s.sloppiness);
  const setBgTheme = useAppStore((s) => s.setBgTheme);
  const setDoodleColor = useAppStore((s) => s.setDoodleColor);
  const setDoodleStyle = useAppStore((s) => s.setDoodleStyle);
  const setStrokeCount = useAppStore((s) => s.setStrokeCount);
  const setSloppiness = useAppStore((s) => s.setSloppiness);
  const pinnedDoodles = useAppStore((s) => s.pinnedDoodles);
  const removePinnedDoodle = useAppStore((s) => s.removePinnedDoodle);
  const updatePinnedNote = useAppStore((s) => s.updatePinnedNote);
  const activePaper = useAppStore((s) =>
    s.papers.find((p) => p.filePath === s.activePaperPath),
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const doodleSvgRef = useRef<SVGSVGElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const activeLoadKeyRef = useRef<string | null>(null);
  const renderedKeyRef = useRef<string | null>(null);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skeletonDimensions, setSkeletonDimensions] = useState<{ width: number; height: number } | null>(null);
  const [doodleRects, setDoodleRects] = useState<{ x: number; y: number; w: number; h: number }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState("");

  const totalPages = activePaper?.totalPages ?? 0;

  const loadPdf = useCallback(
    async (key: string) => {
      activeLoadKeyRef.current = key;
      setDocLoading(true);
      setError(null);
      setPdfDoc(null);

      const timeoutId = setTimeout(() => {
        if (activeLoadKeyRef.current === key) {
          setDocLoading(false);
          setError("PDF load timed out after 30 seconds.");
        }
      }, LOAD_TIMEOUT_MS);

      try {
        const bytes = await loadPdfBytes(key);
        if (!bytes) {
          setDocLoading(false);
          setError("Could not read the file.");
          return;
        }
        if (activeLoadKeyRef.current !== key) return;

        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (activeLoadKeyRef.current !== key) {
          doc.destroy();
          return;
        }
        setPdfDoc(doc);
        updatePaperTotalPages(key, doc.numPages);
      } catch (e: any) {
        setError(`Failed to load PDF: ${e?.message ?? "Unknown error"}`);
      } finally {
        clearTimeout(timeoutId);
        if (activeLoadKeyRef.current === key) setDocLoading(false);
      }
    },
    [updatePaperTotalPages],
  );

  useEffect(() => {
    if (activePaperPath) {
      loadPdf(activePaperPath);
    } else {
      activeLoadKeyRef.current = null;
      setPdfDoc(null);
      setError(null);
      setDocLoading(false);
    }
    return () => {
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

        renderTaskRef.current = page.render({ canvasContext: ctx, viewport });
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
    if (pdfDoc) renderPage(currentPage);
  }, [zoom]);

  const handlePageEnter = useCallback(() => {
    const key = `${activePaperPath}-${currentPage}`;
    if (renderedKeyRef.current !== key) {
      renderedKeyRef.current = key;
      setDoodleRects([]);
      renderPage(currentPage);
    }
  }, [activePaperPath, currentPage, renderPage]);

  // --- Nav / Zoom ---

  const goNext = useCallback(() => {
    if (currentPage < totalPages) setPage(currentPage + 1);
  }, [currentPage, totalPages, setPage]);

  const goPrev = useCallback(() => {
    if (currentPage > 1) setPage(currentPage - 1);
  }, [currentPage, setPage]);

  const zoomIn = useCallback(() => setZoom(Math.min(zoom + 0.25, 3.0)), [zoom, setZoom]);
  const zoomOut = useCallback(() => setZoom(Math.max(zoom - 0.25, 0.5)), [zoom, setZoom]);

  useEffect(() => {
    document.documentElement.dataset.theme = bgTheme;
  }, [bgTheme]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  useEffect(() => {
    if (!settingsOpen) return;
    const close = () => setSettingsOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [settingsOpen]);

  useEffect(() => {
    if (!editNoteId) return;
    const save = () => {
      setEditNoteId((id) => {
        if (id) {
          updatePinnedNote(`${activePaperPath}-${currentPage}`, id, editNoteText);
        }
        return null;
      });
    };
    window.addEventListener("mousedown", save);
    return () => window.removeEventListener("mousedown", save);
  }, [editNoteId, editNoteText, activePaperPath, currentPage, updatePinnedNote]);

  // --- Doodle selection ---

  const updateDoodles = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) {
      setDoodleRects([]);
      return;
    }
    const rects = Array.from(selection.getRangeAt(0).getClientRects());
    const page = pageRef.current;
    if (!page) return;
    const pageRect = page.getBoundingClientRect();

    const merged: { x: number; y: number; w: number; h: number }[] = [];
    const sorted = rects
      .map((r) => ({ x: r.x - pageRect.x, y: r.y - pageRect.y, w: r.width, h: r.height }))
      .sort((a, b) => a.y - b.y || a.x - b.x);

    for (const r of sorted) {
      const last = merged[merged.length - 1];
      const rMid = r.y + r.h / 2;
      const lastMid = last ? last.y + last.h / 2 : Infinity;
      if (last && Math.abs(rMid - lastMid) < 5) {
        last.w = Math.max(last.x + last.w, r.x + r.w) - last.x;
      } else {
        merged.push({ ...r });
      }
    }
    setDoodleRects(merged);
    useAppStore.setState({ currentDoodleRects: merged });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", updateDoodles);
    return () => document.removeEventListener("selectionchange", updateDoodles);
  }, [updateDoodles]);

  useEffect(() => {
    const svg = doodleSvgRef.current;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const key = `${activePaperPath}-${currentPage}`;
    const pinned = pinnedDoodles[key] || [];
    const zoomScale = zoom;
    const allRects = [
      ...doodleRects.map((r) => ({ rect: r, seed: 0 })),
      ...pinned.flatMap((d, di) => {
        const scale = d.zoom > 0 ? zoomScale / d.zoom : 1;
        return d.rects.map((r) => ({
          rect: {
            x: r.x * scale,
            y: r.y * scale,
            w: r.w * scale,
            h: r.h * scale,
          },
          seed: 10 + di,
        }));
      }),
    ];
    if (allRects.length === 0) return;

    const slop: Record<string, { roughness: number; bowing: number }> = {
      clean: { roughness: 1.0, bowing: 0.2 },
      medium: { roughness: 1.5, bowing: 0.6 },
      sloppy: { roughness: 2.0, bowing: 1.0 },
    };
    const s = slop[sloppiness];
    const rc = rough.svg(svg);

    for (const { rect: r, seed: baseSeed } of allRects) {
      const opts = {
        stroke: doodleColor,
        strokeWidth: 2,
        roughness: s.roughness,
        bowing: s.bowing,
      };

      const drawLine = (y: number, seed: number) => {
        svg.appendChild(rc.line(r.x, y, r.x + r.w, y, { ...opts, seed }));
      };

      const drawRect = (seed: number) => {
        const pad = 2;
        svg.appendChild(
          rc.rectangle(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, {
            ...opts,
            seed,
            fill: "transparent",
            fillStyle: "solid",
          }),
        );
      };

      for (let i = 0; i < strokeCount; i++) {
        const seed = baseSeed + i;
        if (doodleStyle === "underline") {
          drawLine(r.y + r.h - 1, seed);
        } else if (doodleStyle === "strikethrough") {
          drawLine(r.y + r.h / 2, seed);
        } else {
          drawRect(seed);
        }
      }
    }
  }, [doodleRects, pinnedDoodles, activePaperPath, currentPage, zoom, skeletonDimensions, sloppiness, doodleColor, doodleStyle, strokeCount]);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) return;
    const text = selection.toString().trim();
    const rects = selection.getRangeAt(0).getClientRects();
    const firstRect = rects[0];
    useAppStore.setState({
      highlightMenuVisible: true,
      highlightText: text,
      highlightRect: {
        x: firstRect.left + firstRect.width / 2,
        y: firstRect.top,
      },
    });
  }, []);

  useEffect(() => {
    setDoodleRects([]);
  }, [activePaperPath]);

  const pinnedKey = `${activePaperPath}-${currentPage}`;
  const showSvg = doodleRects.length > 0 || (pinnedDoodles[pinnedKey] || []).length > 0;

  // --- Render ---

  if (!activePaperPath) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-40"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p className="text-sm">Open a PDF to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Slim top bar */}
      <div className="h-12 flex items-center justify-between px-3 shrink-0 select-none relative">
        <button
          onClick={onBack}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Home"
        >
          <Home className="h-7 w-7" />
        </button>

        <span className="text-sm text-muted-foreground tabular-nums font-medium">
          {currentPage} / {totalPages}
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            disabled={zoom <= 0.5}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={zoomIn}
            disabled={zoom >= 3.0}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>

          <div className="relative ml-1">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Settings2 className="h-4 w-4" />
              <span>selection</span>
            </button>

            <AnimatePresence>
              {settingsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg p-4 flex flex-col gap-4 z-50"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {/* Color */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-12">color</span>
                    <svg className="h-3 w-8" viewBox="0 0 32 4">
                      <path d="M0,2 Q4,0 8,2 Q12,4 16,2 Q20,0 24,2 Q28,4 32,2" stroke={doodleColor} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    </svg>
                    {["red", "blue", "green", "orange", "purple", "yellow"].map((c) => (
                      <button
                        key={c}
                        onClick={() => setDoodleColor(c)}
                        className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${
                          doodleColor === c ? "ring-2 ring-foreground ring-offset-1" : ""
                        }`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>

                  {/* Style */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-12">style</span>
                    <svg className="h-3 w-8" viewBox="0 0 32 8">
                      {doodleStyle === "underline" && (
                        <path d="M0,6 Q4,4 8,6 Q12,8 16,6 Q20,4 24,6 Q28,8 32,6" stroke={doodleColor} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                      )}
                      {doodleStyle === "strikethrough" && (
                        <path d="M0,4 Q4,2 8,4 Q12,6 16,4 Q20,2 24,4 Q28,6 32,4" stroke={doodleColor} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                      )}
                      {doodleStyle === "squiggly" && (
                        <rect x="1" y="1" width="30" height="6" rx="2" stroke={doodleColor} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                      )}
                    </svg>
                    {(["underline", "strikethrough", "squiggly"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setDoodleStyle(s)}
                        className={`px-2.5 py-1 rounded text-xs transition-colors ${
                          doodleStyle === s ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  {/* Strokes */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-12">strokes</span>
                    <svg className="h-3 w-8" viewBox="0 0 32 6">
                      {Array.from({ length: strokeCount }, (_, i) => (
                        <path
                          key={i}
                          d={`M0,${1.5 + i * 2} Q4,${0 + i * 2} 8,${1.5 + i * 2} Q12,${3 + i * 2} 16,${1.5 + i * 2} Q20,${0 + i * 2} 24,${1.5 + i * 2} Q28,${3 + i * 2} 32,${1.5 + i * 2}`}
                          stroke={doodleColor}
                          strokeWidth="1"
                          fill="none"
                          strokeLinecap="round"
                        />
                      ))}
                    </svg>
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        onClick={() => setStrokeCount(n)}
                        className={`px-2.5 py-1 rounded text-xs transition-colors ${
                          strokeCount === n ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {n}x
                      </button>
                    ))}
                  </div>

                  {/* Sloppiness */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-12">rough</span>
                    <svg className="h-3 w-8" viewBox="0 0 32 6">
                      <path
                        d={
                          sloppiness === "clean"
                            ? "M0,3 Q4,2 8,3 Q12,4 16,3 Q20,2 24,3 Q28,4 32,3"
                            : sloppiness === "medium"
                              ? "M0,3 Q3,1 6,4 Q9,0 12,3 Q15,5 18,2 Q21,1 24,4 Q27,2 30,3 Q32,1 32,1"
                              : "M0,3 Q2,0 5,5 Q8,1 10,4 Q13,0 16,5 Q19,2 22,0 Q25,4 28,1 Q30,5 32,2"
                        }
                        stroke={doodleColor}
                        strokeWidth="1.2"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>
                    {(["clean", "medium", "sloppy"] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => setSloppiness(l)}
                        className={`px-2.5 py-1 rounded text-xs transition-colors ${
                          sloppiness === l ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>

                  {/* Background */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-12">bg</span>
                    <div
                      className="w-8 h-3 rounded border border-border"
                      style={{
                        background:
                          bgTheme === "dark"
                            ? "hsl(0 0% 3.9%)"
                            : bgTheme === "sepia"
                              ? "hsl(40 30% 92%)"
                              : "hsl(0 0% 96%)",
                      }}
                    />
                    {(["light", "sepia", "dark"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setBgTheme(t)}
                        className={`px-2.5 py-1 rounded text-xs transition-colors ${
                          bgTheme === t ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto scrollbar-thin"
        onMouseUp={handleMouseUp}
      >
        {error && !pdfDoc && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {docLoading && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Skeleton className="rounded-lg" style={{ width: "450px", height: "600px" }} />
              <p className="text-xs text-muted-foreground">Loading...</p>
            </div>
          </div>
        )}

        {pdfDoc && (
          <div className="flex items-center justify-center min-h-full p-6 gap-3">
            <button
              onClick={goPrev}
              disabled={currentPage <= 1}
              className="shrink-0 p-2 rounded-full bg-card/60 hover:bg-card border border-border/50 hover:border-border shadow-sm hover:shadow-md hover:scale-110 backdrop-blur-sm transition-all disabled:opacity-20 disabled:cursor-default disabled:hover:scale-100 disabled:hover:shadow-sm"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-6 w-6 text-muted-foreground" />
            </button>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${activePaperPath}-${currentPage}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: pageLoading ? 0 : 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                onAnimationStart={handlePageEnter}
                className="relative"
                style={{
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
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
                    <Skeleton className="w-full h-full rounded-none bg-white" />
                  </div>
                )}
                <div
                  ref={pageRef}
                  className="relative inline-block bg-white"
                  style={{
                    width: `${skeletonDimensions?.width || 600}px`,
                    height: `${skeletonDimensions?.height || 800}px`,
                  }}
                >
                  <canvas ref={canvasRef} className="block" />
                  <div ref={textLayerRef} className="pdf-text-layer" />
                  {showSvg && (
                    <svg
                      ref={doodleSvgRef}
                      className="absolute inset-0 pointer-events-none"
                      style={{ overflow: "visible" }}
                      width={skeletonDimensions?.width ?? 600}
                      height={skeletonDimensions?.height ?? 800}
                    />
                  )}
                  {/* Pinned markers */}
                  {(pinnedDoodles[pinnedKey] || []).map((d) => {
                    const scale = d.zoom > 0 ? zoom / d.zoom : 1;
                    const validRects = d.rects.filter((r) => r.h > 0);
                    const anchor = validRects[validRects.length - 1];
                    if (!anchor) return null;
                    const fy = anchor.y * scale;
                    const fh = anchor.h * scale;
                    const hasNote = d.note.trim().length > 0;
                    return (
                      <div key={d.id}>
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => {
                            if (editNoteId === d.id) {
                              updatePinnedNote(pinnedKey, d.id, editNoteText);
                              setEditNoteId(null);
                            } else {
                              setEditNoteId(d.id);
                              setEditNoteText(d.note);
                            }
                          }}
                          className="absolute z-20 transition-all hover:scale-110"
                          style={{
                            left: 4,
                            top: fy + fh - 15,
                            width: 28,
                            height: 28,
                          }}
                          title={hasNote ? d.note : "Unpin"}
                        >
                          <img
                            src="/pin.svg"
                            className={`w-full h-full ${hasNote ? "opacity-100" : "opacity-50"}`}
                            alt="Pinned"
                          />
                        </button>
                        {editNoteId === d.id && (
                          <div
                            className="absolute z-30 bg-popover border border-border rounded-lg shadow-lg p-2 w-48"
                            style={{ left: 36, top: fy + fh - 18 }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <textarea
                              value={editNoteText}
                              onChange={(e) => setEditNoteText(e.target.value)}
                              placeholder="add note..."
                              className="w-full min-h-[60px] text-xs resize-none bg-transparent outline-none placeholder:text-muted-foreground/50"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  updatePinnedNote(pinnedKey, d.id, editNoteText);
                                  setEditNoteId(null);
                                }
                              }}
                            />
                            <div className="flex justify-between items-center mt-1">
                              <button
                                onClick={() => removePinnedDoodle(pinnedKey, d.id)}
                                className="text-[10px] text-muted-foreground hover:text-red-500 transition-colors"
                              >
                                remove
                              </button>
                              <button
                                onClick={() => {
                                  updatePinnedNote(pinnedKey, d.id, editNoteText);
                                  setEditNoteId(null);
                                }}
                                className="text-[10px] text-foreground hover:underline"
                              >
                                done
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>

            <button
              onClick={goNext}
              disabled={currentPage >= totalPages}
              className="shrink-0 p-2 rounded-full bg-card/60 hover:bg-card border border-border/50 hover:border-border shadow-sm hover:shadow-md hover:scale-110 backdrop-blur-sm transition-all disabled:opacity-20 disabled:cursor-default disabled:hover:scale-100 disabled:hover:shadow-sm"
              aria-label="Next page"
            >
              <ChevronRight className="h-6 w-6 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Reader;
