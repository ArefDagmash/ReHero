import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, GripHorizontal, Loader2, CornerDownRight, ArrowUp, Move, Trash2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useDragMove, useDragResize } from "@/lib/useDragMove";
import { getPageText } from "@/lib/pdfContext";
import { streamLlm } from "@/lib/llmStream";
import type { ChatMessage, StoredEntry } from "@/types";
import { getModeIcon } from "@/components/HighlightMenu";

function renderMarkdown(text: string): string {
  if (!text) return "";
  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const codeBlocks: string[] = [];
  let html = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_: string, lang: string, code: string) => {
    const label = lang || "code";
    const pushBtn = lang === "mermaid" || lang === "mmd"
      ? `<button class="push-sketch-btn" data-code="${encodeURIComponent(code.trim())}">Sketch</button>`
      : "";
    codeBlocks.push(`<div class="pre-header"><span>${label}</span><span class="flex items-center gap-2">${pushBtn}<button class="copy-btn" data-code="${encodeURIComponent(code.trim())}">Copy</button></span></div><pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `%%CODEBLOCK${codeBlocks.length - 1}%%`;
  });
  html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/%%CODEBLOCK(\d+)%%/g, (_, i) => codeBlocks[+i]);
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\n/g, "<br>");
  return html;
}

function uid() { return Math.random().toString(36).slice(2, 9); }

const MODE_PROMPTS: Record<string, { title: string; system: (title: string) => string; ask: string }> = {
  simplify: { title: "Simplify", system: (t) => `You are a research assistant. The user is reading "${t}" and wants a difficult passage simplified. Rewrite it in plain, simple language. Be concise — 1 to 3 sentences.`, ask: "Simplify this text so it's easier to understand." },
  clarify: { title: "Clarify", system: (t) => `You are a research assistant. The user is reading "${t}" and needs help understanding a highlighted passage. Explain what it means in simple, clear terms. Be concise — 1 to 3 sentences.`, ask: "Explain what this highlighted text means." },
  example: { title: "Example", system: (t) => `You are a research assistant. The user is reading "${t}" and wants a concrete example of the concept described in a highlighted passage. Give a real-world example. Be concise — 1 to 3 sentences.`, ask: "Give a concrete example of what this text describes." },
  recap: { title: "Recap", system: (t) => `You are a research assistant. The user is reading "${t}" and wants a brief recap of a highlighted passage. Summarize the key point in one short sentence.`, ask: "Summarize this in one sentence." },
  graph: { title: "Graph", system: (t) => `You are a research assistant. The user is reading "${t}" and wants a diagram of the concept described in a highlighted passage. Generate Mermaid.js diagram code. Only emit the mermaid code block — no explanation.`, ask: "Create a Mermaid.js diagram for this concept." },
  custom: { title: "Custom", system: (t) => `You are a research assistant. The user is reading "${t}". Answer their question about the highlighted passage. Be concise and helpful.`, ask: "" },
};

type ThreadEntry = {
  id: string;
  question: string;
  answer: string;
  status: "idle" | "loading" | "done" | "error";
  error?: string;
  sourceHighlight?: string;
};

// ponytail: compute arrow endpoints dynamically based on relative window positions
function computeArrowEndpoints(
  sourceRect: { left: number; top: number; right: number; bottom: number; width: number; height: number },
  targetRect: { left: number; top: number; right: number; bottom: number; width: number; height: number },
) {
  const scx = sourceRect.left + sourceRect.width / 2;
  const scy = sourceRect.top + sourceRect.height / 2;
  const tcx = targetRect.left + targetRect.width / 2;
  const tcy = targetRect.top + targetRect.height / 2;
  const dx = tcx - scx;
  const dy = tcy - scy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal-dominant: connect side edges
    if (dx > 0) {
      // Target is to the right
      return {
        from: { x: sourceRect.right, y: scy },
        to: { x: targetRect.left, y: tcy },
      };
    } else {
      // Target is to the left
      return {
        from: { x: sourceRect.left, y: scy },
        to: { x: targetRect.right, y: tcy },
      };
    }
  } else {
    // Vertical-dominant: connect top/bottom edges
    if (dy > 0) {
      // Target is below
      return {
        from: { x: scx, y: sourceRect.bottom },
        to: { x: tcx, y: targetRect.top },
      };
    } else {
      // Target is above
      return {
        from: { x: scx, y: sourceRect.top },
        to: { x: tcx, y: targetRect.bottom },
      };
    }
  }
}

function Arrow({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const sx = from.x;
  const sy = from.y;
  const ex = to.x;
  const ey = to.y;
  const dx = Math.abs(ex - sx);
  const dy = Math.abs(ey - sy);

  let d: string;
  let angle: number;
  if (dx >= dy) {
    // Horizontal-first L-shape
    const midX = sx + (ex - sx) * 0.5;
    d = `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ey} L ${ex} ${ey}`;
    angle = Math.atan2(ey - sy, ex - midX);
  } else {
    // Vertical-first L-shape
    const midY = sy + (ey - sy) * 0.5;
    d = `M ${sx} ${sy} L ${sx} ${midY} L ${ex} ${midY} L ${ex} ${ey}`;
    angle = Math.atan2(ey - midY, ex - sx);
  }

  const ah = 6;
  const p1x = ex - ah * Math.cos(angle - 0.5);
  const p1y = ey - ah * Math.sin(angle - 0.5);
  const p2x = ex - ah * Math.cos(angle + 0.5);
  const p2y = ey - ah * Math.sin(angle + 0.5);
  return (
    <g>
      <path d={d} fill="none" stroke="#6366f1" strokeWidth={3} strokeLinejoin="round" />
      <polygon points={`${ex},${ey} ${p1x},${p1y} ${p2x},${p2y}`} fill="#6366f1" />
    </g>
  );
}

function ThreadEntryBlock({
  entry,
  index,
  onAnswerSelect,
  entryRef,
}: {
  entry: ThreadEntry;
  index: number;
  onAnswerSelect: (entryId: string, selectedText: string) => void;
  entryRef: (el: HTMLDivElement | null) => void;
}) {
  const answerRef = useRef<HTMLDivElement>(null);
  const [showFollowBtn, setShowFollowBtn] = useState(false);
  const [followPos, setFollowPos] = useState({ x: 0, y: 0 });

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.toString().trim().length === 0) { setShowFollowBtn(false); return; }
    const text = sel.toString().trim();
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setFollowPos({ x: rect.left + rect.width / 2, y: rect.bottom + 4 });
    setShowFollowBtn(true);
    if (answerRef.current) (answerRef.current as any).__selected = text;
  }, []);

  const handleFollowClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const text = (answerRef.current as any)?.__selected || "";
    if (!text) return;
    setShowFollowBtn(false);
    window.getSelection()?.removeAllRanges();
    onAnswerSelect(entry.id, text);
  }, [entry.id, onAnswerSelect]);

  const htmlContent = useMemo(() => renderMarkdown(entry.answer), [entry.answer]);

  return (
    <div ref={entryRef} className="relative pl-4" data-entry-id={entry.id}>
      {index > 0 && <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />}
      <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-card border-2 border-border flex items-center justify-center z-[1]">
        <div className="w-1 h-1 rounded-full bg-muted-foreground" />
      </div>
      <div className="pb-4">
        <div className="flex items-start gap-1.5 mb-1">
          {entry.sourceHighlight && <CornerDownRight className="h-3 w-3 text-muted-foreground/60 mt-0.5 shrink-0" />}
          <p className={`text-xs ${entry.sourceHighlight ? "text-muted-foreground" : "text-muted-foreground/70 font-medium"}`}>
            {entry.sourceHighlight ? <><span className="italic">"{entry.sourceHighlight}"</span><span className="mx-1">—</span>{entry.question}</> : entry.question}
          </p>
        </div>
        {entry.status === "loading" && !entry.answer ? (
          <div className="flex items-center gap-2 py-2"><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground italic">Thinking...</span></div>
        ) : entry.status === "error" ? (
          <p className="text-xs text-red-500">{entry.error || "Error"}</p>
        ) : (
          <div ref={answerRef} className="text-sm text-foreground leading-relaxed md-content cursor-text select-text" onMouseUp={handleMouseUp} dangerouslySetInnerHTML={{ __html: htmlContent }} />
        )}
        {showFollowBtn && (
          <button
            onClick={handleFollowClick}
            className="fixed z-[100] flex items-center gap-1 px-2 py-1 rounded-md bg-popover border border-border shadow-md text-xs text-foreground hover:bg-secondary transition-colors"
            style={{ left: followPos.x - 40, top: followPos.y }}
          >
            <ArrowUp className="h-3 w-3" /> Branch
          </button>
        )}
      </div>
    </div>
  );
}

function FollowUpWindow({
  sourceHighlight,
  initialPos,
  onClose,
  streamFollowUp,
}: {
  sourceHighlight: string;
  initialPos: { x: number; y: number };
  onClose: () => void;
  streamFollowUp: (
    draft: string,
    onStatus: (s: ThreadEntry["status"], err?: string) => void,
    onAnswer: (a: string) => void,
  ) => void;
}) {
  const [pos, setPos] = useState(initialPos);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<ThreadEntry["status"]>("idle");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const winRef = useRef<HTMLDivElement>(null);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("textarea, button")) return;
    e.stopPropagation();
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: ev.clientX - offset.current.x, y: ev.clientY - offset.current.y });
    };
    const onUp = () => { dragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [pos]);

  const handleSend = useCallback(() => {
    if (!draft.trim()) return;
    setStatus("loading");
    setAnswer("");
    streamFollowUp(
      draft.trim(),
      (s, err) => { setStatus(s); if (err) setError(err); },
      (a) => { setAnswer(a); },
    );
    setDraft("");
  }, [draft, streamFollowUp]);

  return (
    <div
      ref={winRef}
      data-follow-up-window
      className="fixed z-[55] w-72 rounded-xl border border-border bg-card shadow-xl p-3 flex flex-col gap-2"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="flex items-center gap-1 cursor-move" onMouseDown={onDragStart}>
        <Move className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground flex-1">Branch</span>
        <button onClick={onClose} className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <X className="h-3 w-3" />
        </button>
      </div>
      {status === "idle" ? (
        <>
          <p className="text-xs text-muted-foreground italic line-clamp-2">"{sourceHighlight}"</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Branch from this..."
            autoFocus
            className="w-full min-h-[60px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim()}
            className="self-end px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-foreground/90 transition-colors"
          >
            Send
          </button>
        </>
      ) : status === "loading" ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground italic line-clamp-2">"{sourceHighlight}"</p>
          {answer ? (
            <div className="text-sm text-foreground leading-relaxed md-content overflow-y-auto max-h-[200px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(answer) }} />
          ) : (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground italic">Thinking...</span>
            </div>
          )}
        </div>
      ) : status === "error" ? (
        <p className="text-xs text-red-500">{error || "Error"}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground italic line-clamp-2">"{sourceHighlight}"</p>
          <div className="text-sm text-foreground leading-relaxed md-content overflow-y-auto max-h-[200px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(answer) }} />
        </div>
      )}
    </div>
  );
}

// ponytail: read-only floating window for saved branch entries when revisiting via sparkle
function SavedBranchWindow({
  entry,
  initialPos,
  onClose,
}: {
  entry: StoredEntry;
  initialPos: { x: number; y: number };
  onClose: () => void;
}) {
  const [pos, setPos] = useState(initialPos);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.stopPropagation();
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: ev.clientX - offset.current.x, y: ev.clientY - offset.current.y });
    };
    const onUp = () => { dragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [pos]);

  const htmlContent = useMemo(() => renderMarkdown(entry.answer), [entry.answer]);

  return (
    <div
      data-saved-branch-window
      className="fixed z-[55] w-72 rounded-xl border border-border bg-card shadow-xl p-3 flex flex-col gap-2"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="flex items-center gap-1 cursor-move" onMouseDown={onDragStart}>
        <Move className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground flex-1">Branch</span>
        <button onClick={onClose} className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <X className="h-3 w-3" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground font-medium">{entry.question}</p>
      {entry.sourceHighlight && (
        <p className="text-xs text-muted-foreground/70 italic line-clamp-2">"{entry.sourceHighlight}"</p>
      )}
      <div className="text-sm text-foreground leading-relaxed md-content overflow-y-auto max-h-[200px]" dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </div>
  );
}

function HistoryEntryBlock({ entry, index, onDelete }: { entry: StoredEntry; index: number; onDelete: () => void }) {
  const modeLabel = entry.mode.charAt(0).toUpperCase() + entry.mode.slice(1);
  const ModeIcon = getModeIcon(entry.mode);
  const htmlContent = useMemo(() => renderMarkdown(entry.answer), [entry.answer]);
  return (
    <div className="relative pl-4 opacity-55 group" data-entry-id={entry.id}>
      {index > 0 && <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />}
      <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-card border-2 border-border z-[1] flex items-center justify-center">
        <ModeIcon className="w-1.5 h-1.5 text-muted-foreground/70" />
      </div>
      <div className="pb-4">
        <div className="flex items-start gap-1 mb-1">
          <p className="text-xs text-muted-foreground/70 flex-1 min-w-0">
            <span className="font-medium text-muted-foreground/50 mr-1">[{modeLabel} · p.{entry.page}]</span>
            {entry.sourceHighlight && (
              <><span className="italic">"{entry.sourceHighlight.slice(0, 60)}{entry.sourceHighlight.length > 60 ? "…" : ""}"</span><span className="mx-1">—</span></>
            )}
            {entry.question}
          </p>
          <button
            onClick={onDelete}
            title="Remove"
            className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-all"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="text-sm text-foreground/60 leading-relaxed md-content select-text" dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>
    </div>
  );
}

// ponytail: isolated single-entry view when opened from a sparkle click
function SingleEntryBlock({ entry, isContinuation }: { entry: StoredEntry; isContinuation?: boolean }) {
  const htmlContent = useMemo(() => renderMarkdown(entry.answer), [entry.answer]);
  return (
    <div className={`relative ${isContinuation ? "pl-4" : "pb-4"}`}>
      {isContinuation && <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />}
      {isContinuation && (
        <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-card border-2 border-border z-[1] flex items-center justify-center">
          <div className="w-1 h-1 rounded-full bg-muted-foreground" />
        </div>
      )}
      <div className="pb-4">
        <div className="flex items-start gap-1.5 mb-1">
          {(entry.sourceHighlight || isContinuation) && <CornerDownRight className="h-3 w-3 text-muted-foreground/60 mt-0.5 shrink-0" />}
          <p className="text-xs text-muted-foreground">
            {entry.sourceHighlight
              ? <><span className="italic">"{entry.sourceHighlight}"</span><span className="mx-1">—</span>{entry.question}</>
              : entry.question}
          </p>
        </div>
        <div className="text-sm text-foreground leading-relaxed md-content cursor-text select-text" dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>
    </div>
  );
}

export default function ClarifyPanel() {
  const clarifyPanelOpen = useAppStore((s) => s.clarifyPanelOpen);
  const clarifyHighlightText = useAppStore((s) => s.clarifyHighlightText);
  const clarifyMode = useAppStore((s) => s.clarifyMode);
  const activePaper = useAppStore((s) => s.papers.find((p) => p.filePath === s.activePaperPath));
  const currentPage = useAppStore((s) => s.currentPage);
  const llmProvider = useAppStore((s) => s.llmProvider);
  const llmModel = useAppStore((s) => s.llmModel);
  const ollamaEndpoint = useAppStore((s) => s.ollamaEndpoint);
  const opencodeEndpoint = useAppStore((s) => s.opencodeEndpoint);
  const llmTemperature = useAppStore((s) => s.llmTemperature);
  const llmMaxTokens = useAppStore((s) => s.llmMaxTokens);
  const activePaperPath = useAppStore((s) => s.activePaperPath);
  const savedConversations = useAppStore((s) =>
    s.activePaperPath ? (s.conversations[s.activePaperPath] ?? null) : null
  );
  const allConversations = useAppStore((s) => s.conversations);
  const clarifyScrollToEntryId = useAppStore((s) => s.clarifyScrollToEntryId);
  const clearConversations = useAppStore((s) => s.clearConversations);
  const deleteConversationEntry = useAppStore((s) => s.deleteConversationEntry);
  const aiMarkers = useAppStore((s) => s.aiMarkers);
  const removeAiMarker = useAppStore((s) => s.removeAiMarker);

  const { pos, docked, onMouseDown: onDragMouseDown } = useDragMove({ x: Math.max(40, window.innerWidth - 520), y: 80 });
  const { size, onResizeMouseDown, onDockResizeMouseDown } = useDragResize({ w: 480, h: 600 });

  useEffect(() => {
    if (docked) {
      useAppStore.setState({ rightDockWidth: docked === "right" ? size.w : 0, leftDockWidth: docked === "left" ? size.w : 0 });
    } else if (clarifyPanelOpen) {
      useAppStore.setState({ rightDockWidth: 0, leftDockWidth: 0 });
    }
  }, [docked, size.w, clarifyPanelOpen]);

  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const sessionModeRef = useRef<string>("clarify");
  const sessionPageRef = useRef<number>(1);
  const sessionHighlightRef = useRef<string>("");
  const [context, setContext] = useState("");
  const [customDraft, setCustomDraft] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [openBranchWindows, setOpenBranchWindows] = useState<Set<string>>(new Set());
  const [activeFollowUpId, setActiveFollowUpId] = useState<string | null>(null);
  const [followUpPos, setFollowUpPos] = useState({ x: 0, y: 0 });
  const [followUpSourceHighlight, setFollowUpSourceHighlight] = useState("");
  const followUpSourceParentId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const entryRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const singleEntryRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);

  const close = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setOpenBranchWindows(new Set());
    useAppStore.setState({ clarifyPanelOpen: false, clarifyHighlightText: "", clarifyHighlightRects: [], rightDockWidth: 0, leftDockWidth: 0, clarifyScrollToEntryId: null });
  }, []);

  // Clear branch windows when a different sparkle is clicked
  useEffect(() => {
    setOpenBranchWindows(new Set());
  }, [clarifyScrollToEntryId]);

  // Compute initial position for a branch window based on panel layout
  const getBranchPos = useCallback((index: number) => {
    const w = 288; // w-72 = 18rem = 288px
    const gap = 20;
    if (docked === "right") {
      return { x: Math.max(20, window.innerWidth - size.w - w - gap), y: 80 + index * 140 };
    } else if (docked === "left") {
      return { x: size.w + gap, y: 80 + index * 140 };
    } else {
      return { x: Math.min(window.innerWidth - w - gap, pos.x + size.w + gap), y: pos.y + 80 + index * 140 };
    }
  }, [docked, size.w, pos.x, pos.y]);

  // Delete the sparkle marker for an entry id, searching all marker keys
  const deleteOrphanedMarker = useCallback((entryId: string) => {
    for (const [key, markers] of Object.entries(aiMarkers)) {
      if (markers.some((m) => m.id === entryId)) {
        removeAiMarker(key, entryId);
        break;
      }
    }
    close();
  }, [aiMarkers, removeAiMarker, close]);

  // Capture mode/page/highlight when panel opens so runStream can tag saved entries correctly
  useEffect(() => {
    if (clarifyPanelOpen) {
      sessionModeRef.current = useAppStore.getState().clarifyMode;
      sessionPageRef.current = useAppStore.getState().currentPage;
      sessionHighlightRef.current = useAppStore.getState().clarifyHighlightText;
    }
  }, [clarifyPanelOpen]);

  const runStream = useCallback(async (entryId: string, messages: ChatMessage[], meta?: { question: string; sourceHighlight?: string; skipMarker?: boolean; threadId?: string; isBranch?: boolean }) => {
    const abort = new AbortController();
    abortRef.current = abort;
    setThread((prev) => prev.map((e) => e.id === entryId ? { ...e, status: "loading" } : e));
    let accumulator = "";
    typewriterRef.current = setInterval(() => {
      setThread((prev) => prev.map((e) => {
        if (e.id !== entryId || e.status !== "loading") return e;
        return { ...e, answer: accumulator };
      }));
    }, 8);
    try {
      const stream = streamLlm(messages, { provider: llmProvider, model: llmModel, ollamaEndpoint, opencodeEndpoint, temperature: llmTemperature, maxTokens: llmMaxTokens });
      for await (const chunk of stream) { if (abort.signal.aborted) return; accumulator += chunk; }
      let result: { text: string; reasoning: string } | undefined;
      try { result = (await stream.next()).value as any; } catch {}
      if (result?.text) accumulator = result.text;
      setThread((prev) => prev.map((e) => e.id === entryId ? { ...e, answer: accumulator, status: "done" } : e));
      // Save directly here — accumulator has the final text, no effect timing issues
      if (meta && accumulator) {
        const s = useAppStore.getState();
        const paperPath = s.activePaperPath;
        if (paperPath) {
          s.saveConversationEntry(paperPath, {
            id: entryId,
            question: meta.question,
            answer: accumulator,
            sourceHighlight: meta.sourceHighlight,
            mode: sessionModeRef.current,
            page: sessionPageRef.current,
            timestamp: new Date().toISOString(),
            ...(meta.threadId ? { threadId: meta.threadId } : {}),
            ...(meta.isBranch ? { isBranch: true } : {}),
          });
          // Place a sparkle marker on the page at the highlighted rects (skip for chat continuations)
          const rects = s.clarifyHighlightRects;
          if (!meta.skipMarker && rects && rects.length > 0) {
            s.addAiMarker(`${paperPath}-${sessionPageRef.current}`, {
              id: entryId,
              zoom: s.zoom,
              rects,
              text: meta.sourceHighlight || "",
            });
          }
          s.awardXP("ask_ai", { mode: sessionModeRef.current, paperPath });
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      const msg = e.message || "Unknown error";
      const errMsg = msg.includes("NetworkError") || msg.includes("Failed to fetch")
        ? (llmProvider !== "ollama" && !("__TAURI_INTERNALS__" in window)
          ? "CORS blocked — cloud LLM APIs can't be called from browser. Use Tauri, or set up a proxy."
          : `Can't reach ${llmProvider === "ollama" ? ollamaEndpoint : llmProvider} — check your connection.`)
        : msg;
      setThread((prev) => prev.map((e) => e.id === entryId ? { ...e, status: "error", error: errMsg } : e));
    }
    if (typewriterRef.current) clearInterval(typewriterRef.current);
  }, [llmProvider, llmModel, ollamaEndpoint, opencodeEndpoint, llmTemperature, llmMaxTokens]);

  useEffect(() => {
    if (!clarifyPanelOpen) {
      setThread([]); setContext(""); setCustomDraft(""); setChatDraft(""); setOpenBranchWindows(new Set()); setActiveFollowUpId(null);
      return;
    }
    const scrollId = useAppStore.getState().clarifyScrollToEntryId;
    if (scrollId) {
      // ponytail: load the saved entry into thread so chat input shows and user can keep chatting
      const s = useAppStore.getState();
      const convs = s.conversations;
      let entry: StoredEntry | null = null;
      for (const entries of Object.values(convs)) {
        entry = entries.find((e) => e.id === scrollId) || null;
        if (entry) break;
      }
      if (entry) {
        setThread([{ id: entry.id, question: entry.question, answer: entry.answer, status: "done", sourceHighlight: entry.sourceHighlight }]);
      } else {
        setThread([]);
      }
      setContext("");
      return;
    }
    const title = activePaper?.title || "Untitled";
    const ctxParts: string[] = [];
    (async () => {
      for (const offset of [-2, -1, 1, 2]) {
        const pn = currentPage + offset;
        if (pn < 1) continue;
        const t = await getPageText(pn);
        if (t) ctxParts.push(`[Page ${pn}]: ${t}`);
      }
      const ctx = ctxParts.length > 0 ? ctxParts.join("\n") : "";
      setContext(ctx);
      const prompt = MODE_PROMPTS[clarifyMode] || MODE_PROMPTS.clarify;
      const ctxBlock = ctx ? `\n\nSurrounding context from the paper:\n${ctx}` : "";
      if (clarifyMode === "custom") {
        setThread([{ id: uid(), question: "Ask about highlighted text", answer: "", status: "idle" }]);
      } else {
        const entryId = uid();
        setThread([{ id: entryId, question: prompt.ask, answer: "", status: "loading" }]);
        const messages: ChatMessage[] = [
          { role: "system", content: prompt.system(title) },
          { role: "user", content: `The user highlighted this text on page ${currentPage}:\n"${clarifyHighlightText}"${ctxBlock}\n\n${prompt.ask}` },
        ];
        runStream(entryId, messages, { question: prompt.ask, sourceHighlight: clarifyHighlightText });
      }
    })();
    return () => { if (typewriterRef.current) clearInterval(typewriterRef.current); abortRef.current?.abort(); };
  }, [clarifyPanelOpen, clarifyMode, currentPage, activePaper?.title, clarifyHighlightText, runStream]);

  // ponytail: single-entry view — no scroll needed, keep entryId until panel closes

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread.length, thread[thread.length - 1]?.answer]);

  useEffect(() => {
    if (!activeFollowUpId && openBranchWindows.size === 0) return;
    let raf: number;
    const loop = () => { setTick((t) => t + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [activeFollowUpId, openBranchWindows]);

  const handleCustomSend = useCallback(() => {
    if (!customDraft.trim() || thread.length === 0) return;
    const entry = thread[0];
    if (entry.status !== "idle") return;
    const title = activePaper?.title || "Untitled";
    const ctxBlock = context ? `\n\nSurrounding context from the paper:\n${context}` : "";
    const messages: ChatMessage[] = [
      { role: "system", content: MODE_PROMPTS.custom.system(title) },
      { role: "user", content: `The user highlighted this text on page ${currentPage}:\n"${clarifyHighlightText}"${ctxBlock}\n\nQuestion: ${customDraft.trim()}` },
    ];
    const question = customDraft.trim();
    setThread((prev) => prev.map((e) => e.id === entry.id ? { ...e, question, status: "loading" } : e));
    setCustomDraft("");
    runStream(entry.id, messages, { question, sourceHighlight: clarifyHighlightText });
  }, [customDraft, thread, context, activePaper?.title, currentPage, clarifyHighlightText, runStream]);

  const handleChatSend = useCallback(() => {
    if (!chatDraft.trim()) return;
    if (thread.some((e) => e.status === "loading")) return;
    const title = activePaper?.title || "Untitled";
    const prompt = MODE_PROMPTS[sessionModeRef.current] || MODE_PROMPTS.clarify;
    const ctxBlock = context ? `\n\nSurrounding context from the paper:\n${context}` : "";
    const question = chatDraft.trim();
    const newEntryId = uid();
    // Build full conversation history so the model has context
    const messages: ChatMessage[] = [
      { role: "system", content: prompt.system(title) },
    ];
    thread.forEach((e, i) => {
      if (i === 0) {
        messages.push({ role: "user", content: `The user highlighted this text on page ${sessionPageRef.current}:\n"${sessionHighlightRef.current}"${ctxBlock}\n\n${e.question}` });
      } else {
        messages.push({ role: "user", content: e.question });
      }
      if (e.answer) messages.push({ role: "assistant", content: e.answer });
    });
    messages.push({ role: "user", content: question });
    setChatDraft("");
    setThread((prev) => [...prev, { id: newEntryId, question, answer: "", status: "loading" }]);
    runStream(newEntryId, messages, { question, sourceHighlight: sessionHighlightRef.current, skipMarker: true, threadId: thread[0]?.id });
  }, [chatDraft, thread, activePaper?.title, context, runStream]);

  const handleAnswerSelect = useCallback((entryId: string, selectedText: string) => {
    const parent = thread.find((e) => e.id === entryId);
    if (!parent) return;
    const sourceEl = entryRefs.current.get(entryId);
    let fx = 60, fy = 80;
    if (sourceEl) {
      const r = sourceEl.getBoundingClientRect();
      fx = r.right + 20;
      fy = r.top + r.height / 2 - 80;
    }
    setFollowUpPos({ x: Math.max(20, fx), y: Math.max(20, Math.min(fy, window.innerHeight - 300)) });
    setFollowUpSourceHighlight(parent.sourceHighlight || selectedText);
    followUpSourceParentId.current = entryId;
    setActiveFollowUpId(entryId);
  }, [thread]);

  // ponytail: streaming for follow-up window — stays in the floating window, but also saved for revisit
  const streamFollowUp = useCallback(async (
    draft: string,
    onStatus: (s: ThreadEntry["status"], err?: string) => void,
    onAnswer: (a: string) => void,
  ) => {
    const parentId = followUpSourceParentId.current;
    if (!parentId) return;
    const parent = thread.find((e) => e.id === parentId);
    if (!parent) return;
    const branchEntryId = uid(); // ponytail: unique id so the branch survives revisit

    const title = activePaper?.title || "Untitled";
    const ctxBlock = context ? `\n\nSurrounding context from the paper:\n${context}` : "";

    const messages: ChatMessage[] = [
      { role: "system", content: `You are a research assistant. The user is reading "${title}". Answer concisely and helpfully.` },
    ];

    // Include the original highlight + surrounding context
    if (clarifyHighlightText) {
      messages.push({ role: "user", content: `The user highlighted this text on page ${currentPage}:\n"${clarifyHighlightText}"${ctxBlock}` });
      // Include the parent answer for context
      messages.push({ role: "assistant", content: parent.answer });
    }

    // Include the specific text the user selected in the parent answer
    const hl = followUpSourceHighlight || parent.answer.slice(0, 200);
    messages.push({
      role: "user",
      content: `Regarding this part of your previous answer: "${hl}"\n\n${draft}`,
    });

    onStatus("loading");
    let accumulator = "";

    const interval = setInterval(() => onAnswer(accumulator), 8);

    try {
      const stream = streamLlm(messages, { provider: llmProvider, model: llmModel, ollamaEndpoint, opencodeEndpoint, temperature: llmTemperature, maxTokens: llmMaxTokens });
      for await (const chunk of stream) { accumulator += chunk; }
      let result: { text: string; reasoning: string } | undefined;
      try { result = (await stream.next()).value as any; } catch {}
      if (result?.text) accumulator = result.text;
      onAnswer(accumulator);
      onStatus("done");
      // ponytail: persist the branch so it reappears when revisiting the sparkle
      const s = useAppStore.getState();
      const paperPath = s.activePaperPath;
      if (paperPath) {
        s.saveConversationEntry(paperPath, {
          id: branchEntryId,
          question: draft,
          answer: accumulator,
          sourceHighlight: followUpSourceHighlight || parent.answer.slice(0, 200),
          mode: sessionModeRef.current,
          page: sessionPageRef.current,
          timestamp: new Date().toISOString(),
          threadId: thread[0]?.id || parentId,
          isBranch: true,
        });
      }
      useAppStore.getState().awardXP("follow_up");
    } catch (e: any) {
      if (e.name === "AbortError") return;
      const msg = e.message || "Unknown error";
      const errMsg = msg.includes("NetworkError") || msg.includes("Failed to fetch")
        ? (llmProvider !== "ollama" && !("__TAURI_INTERNALS__" in window)
          ? "CORS blocked"
          : `Can't reach ${llmProvider}`)
        : msg;
      onStatus("error", errMsg);
    }

    clearInterval(interval);
  }, [thread, context, activePaper?.title, currentPage, clarifyHighlightText, followUpSourceHighlight, llmProvider, llmModel, ollamaEndpoint, opencodeEndpoint, llmTemperature, llmMaxTokens]);

  // ponytail: arrow from the panel window edge, not the entry element inside it
  // ponytail: arrow endpoints for live FollowUpWindow — dynamic edges based on relative position
  const liveArrow = useMemo(() => {
    if (!activeFollowUpId) return null;
    const panelEl = panelRef.current;
    const winEl = document.querySelector("[data-follow-up-window]") as HTMLElement | null;
    if (!panelEl || !winEl) return null;
    const { from, to } = computeArrowEndpoints(panelEl.getBoundingClientRect(), winEl.getBoundingClientRect());
    return { from, to };
  }, [activeFollowUpId, tick]);

  // ponytail: arrows from panel to each open saved-branch window — dynamic edges
  const branchArrows = useMemo(() => {
    if (openBranchWindows.size === 0) return [];
    const panelEl = panelRef.current;
    if (!panelEl) return [];
    const panelRect = panelEl.getBoundingClientRect();
    const arrows: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
    document.querySelectorAll("[data-saved-branch-window]").forEach((win) => {
      const { from, to } = computeArrowEndpoints(panelRect, win.getBoundingClientRect());
      arrows.push({ from, to });
    });
    return arrows;
  }, [openBranchWindows, tick]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const handler = (e: Event) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!btn) return;
      if (btn.classList.contains("copy-btn")) {
        e.preventDefault(); e.stopPropagation();
        const code = decodeURIComponent(btn.dataset.code || "");
        if (code) navigator.clipboard.writeText(code).then(() => { btn.textContent = "Copied!"; setTimeout(() => (btn.textContent = "Copy"), 1500); }).catch(() => {});
      }
      if (btn.classList.contains("push-sketch-btn")) {
        e.preventDefault(); e.stopPropagation();
        const code = decodeURIComponent(btn.dataset.code || "");
        if (code) {
          useAppStore.setState({ pendingSketchText: code, drawingOpen: true });
          useAppStore.getState().awardXP("canvas_push");
        }
      }
    };
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [clarifyPanelOpen, thread]);

  const singleEntry = useMemo(() => {
    if (!clarifyScrollToEntryId) return null;
    // try current document first
    if (savedConversations) {
      const found = savedConversations.find((e) => e.id === clarifyScrollToEntryId);
      if (found) return found;
    }
    // fallback: search every document's conversations (handles path mismatch)
    for (const entries of Object.values(allConversations)) {
      const found = entries.find((e) => e.id === clarifyScrollToEntryId);
      if (found) return found;
    }
    return null;
  }, [clarifyScrollToEntryId, savedConversations, allConversations]);

  // ponytail: split into inline continuations (chat follow-ups) and floating branches (Branch button)
  const continuations = useMemo(() => {
    if (!singleEntry) return [];
    const results: StoredEntry[] = [];
    for (const entries of Object.values(allConversations)) {
      for (const entry of entries) {
        if (entry.threadId === singleEntry.id && !entry.isBranch) results.push(entry);
      }
    }
    return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [singleEntry, allConversations]);

  const branchEntries = useMemo(() => {
    if (!singleEntry) return [];
    const results: StoredEntry[] = [];
    for (const entries of Object.values(allConversations)) {
      for (const entry of entries) {
        if (entry.threadId === singleEntry.id && entry.isBranch) results.push(entry);
      }
    }
    return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [singleEntry, allConversations]);

  const isSingleEntryView = !!singleEntry;
  const headerLabel = isSingleEntryView
    ? `${singleEntry.mode.charAt(0).toUpperCase() + singleEntry.mode.slice(1)} · p.${singleEntry.page}`
    : (MODE_PROMPTS[clarifyMode]?.title || "Clarify");
  if (!clarifyPanelOpen) return null;
  const isStreaming = thread.some((e) => e.status === "loading");
  const threadIds = new Set(thread.map((e) => e.id));
  const historyToShow = savedConversations ? savedConversations.filter((e) => !threadIds.has(e.id)) : [];

  return (
    <>
      <AnimatePresence>
        {clarifyPanelOpen && (
          <motion.div
            ref={panelRef}
            key="clarify"
            initial={docked ? { height: "100%", opacity: 0 } : { opacity: 0, scale: 0.95 }}
            animate={docked ? { height: "100%", opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`fixed z-50 bg-card border border-border shadow-lg flex flex-col overflow-hidden ${docked ? "top-0 bottom-0 rounded-none" : "rounded-xl"}`}
            style={
              docked
                ? { [docked === "right" ? "right" : "left"]: 0, width: size.w, height: "100%" }
                : { left: Math.max(0, Math.min(pos.x, window.innerWidth - 300)), top: Math.max(0, Math.min(pos.y, window.innerHeight - 100)), width: size.w, height: size.h }
            }
          >
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border cursor-grab active:cursor-grabbing select-none" onMouseDown={onDragMouseDown}>
              <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              {(() => { const ModeIcon = isSingleEntryView ? getModeIcon(singleEntry.mode) : getModeIcon(clarifyMode); return <ModeIcon className="h-3.5 w-3.5 text-muted-foreground" />; })()}
              <span className="text-xs font-medium text-foreground flex-1">{headerLabel}</span>
              {isSingleEntryView && branchEntries.length > 0 && (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (openBranchWindows.size > 0) {
                      setOpenBranchWindows(new Set());
                    } else {
                      setOpenBranchWindows(new Set(branchEntries.map((e) => e.id)));
                    }
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mr-1"
                >
                  <CornerDownRight className="h-3 w-3" />
                  {openBranchWindows.size > 0 ? "Hide" : `${branchEntries.length} branch${branchEntries.length > 1 ? "es" : ""}`}
                </button>
              )}
              {isStreaming && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {isSingleEntryView && activePaperPath && (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversationEntry(activePaperPath, singleEntry.id);
                    close();
                  }}
                  title="Delete conversation"
                  className="p-0.5 rounded text-muted-foreground hover:text-red-500 hover:bg-secondary transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              {clarifyScrollToEntryId && !singleEntry && (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteOrphanedMarker(clarifyScrollToEntryId);
                  }}
                  title="Remove sparkle marker"
                  className="p-0.5 rounded text-muted-foreground hover:text-red-500 hover:bg-secondary transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              {!isSingleEntryView && activePaperPath && historyToShow.length > 0 && (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); clearConversations(activePaperPath); close(); }}
                  title="Clear history"
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); close(); }}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {docked && (
              <div className={`absolute top-0 bottom-0 w-2 cursor-col-resize hover:bg-foreground/10 z-10 ${docked === "right" ? "left-0" : "right-0"}`} onMouseDown={(e) => onDockResizeMouseDown(e as any, docked as any)} />
            )}
            <div ref={outerRef} className="flex-1 overflow-hidden flex flex-col">
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
                {clarifyScrollToEntryId && !singleEntry ? (
                  <p className="text-xs text-muted-foreground/50 italic mt-2">
                    Conversation not found — it may have been deleted or the storage data is missing.
                  </p>
                ) : isSingleEntryView ? (
                  <div ref={singleEntryRef} className="flex flex-col">
                    <SingleEntryBlock entry={singleEntry} />
                    {continuations.map((entry) => (
                      <SingleEntryBlock key={entry.id} entry={entry} isContinuation />
                    ))}
                  </div>
                ) : (
                  <>
                    {historyToShow.length > 0 && (
                      <div className="mb-2">
                        {historyToShow.map((entry, i) => (
                          <HistoryEntryBlock
                            key={entry.id}
                            entry={entry}
                            index={i}
                            onDelete={() => {
                              if (activePaperPath) deleteConversationEntry(activePaperPath, entry.id);
                            }}
                          />
                        ))}
                        <div className="flex items-center gap-2 my-3">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-muted-foreground/40 select-none">new session</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      </div>
                    )}
                    {thread.map((entry, i) => (
                      <ThreadEntryBlock
                        key={entry.id}
                        entry={entry}
                        index={i}
                        onAnswerSelect={handleAnswerSelect}
                        entryRef={(el) => { if (el) entryRefs.current.set(entry.id, el); else entryRefs.current.delete(entry.id); }}
                      />
                    ))}
                  </>
                )}
              </div>
              {clarifyMode === "custom" && thread.length > 0 && thread[0].status === "idle" ? (
                <div className="shrink-0 border-t border-border px-4 py-3">
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={customDraft}
                      onChange={(e) => setCustomDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleCustomSend(); } }}
                      placeholder="Ask anything about this text..."
                      className="w-full min-h-[60px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button onClick={handleCustomSend} disabled={!customDraft.trim()} className="self-end px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-foreground/90 transition-colors">
                      Send
                    </button>
                  </div>
                </div>
              ) : thread.some((e) => e.status === "done") ? (
                <div className="shrink-0 border-t border-border px-3 py-2">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={chatDraft}
                      onChange={(e) => setChatDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                      placeholder="Keep chatting..."
                      rows={1}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                      style={{ minHeight: "36px", maxHeight: "120px", overflowY: "auto" }}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = "auto";
                        el.style.height = Math.min(el.scrollHeight, 120) + "px";
                      }}
                    />
                    <button
                      onClick={handleChatSend}
                      disabled={!chatDraft.trim() || isStreaming}
                      className="shrink-0 p-2 rounded-lg bg-foreground text-background disabled:opacity-40 disabled:cursor-not-allowed hover:bg-foreground/90 transition-colors"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            {!docked && <div className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize" onMouseDown={(e) => onResizeMouseDown(e as any, "se")} />}
          </motion.div>
        )}
      </AnimatePresence>

      {(activeFollowUpId || openBranchWindows.size > 0) && createPortal(
        <svg className="fixed left-0 top-0 pointer-events-none z-[60]" style={{ width: "100vw", height: "100vh" }}>
          {liveArrow && <Arrow from={liveArrow.from} to={liveArrow.to} />}
          {branchArrows.map((a, i) => (
            <Arrow key={`branch-${i}`} from={a.from} to={a.to} />
          ))}
        </svg>,
        document.body,
      )}

      {activeFollowUpId && createPortal(
        <FollowUpWindow
          sourceHighlight={followUpSourceHighlight}
          initialPos={followUpPos}
          onClose={() => setActiveFollowUpId(null)}
          streamFollowUp={streamFollowUp}
        />,
        document.body,
      )}

      {branchEntries.length > 0 && createPortal(
        <>
          {branchEntries.map((entry, i) => {
            if (!openBranchWindows.has(entry.id)) return null;
            return (
              <SavedBranchWindow
                key={entry.id}
                entry={entry}
                initialPos={getBranchPos(i)}
                onClose={() => {
                  setOpenBranchWindows((prev) => {
                    const next = new Set(prev);
                    next.delete(entry.id);
                    return next;
                  });
                }}
              />
            );
          })}
        </>,
        document.body,
      )}
    </>
  );
}
