import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { motion, AnimatePresence } from "framer-motion";
import rough from "roughjs";
import { ChevronLeft, ChevronRight, Minus, Plus, Settings2, Pencil, Sparkles, Volume2, Loader2, X, MessageSquareText, Tag, Bot } from "lucide-react";
import { loadPdf as loadPdfFromIdb } from "@/lib/pdfStorage";
import { useAppStore } from "@/store/useAppStore";
import { log } from "@/lib/logger";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressBar } from "@/components/ui/progress-bar";
import { setPdfDoc as setPdfDocCtx, clearPdfDoc as clearPdfDocCtx, getPageText } from "@/lib/pdfContext";
import { streamLlm } from "@/lib/llmStream";
import { buildNarrationMessages, synthesizeSpeechBlob, playAudioBlob, stopSpeaking } from "@/lib/narrator";
import { saveNarration, loadNarration, deleteNarration, savePlaybackPosition, loadPlaybackPosition, type SavedNarration } from "@/lib/narrationStorage";
import MiniAudioPlayer from "@/components/MiniAudioPlayer";
import LlmModelPicker from "@/components/LlmModelPicker";

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

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${seconds}s left`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `~${m}m ${s}s left`;
}

// Kokoro synthesis is one single request (no per-chunk progress to time), so
// its ETA is based on a chars/sec throughput rate that self-calibrates from
// actual runs and persists across sessions in localStorage.
const TTS_RATE_STORAGE_KEY = "narration-tts-chars-per-sec";
const DEFAULT_TTS_CHARS_PER_SEC = 600;

function loadTtsCharsPerSec(): number {
  try {
    const raw = localStorage.getItem(TTS_RATE_STORAGE_KEY);
    const n = raw ? parseFloat(raw) : NaN;
    return isFinite(n) && n > 0 ? n : DEFAULT_TTS_CHARS_PER_SEC;
  } catch {
    return DEFAULT_TTS_CHARS_PER_SEC;
  }
}

function saveTtsCharsPerSec(rate: number): void {
  try {
    localStorage.setItem(TTS_RATE_STORAGE_KEY, String(rate));
  } catch {}
}

type ReaderProps = {};

function Reader(_props: ReaderProps) {
  const activePaperPath = useAppStore((s) => s.activePaperPath);
  const autoResumeNarration = useAppStore((s) => s.autoResumeNarration);
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
  const aiMarkers = useAppStore((s) => s.aiMarkers);
  const rightDockWidth = useAppStore((s) => s.rightDockWidth);
  const leftDockWidth = useAppStore((s) => s.leftDockWidth);
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen);
  const aiHighlightRects = useAppStore((s) => s.aiHighlightRects);
  const activePaper = useAppStore((s) =>
    s.papers.find((p) => p.filePath === s.activePaperPath) ??
    s.books.find((b) => b.filePath === s.activePaperPath),
  );
  const addTag = useAppStore((s) => s.addTag);
  const removeTag = useAppStore((s) => s.removeTag);

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
  const [narrateStatus, setNarrateStatus] = useState<"idle" | "selecting" | "extracting" | "generating" | "synthesizing" | "playing" | "error">("idle");
  const [narrateError, setNarrateError] = useState<string | null>(null);
  const [narrateStartPage, setNarrateStartPage] = useState(currentPage);
  const [narrateEndPage, setNarrateEndPage] = useState(currentPage);
  const [estimatedTokens, setEstimatedTokens] = useState<number | null>(null);
  const [narrateProgress, setNarrateProgress] = useState<{ current: number; total: number; etaSeconds?: number } | null>(null);
  const [narrateReadingPage, setNarrateReadingPage] = useState<number | null>(null);
  const [savedNarration, setSavedNarration] = useState<SavedNarration | null>(null);
  const [narrateSynthEta, setNarrateSynthEta] = useState<number | null>(null);
  const [narrateMenuOpen, setNarrateMenuOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInputText, setTagInputText] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);
  const narrateAudioRef = useRef<HTMLAudioElement | null>(null);
  const pageBoundariesRef = useRef<{ page: number; startFrac: number }[]>([]);
  const ttsRateRef = useRef<number | null>(null);
  if (ttsRateRef.current === null) ttsRateRef.current = loadTtsCharsPerSec();

  const totalPages = activePaper?.totalPages ?? 0;

  const loadPdf = useCallback(
    async (key: string) => {
      activeLoadKeyRef.current = key;
      setDocLoading(true);
      setError(null);
      setPdfDoc(null);
      clearPdfDocCtx();

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
        setPdfDocCtx(doc, doc.numPages);
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
      clearPdfDocCtx();
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

  const openRangePicker = useCallback(() => {
    if (narrateStatus === "playing" || narrateStatus === "synthesizing") {
      stopSpeaking(); setNarrateStatus("idle"); narrateAudioRef.current = null; setNarrateReadingPage(null); return;
    }
    if (narrateStatus !== "idle" && narrateStatus !== "error") return;
    setNarrateError(null);
    setNarrateStartPage(currentPage);
    setNarrateEndPage(currentPage);
    setNarrateStatus("selecting");
  }, [narrateStatus, currentPage]);

  const updateReadingPage = useCallback((audio: HTMLAudioElement): number | null => {
    const boundaries = pageBoundariesRef.current;
    if (!boundaries.length || !isFinite(audio.duration) || audio.duration === 0) return null;
    const frac = audio.currentTime / audio.duration;
    let current = boundaries[0].page;
    for (const b of boundaries) {
      if (frac >= b.startFrac) current = b.page;
      else break;
    }
    setNarrateReadingPage(current);
    return current;
  }, []);

  const wireUpAudio = useCallback((audio: HTMLAudioElement, boundaries: { page: number; startFrac: number }[]) => {
    pageBoundariesRef.current = boundaries;
    narrateAudioRef.current = audio;
    audio.onplay = () => setNarrateStatus("playing");
    audio.onended = () => {
      setNarrateStatus("idle");
      narrateAudioRef.current = null;
      setNarrateReadingPage(null);
      // Finished listening — next resume should start from the top.
      if (activePaperPath) savePlaybackPosition(activePaperPath, 0, boundaries[0]?.page ?? null).catch(() => {});
    };
    audio.onerror = () => {
      setNarrateError("Audio playback failed.");
      setNarrateStatus("error");
      narrateAudioRef.current = null;
      setNarrateReadingPage(null);
    };
    let lastSavedAt = -Infinity;
    audio.addEventListener("timeupdate", () => {
      const page = updateReadingPage(audio);
      if (!activePaperPath) return;
      const t = audio.currentTime;
      if (Math.abs(t - lastSavedAt) >= 5) {
        lastSavedAt = t;
        savePlaybackPosition(activePaperPath, t, page).catch(() => {});
      }
    });
    audio.addEventListener("pause", () => {
      if (activePaperPath && !audio.ended) {
        const page = updateReadingPage(audio);
        savePlaybackPosition(activePaperPath, audio.currentTime, page).catch(() => {});
      }
    });
  }, [updateReadingPage, activePaperPath]);

  const resumeSavedNarration = useCallback(async () => {
    if (!savedNarration || !activePaperPath) return;
    const progress = await loadPlaybackPosition(activePaperPath).catch(() => null);
    const audio = playAudioBlob(savedNarration.audioBlob, progress?.positionSeconds ?? 0);
    wireUpAudio(audio, savedNarration.pageBoundaries);
  }, [savedNarration, activePaperPath, wireUpAudio]);

  // One-shot: Home's "Continue Listening" sets autoResumeNarration before
  // navigating here so a single click there starts playback immediately,
  // instead of landing on the "Resume" button and needing a second click.
  useEffect(() => {
    if (!autoResumeNarration || !savedNarration) return;
    useAppStore.setState({ autoResumeNarration: false });
    resumeSavedNarration();
  }, [autoResumeNarration, savedNarration, resumeSavedNarration]);

  const discardSavedNarration = useCallback(async () => {
    if (!activePaperPath) return;
    setSavedNarration(null);
    await deleteNarration(activePaperPath).catch((e) => log.reader.error("narration: failed to delete saved narration", e));
  }, [activePaperPath]);

  // Reset narration playback and pick up any saved narration when switching papers.
  useEffect(() => {
    stopSpeaking();
    narrateAudioRef.current = null;
    setNarrateStatus("idle");
    setNarrateReadingPage(null);
    setSavedNarration(null);
    if (!activePaperPath) return;
    let cancelled = false;
    loadNarration(activePaperPath)
      .then((rec) => { if (!cancelled) setSavedNarration(rec); })
      .catch((e) => log.reader.error("narration: failed to load saved narration", e));
    return () => { cancelled = true; };
  }, [activePaperPath]);

  const startNarrate = useCallback(async (from: number, to: number) => {
    setNarrateError(null);
    setNarrateStatus("extracting");
    setNarrateProgress(null);
    try {
      const pages: { num: number; text: string }[] = [];
      for (let p = from; p <= to; p++) {
        const text = await getPageText(p);
        if (text.trim()) pages.push({ num: p, text });
      }
      log.reader.info("narration: extracted pages", { from, to, pageCount: pages.length });

      if (pages.length === 0) {
        setNarrateError("No text found in selected pages.");
        setNarrateStatus("error");
        return;
      }

      // Narrate one page at a time so each LLM call's input/output stays small and
      // bounded — avoids relying on num_ctx tricks to fit an entire multi-page
      // paper (and the model's own context window) into a single call.
      setNarrateStatus("generating");
      const config = {
        provider: useAppStore.getState().llmProvider,
        model: useAppStore.getState().llmModel,
        ollamaEndpoint: useAppStore.getState().ollamaEndpoint,
        opencodeEndpoint: useAppStore.getState().opencodeEndpoint,
        temperature: useAppStore.getState().llmTemperature,
        maxTokens: useAppStore.getState().llmMaxTokens,
      };

      let combinedNarration = "";
      let previousTail = "";
      const pageDurationsMs: number[] = [];
      const charBoundaries: { page: number; charStart: number }[] = [];

      let currentPageIndex = 0;
      let currentPageStart = performance.now();

      // Ticks every second so the ETA counts down live during a page's
      // generation, not just jumps at page boundaries.
      const updateEta = () => {
        const avgMs = pageDurationsMs.length > 0
          ? pageDurationsMs.reduce((a, b) => a + b, 0) / pageDurationsMs.length
          : undefined;
        const elapsedCurrent = performance.now() - currentPageStart;
        const pagesAfterCurrent = pages.length - (currentPageIndex + 1);
        const etaMs = avgMs != null
          ? Math.max(0, avgMs - elapsedCurrent) + avgMs * pagesAfterCurrent
          : undefined;
        setNarrateProgress({
          current: currentPageIndex + 1,
          total: pages.length,
          etaSeconds: etaMs != null ? Math.round(etaMs / 1000) : undefined,
        });
      };
      const tickInterval = setInterval(updateEta, 1000);

      try {
        for (let i = 0; i < pages.length; i++) {
          const { num, text } = pages[i];
          currentPageIndex = i;
          currentPageStart = performance.now();
          updateEta();

          const messages = buildNarrationMessages(
            `${activePaper?.title ?? "Research Paper"} (page ${num})`,
            text,
            previousTail,
          );
          // num_ctx only needs to cover this one page's input plus this call's own
          // output budget — not the whole paper.
          const inputCtx = Math.round(text.length / 4) + config.maxTokens;
          log.reader.info("narration: streaming LLM for page", { page: num, provider: config.provider, model: config.model, inputLen: text.length, inputCtx });

          let pageNarration = "";
          for await (const chunk of streamLlm(messages, { ...config, inputCtx })) {
            pageNarration += chunk;
          }
          pageDurationsMs.push(performance.now() - currentPageStart);
          if (!pageNarration.trim()) {
            throw new Error(`LLM returned empty response for page ${num}.`);
          }

          const separator = combinedNarration ? "\n\n" : "";
          charBoundaries.push({ page: num, charStart: combinedNarration.length + separator.length });
          combinedNarration += separator + pageNarration.trim();
          previousTail = pageNarration.trim().slice(-300);
        }
      } finally {
        clearInterval(tickInterval);
      }
      log.reader.info("narration: all pages narrated", { responseLen: combinedNarration.length });

      const totalChars = combinedNarration.length || 1;
      const pageBoundaries = charBoundaries.map((b) => ({ page: b.page, startFrac: b.charStart / totalChars }));

      setNarrateStatus("synthesizing");
      setNarrateProgress(null);
      log.reader.info("narration: sending to Kokoro TTS");

      const estimatedSynthSeconds = Math.max(1, Math.round(combinedNarration.length / (ttsRateRef.current ?? DEFAULT_TTS_CHARS_PER_SEC)));
      setNarrateSynthEta(estimatedSynthSeconds);
      const synthStart = performance.now();
      const synthInterval = setInterval(() => {
        const elapsed = (performance.now() - synthStart) / 1000;
        setNarrateSynthEta(Math.max(0, Math.round(estimatedSynthSeconds - elapsed)));
      }, 1000);

      let audioBlob: Blob;
      try {
        audioBlob = await synthesizeSpeechBlob(combinedNarration);
      } finally {
        clearInterval(synthInterval);
        setNarrateSynthEta(null);
      }

      const actualSynthSeconds = (performance.now() - synthStart) / 1000;
      const measuredRate = combinedNarration.length / actualSynthSeconds;
      const nextRate = (ttsRateRef.current ?? DEFAULT_TTS_CHARS_PER_SEC) * 0.5 + measuredRate * 0.5;
      ttsRateRef.current = nextRate;
      saveTtsCharsPerSec(nextRate);

      const audio = playAudioBlob(audioBlob);
      wireUpAudio(audio, pageBoundaries);

      if (activePaperPath) {
        saveNarration({ paperPath: activePaperPath, from, to, audioBlob, pageBoundaries, createdAt: Date.now() })
          .then(() => setSavedNarration({ paperPath: activePaperPath, from, to, audioBlob, pageBoundaries, createdAt: Date.now() }))
          .catch((e) => log.reader.error("narration: failed to save narration", e));
      }
    } catch (e: any) {
      log.reader.error("Narrate failed", e);
      setNarrateError(e?.message ?? "Narration failed.");
      setNarrateStatus("error");
      narrateAudioRef.current = null;
      setNarrateProgress(null);
      setNarrateSynthEta(null);
    }
  }, [activePaper, activePaperPath, wireUpAudio]);

  // Estimate tokens when selecting a range
  useEffect(() => {
    if (narrateStatus !== "selecting") { setEstimatedTokens(null); return; }
    let cancelled = false;
    (async () => {
      const text = await getPageText(narrateStartPage);
      if (cancelled) return;
      const avgChars = text.length || 500;
      const pageCount = narrateEndPage - narrateStartPage + 1;
      setEstimatedTokens(Math.round(avgChars * pageCount / 4));
    })();
    return () => { cancelled = true; };
  }, [narrateStatus, narrateStartPage, narrateEndPage]);

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
    if (!narrateMenuOpen) return;
    const close = () => setNarrateMenuOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [narrateMenuOpen]);

  useEffect(() => {
    if (!modelPickerOpen) return;
    const close = () => setModelPickerOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [modelPickerOpen]);

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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) return;
    e.preventDefault();
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
  const showSvg = doodleRects.length > 0 || (pinnedDoodles[pinnedKey] || []).length > 0 || (aiMarkers[pinnedKey] || []).length > 0;

  // --- Render ---

  if (!activePaperPath) {
    return (
      <div
        className="flex-1 flex items-center justify-center bg-background transition-[margin] duration-150"
        style={{
          marginRight: rightDockWidth || undefined,
          marginLeft: leftDockWidth || undefined,
        }}
      >
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
    <div
      className="flex-1 flex flex-col bg-background overflow-hidden transition-[margin] duration-150"
      style={{
        marginRight: rightDockWidth || undefined,
        marginLeft: leftDockWidth || undefined,
      }}
    >
      {/* Slim top bar */}
      <div className="h-12 flex items-center justify-between px-3 shrink-0 select-none relative">
        <div className="flex items-center gap-1 min-w-0 max-w-[40%]">
          {(activePaper?.tags || []).map((tag) => (
            <button
              key={tag}
              onClick={() => activePaper && removeTag(activePaper.id, tag)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors group/tag shrink-0"
              title="Click to remove"
            >
              {tag}
              <X className="h-2.5 w-2.5 opacity-0 group-hover/tag:opacity-100 transition-opacity" />
            </button>
          ))}
          <button
            onClick={() => { setShowTagInput(!showTagInput); setTagInputText(""); setTimeout(() => tagInputRef.current?.focus(), 50); }}
            className="p-0.5 rounded text-muted-foreground/30 hover:text-muted-foreground transition-colors shrink-0"
            title="Add tag"
          >
            <Tag className="h-3.5 w-3.5" />
          </button>
        </div>

        <span className="text-sm text-muted-foreground tabular-nums font-medium absolute left-1/2 -translate-x-1/2">
          {currentPage} / {totalPages}
        </span>

        <div className="flex items-center gap-1">
          <AnimatePresence mode="wait">
            {narrateStatus === "selecting" ? (
              <motion.div
                key="selector"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-secondary text-sm overflow-hidden whitespace-nowrap"
              >
                <button
                  onClick={() => setNarrateStatus("idle")}
                  className="p-0.5 rounded hover:bg-muted transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <span className="text-muted-foreground text-xs shrink-0">from</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={narrateStartPage}
                  onChange={(e) => setNarrateStartPage(Math.max(1, Math.min(totalPages, Number(e.target.value) || 1)))}
                  className="w-12 h-6 px-1 text-xs text-center rounded border border-border bg-background tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-muted-foreground text-xs shrink-0">to</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={narrateEndPage}
                  onChange={(e) => setNarrateEndPage(Math.max(1, Math.min(totalPages, Number(e.target.value) || 1)))}
                  className="w-12 h-6 px-1 text-xs text-center rounded border border-border bg-background tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => { setNarrateStartPage(1); setNarrateEndPage(totalPages); }}
                  className="px-2 py-0.5 text-xs rounded bg-muted hover:bg-border transition-colors shrink-0"
                >
                  entire
                </button>
                {estimatedTokens !== null && (
                  <span
                    className={`text-xs shrink-0 ${
                      estimatedTokens > 16000 ? "text-red-500"
                      : estimatedTokens > 8000 ? "text-orange-500"
                      : estimatedTokens > 4000 ? "text-yellow-500"
                      : "text-green-500"
                    }`}
                  >
                    ~{estimatedTokens.toLocaleString()}t
                  </span>
                )}
                <button
                  onClick={() => startNarrate(narrateStartPage, narrateEndPage)}
                  className="px-2 py-0.5 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600 transition-colors shrink-0"
                >
                  Generate
                </button>
              </motion.div>
            ) : narrateStatus === "playing" && narrateAudioRef.current ? (
              <motion.div
                key="player"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex items-center gap-1.5"
              >
                {narrateReadingPage !== null && (
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                    Page {narrateReadingPage}
                  </span>
                )}
                <MiniAudioPlayer
                  audio={narrateAudioRef.current}
                  onStop={() => {
                    stopSpeaking();
                    setNarrateStatus("idle");
                    narrateAudioRef.current = null;
                    setNarrateReadingPage(null);
                  }}
                />
              </motion.div>
            ) : narrateStatus === "idle" && savedNarration ? (
              <motion.div
                key="saved"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="relative"
              >
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setNarrateMenuOpen((v) => !v)}
                  title={`Saved narration (pages ${savedNarration.from}–${savedNarration.to})`}
                  className="p-1.5 rounded-lg text-indigo-500 hover:text-indigo-600 hover:bg-secondary transition-colors"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
                <AnimatePresence>
                  {narrateMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg py-1 flex flex-col z-50 whitespace-nowrap"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => { setNarrateMenuOpen(false); resumeSavedNarration(); }}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-secondary transition-colors"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        Resume {savedNarration.from}–{savedNarration.to}
                      </button>
                      <button
                        onClick={() => { setNarrateMenuOpen(false); openRangePicker(); }}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-secondary transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Narrate a different range
                      </button>
                      <button
                        onClick={() => { setNarrateMenuOpen(false); discardSavedNarration(); }}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-left text-red-500 hover:bg-secondary transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                        Discard saved narration
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div
                key="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <button
                  onClick={openRangePicker}
                  disabled={narrateStatus === "extracting" || narrateStatus === "generating" || narrateStatus === "synthesizing"}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                    narrateStatus === "error"
                      ? "text-red-500 bg-red-500/10"
                      : narrateStatus === "generating" || narrateStatus === "extracting" || narrateStatus === "synthesizing"
                        ? "text-muted-foreground bg-secondary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                  title={narrateStatus === "error" ? narrateError ?? "Error" : "Narrate"}
                >
                  {narrateStatus === "generating" || narrateStatus === "extracting" || narrateStatus === "synthesizing" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">
                    {narrateStatus === "extracting" ? "Reading..."
                    : narrateStatus === "generating" ? (
                        narrateProgress
                          ? `Narrating ${narrateProgress.current}/${narrateProgress.total}${narrateProgress.etaSeconds != null ? ` · ${formatEta(narrateProgress.etaSeconds)}` : ""}`
                          : "Narrating..."
                      )
                    : narrateStatus === "synthesizing" ? (
                        narrateSynthEta != null
                          ? (narrateSynthEta > 0 ? `Synthesizing · ${formatEta(narrateSynthEta)}` : "Almost done...")
                          : "Synthesizing..."
                      )
                    : narrateStatus === "error" ? "Retry"
                    : "Narrate"}
                  </span>
                </button>
                {narrateStatus === "error" && narrateError && (
                  <span className="text-xs text-red-500 max-w-[200px] truncate ml-1">{narrateError}</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
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

          <button
            onClick={() => useAppStore.setState({ drawingOpen: true })}
            className="p-1.5 ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Sketchpad"
          >
            <Pencil className="h-4 w-4" />
          </button>

          <button
            onClick={() => useAppStore.setState({ annotationPanelOpen: true })}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Notes"
          >
            <MessageSquareText className="h-4 w-4" />
          </button>

          <div className="relative">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setModelPickerOpen((v) => !v)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="AI model"
            >
              <Bot className="h-4 w-4" />
            </button>

            <AnimatePresence>
              {modelPickerOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-72 bg-card border border-border rounded-xl shadow-lg p-3 z-50"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <LlmModelPicker compact />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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

      {/* Inline tag input */}
      <AnimatePresence>
        {showTagInput && activePaper && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 pb-2 pt-0 overflow-hidden"
          >
            <input
              ref={tagInputRef}
              value={tagInputText}
              onChange={(e) => setTagInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tagInputText.trim()) {
                  addTag(activePaper.id, tagInputText.trim());
                  setTagInputText("");
                  setShowTagInput(false);
                }
                if (e.key === "Escape") { setShowTagInput(false); setTagInputText(""); }
              }}
              onBlur={() => { setShowTagInput(false); setTagInputText(""); }}
              placeholder="new tag..."
              className="w-full max-w-[200px] px-2 py-1 text-xs bg-background border border-border rounded-md outline-none focus:ring-1 focus:ring-ring"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reading progress */}
      {totalPages > 0 && (
        <ProgressBar value={(currentPage / totalPages) * 100} className="shrink-0 rounded-none" variant="accent" />
      )}

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto scrollbar-thin"
        onContextMenu={handleContextMenu}
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
                  {/* ponytail: persistent highlight while AI panel is open */}
                  {aiPanelOpen && aiHighlightRects.length > 0 && (
                    <div className="absolute inset-0 pointer-events-none z-[5]">
                      {aiHighlightRects.map((r, i) => (
                        <div
                          key={i}
                          className="absolute bg-yellow-300/40 mix-blend-multiply"
                          style={{
                            left: `${r.x}px`,
                            top: `${r.y}px`,
                            width: `${r.w}px`,
                            height: `${r.h}px`,
                          }}
                        />
                      ))}
                    </div>
                  )}
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
                    if (validRects.length === 0) return null;
                    const n = validRects.length;
                    const midY =
                      n % 2 === 1
                        ? (validRects[Math.floor(n / 2)].y +
                            validRects[Math.floor(n / 2)].h / 2) *
                          scale
                        : ((validRects[n / 2 - 1].y + validRects[n / 2 - 1].h / 2) * scale +
                            (validRects[n / 2].y + validRects[n / 2].h / 2) * scale) /
                          2;
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
                            top: midY - 14,
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
                            style={{ left: 36, top: midY - 16 }}
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
                                className="text-xs text-muted-foreground hover:text-red-500 transition-colors"
                              >
                                remove
                              </button>
                              <button
                                onClick={() => {
                                  updatePinnedNote(pinnedKey, d.id, editNoteText);
                                  setEditNoteId(null);
                                }}
                                className="text-xs text-foreground hover:underline"
                              >
                                done
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* ponytail: sparkle marker, click to open AiPanel scrolled to matching history entry */}
                  {(() => {
                    // Best estimate of the text column's right edge: take the widest right edge
                    // from any multi-line marker on this page (multi-line selections span full lines
                    // so their max right naturally lands at the column boundary). Fall back to the
                    // page width when no multi-line markers exist yet.
                    const multiLineRightX = (aiMarkers[pinnedKey] || []).reduce((mx, marker) => {
                      const s = marker.zoom > 0 ? zoom / marker.zoom : 1;
                      const rects = marker.rects.filter((r) => r.h > 0);
                      if (rects.length < 2) return mx;
                      const first = rects[0], last = rects[rects.length - 1];
                      if ((last.y - first.y) * s < first.h * s * 1.5) return mx; // skip single-line markers
                      return Math.max(mx, ...rects.map((r) => (r.x + r.w) * s));
                    }, 0);
                    const columnRightX = multiLineRightX > 0 ? multiLineRightX : (skeletonDimensions?.width ?? 0);
                    return (aiMarkers[pinnedKey] || []).map((m) => {
                    const scale = m.zoom > 0 ? zoom / m.zoom : 1;
                    const validRects = m.rects.filter((r) => r.h > 0);
                    if (validRects.length === 0) return null;
                    const n = validRects.length;
                    const midY =
                      n % 2 === 1
                        ? (validRects[Math.floor(n / 2)].y + validRects[Math.floor(n / 2)].h / 2) * scale
                        : ((validRects[n / 2 - 1].y + validRects[n / 2 - 1].h / 2) * scale +
                            (validRects[n / 2].y + validRects[n / 2].h / 2) * scale) / 2;
                    const selectionRightX = Math.max(...validRects.map((r) => (r.x + r.w) * scale));
                    const isSingleLine = n === 1 || (validRects[n - 1].y - validRects[0].y) * scale < validRects[0].h * scale * 1.5;
                    const rightX = isSingleLine ? Math.max(selectionRightX, columnRightX) : selectionRightX;
                    return (
                      <button
                        key={m.id}
                        title="View AI conversation"
                        onClick={(e) => {
                          e.stopPropagation();
                          const scale = m.zoom > 0 ? zoom / m.zoom : 1;
                          useAppStore.setState({
                            aiPanelOpen: true,
                            aiScrollToEntryId: m.id,
                            aiHighlightRects: m.rects.map((r) => ({
                              x: r.x * scale,
                              y: r.y * scale,
                              w: r.w * scale,
                              h: r.h * scale,
                            })),
                            aiHighlightText: m.text || "",
                            aiMode: "clarify",
                          });
                        }}
                        className="absolute z-20 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                        style={{ left: rightX + 6, top: midY - 8 }}
                      >
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                      </button>
                    );
                    });
                  })()}
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
