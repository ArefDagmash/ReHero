import { useCallback, useState, useMemo, useEffect } from "react";
import { Plus, FileText, Trash2, Pencil, X, Sparkles, ChevronDown, User, Headphones, Compass } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AddPaperModal from "@/components/AddPaperModal";
import PdfThumbnail from "@/components/PdfThumbnail";
import { deletePdf } from "@/lib/pdfStorage";
import { addPaperFromBytes } from "@/lib/addPaper";
import { useAppStore } from "@/store/useAppStore";
import { ProgressBar } from "@/components/ui/progress-bar";
import { LEVELS, getXpForNextLevel } from "@/lib/gamification";
import { listNarrationSummaries, type NarrationSummary } from "@/lib/narrationStorage";
import type { Paper } from "@/types";

type SortKey = "recent" | "name" | "annotated";
type Variant = "continue" | "library" | "books";

function XPBadge() {
  const { xp, level, stats } = useAppStore((s) => s.gamification);
  const levelInfo = LEVELS[level];
  const nextLevelXp = getXpForNextLevel(level);
  const prevLevelXp = LEVELS[level]?.xp ?? 0;
  const range = nextLevelXp - prevLevelXp;
  const progress = range > 0 ? Math.min(100, ((xp - prevLevelXp) / range) * 100) : 100;

  return (
    <div className="flex items-center gap-2.5">
      {/* Profile avatar with indigo ring progress */}
      <div className="relative shrink-0">
        <svg width="36" height="36" className="-rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-secondary" />
          <circle
            cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeDasharray={`${2 * Math.PI * 15}`}
            strokeDashoffset={`${2 * Math.PI * 15 * (1 - progress / 100)}`}
            strokeLinecap="round"
            className="text-indigo-400 transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <User className="h-4 w-4 text-muted-foreground/60" />
        </div>
      </div>

      {/* Level info */}
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground leading-none">{levelInfo.title}</span>
        <span className="text-xs text-muted-foreground/50 tabular-nums leading-none">
          {xp.toLocaleString()} XP
          {stats.readingRunDays > 1 && <span className="ml-1.5">🔥 {stats.readingRunDays}d</span>}
        </span>
      </div>
    </div>
  );
}

const cardTilts = [-1.5, 1, -0.8, 2, -1, 0.5];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function HomePage({ onOpenPaper, variant = "library" }: { onOpenPaper: () => void; variant?: Variant }) {
  const isBooks = variant === "books";
  const papers = useAppStore((s) => isBooks ? s.books : s.papers);
  const allPapers = useAppStore((s) => s.papers);
  const allBooks = useAppStore((s) => s.books);
  const conversations = useAppStore((s) => s.conversations);
  const setActivePaper = useAppStore((s) => s.setActivePaper);
  const setActiveBook = useAppStore((s) => s.setActiveBook);
  const setPage = useAppStore((s) => s.setPage);
  const removePaper = useAppStore((s) => s.removePaper);
  const removeBook = useAppStore((s) => s.removeBook);
  const rightDockWidth = useAppStore((s) => s.rightDockWidth);
  const leftDockWidth = useAppStore((s) => s.leftDockWidth);
  const [modalOpen, setModalOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  const [deleteTarget, setDeleteTarget] = useState<Paper | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // "Continue Listening" (Home dashboard only) — narrations are saved to
  // IndexedDB independent of the papers/books store, so this cross-
  // references saved narrations against whatever's still in the library.
  const [narrationSummaries, setNarrationSummaries] = useState<NarrationSummary[]>([]);
  useEffect(() => {
    if (variant !== "continue") return;
    let cancelled = false;
    listNarrationSummaries().then((s) => { if (!cancelled) setNarrationSummaries(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [variant]);

  const continueListening = useMemo(() => {
    if (variant !== "continue") return [];
    return narrationSummaries
      .map((summary) => {
        const paper = allPapers.find((p) => p.filePath === summary.paperPath);
        const book = allBooks.find((b) => b.filePath === summary.paperPath);
        const match = paper ?? book;
        if (!match) return null;
        return { summary, item: match, isBook: !!book };
      })
      .filter((x): x is { summary: NarrationSummary; item: Paper; isBook: boolean } => x !== null)
      .sort((a, b) => b.summary.createdAt - a.summary.createdAt);
  }, [variant, narrationSummaries, allPapers, allBooks]);

  const handleResumeListening = useCallback(
    (entry: { item: Paper; isBook: boolean; summary: NarrationSummary }) => {
      useAppStore.setState({ autoResumeNarration: true });
      if (entry.isBook) {
        setActiveBook(entry.item.filePath);
      } else {
        setActivePaper(entry.item.filePath);
      }
      // setActive{Paper,Book} above resets currentPage to the paper's own
      // *reading* progress (lastPage) — override with wherever the
      // narration itself last got to, falling back to where it started if
      // it was never actually played yet.
      setPage(entry.summary.lastKnownPage ?? entry.summary.from);
      onOpenPaper();
    },
    [setActivePaper, setActiveBook, setPage, onOpenPaper],
  );

  const conversationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [key, entries] of Object.entries(conversations)) {
      // key is filePath
      counts[key] = entries.length;
    }
    return counts;
  }, [conversations]);

  const sortedPapers = useMemo(() => {
    const list = [...papers];
    switch (sortKey) {
      case "name":
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "annotated":
        list.sort((a, b) => (conversationCounts[b.filePath] ?? 0) - (conversationCounts[a.filePath] ?? 0));
        break;
      case "recent":
      default:
        list.sort((a, b) => {
          const da = a.lastOpenedAt ? new Date(a.lastOpenedAt).getTime() : 0;
          const db = b.lastOpenedAt ? new Date(b.lastOpenedAt).getTime() : 0;
          return db - da;
        });
        break;
    }
    return list;
  }, [papers, sortKey, conversationCounts]);

  const displayPapers = variant === "continue" ? sortedPapers : sortedPapers;

  const handleAddPaper = useCallback(
    async (file: File, name: string) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await addPaperFromBytes(bytes, name, isBooks);
    },
    [isBooks],
  );

  const handleDelete = useCallback(
    (paper: Paper) => {
      if (paper.filePath.startsWith("idb://")) {
        const id = paper.filePath.slice(6);
        deletePdf(id).catch(() => {});
      }
      if (isBooks) {
        removeBook(paper.id);
      } else {
        removePaper(paper.id);
      }
      setDeleteTarget(null);
    },
    [removePaper, removeBook, isBooks],
  );

  const handleEditStart = useCallback((paper: Paper) => {
    setEditingId(paper.id);
    setEditName(paper.title);
  }, []);

  const handleEditSave = useCallback(
    (paper: Paper) => {
      const name = editName.trim();
      if (name) {
        if (isBooks) {
          useAppStore.setState((s) => ({
            books: s.books.map((b) =>
              b.id === paper.id ? { ...b, title: name } : b,
            ),
          }));
        } else {
          useAppStore.setState((s) => ({
            papers: s.papers.map((p) =>
              p.id === paper.id ? { ...p, title: name } : p,
            ),
          }));
        }
      }
      setEditingId(null);
    },
    [editName, isBooks],
  );

  const handlePaperClick = useCallback(
    (paper: Paper) => {
      if (editingId) return;
      if (isBooks) {
        setActiveBook(paper.filePath);
      } else {
        setActivePaper(paper.filePath);
      }
      onOpenPaper();
    },
    [setActivePaper, setActiveBook, onOpenPaper, editingId, isBooks],
  );

  const aiCount = (paper: Paper) => conversationCounts[paper.filePath] ?? 0;

  if (papers.length === 0) {
    return (
      <div
        className="flex-1 flex items-center justify-center bg-background transition-[margin] duration-150"
        style={{
          marginRight: rightDockWidth || undefined,
          marginLeft: leftDockWidth || undefined,
        }}
      >
        <button
          onClick={() => setModalOpen(true)}
          className="flex flex-col items-center gap-5 p-24 rounded-2xl bg-card border border-border shadow-sm hover:shadow-md hover:scale-[1.02] transition-all group"
        >
          <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center group-hover:scale-110 transition-transform">
            <Plus className="h-7 w-7 text-muted-foreground" />
          </div>
          <span className="text-sm text-muted-foreground">{isBooks ? "add book" : "add paper"}</span>
        </button>
        <AddPaperModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onAdd={handleAddPaper}
          variant={isBooks ? "book" : "paper"}
        />
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col bg-background overflow-hidden relative transition-[margin] duration-150"
      style={{
        marginRight: rightDockWidth || undefined,
        marginLeft: leftDockWidth || undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-8 pb-4 shrink-0">
        <h2 className="text-sm text-muted-foreground">
          {variant === "continue" ? "Continue Reading" : variant === "books" ? "Your Books" : "Your Papers"} &middot; {papers.length}
        </h2>
        <XPBadge />
      </div>

      {/* Continue Listening — narrations are saved independent of the
          papers/books list, and previously had no surface outside the one
          specific paper's Reader; this mirrors "Continue Reading" above. */}
      {continueListening.length > 0 && (
        <div className="px-8 pb-4 shrink-0">
          <p className="text-xs text-muted-foreground/50 mb-2">Continue Listening</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {continueListening.map(({ summary, item }) => (
              <button
                key={summary.paperPath}
                onClick={() => handleResumeListening({ item, summary, isBook: allBooks.some((b) => b.filePath === item.filePath) })}
                className="shrink-0 flex items-center gap-2 pl-2.5 pr-3.5 py-2 rounded-full bg-card border border-border/60 hover:border-border hover:shadow-sm transition-all max-w-[260px]"
                title={`Resume audio — pages ${summary.from}-${summary.to}`}
              >
                <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center">
                  <Headphones className="h-3 w-3 text-indigo-500" />
                </span>
                <span className="text-xs text-foreground/80 truncate">{item.title}</span>
                <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums">
                  p.{summary.from}-{summary.to}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto px-8 pb-8 pt-1">
        <div className="min-h-full flex flex-col">
        {/* Sort — sits right above the cards */}
        <div className="flex justify-end mb-4 relative group/sort shrink-0">
          <button className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            <span className="capitalize">{sortKey}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          <div className="absolute right-0 top-full mt-1 py-1 bg-card border border-border rounded-lg shadow-lg opacity-0 invisible group-hover/sort:opacity-100 group-hover/sort:visible transition-all z-10 min-w-[120px]">
            {(["recent", "name", "annotated"] as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors capitalize ${
                  sortKey === key ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
        {/* Vertically centers the row within leftover space when there are
            only a few cards, instead of dumping all the extra space below. */}
        <div className="flex-1 flex items-center">
        <div className="flex flex-wrap gap-6 items-start">
          <AnimatePresence>
            {displayPapers.map((paper, i) => {
              const progressPct = paper.totalPages > 0
                ? Math.round((paper.lastPage / paper.totalPages) * 100)
                : 0;
              const count = aiCount(paper);

              return (
                <motion.div
                  key={paper.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: i * 0.04 }}
                  className="shrink-0 flex flex-col gap-2 group/card"
                  style={{ transform: `rotate(${cardTilts[i % cardTilts.length]}deg)` }}
                  onMouseEnter={() => setHoveredId(paper.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <button
                    onClick={() => handlePaperClick(paper)}
                    className="w-60 bg-card rounded-xl border border-border/60 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all flex flex-col overflow-hidden relative group"
                  >
                    {/* Thumbnail or fallback */}
                    {paper.filePath.startsWith("idb://") ? (
                      <div className="w-full aspect-[3/4]">
                        <PdfThumbnail paperId={paper.id} filePath={paper.filePath} />
                      </div>
                    ) : (
                      <div className="w-full aspect-[3/4] flex items-center justify-center bg-secondary/30">
                        <FileText className="h-12 w-12 text-muted-foreground/25" />
                      </div>
                    )}

                    {/* AI badge */}
                    {count > 0 && (
                      <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-indigo-500/90 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                        <Sparkles className="h-2.5 w-2.5" />
                        {count}
                      </div>
                    )}

                    {/* Source badge — discovered via Explore vs. manually added */}
                    {paper.source === "explore" && (
                      <div
                        className="absolute top-2 left-2 flex items-center gap-0.5 bg-card/90 text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full border border-border/60"
                        title="Added from Explore"
                      >
                        <Compass className="h-2.5 w-2.5" />
                      </div>
                    )}

                    {/* Title area — fixed height so cards align on a shared
                        baseline regardless of whether the title wraps to 1 or 2 lines */}
                    <div className="p-3 text-left h-[3.25rem] flex items-start">
                      {editingId === paper.id ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleEditSave(paper);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => handleEditSave(paper)}
                          className="text-sm text-left bg-transparent border-b border-border outline-none w-full px-1 text-foreground"
                          autoFocus
                        />
                      ) : (
                        <p className="text-sm text-left text-foreground/80 line-clamp-2 font-medium leading-relaxed">
                          {paper.title}
                        </p>
                      )}
                    </div>

                    {/* Progress bar */}
                    {paper.totalPages > 0 && (
                      <div className="px-3 pb-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground/60 mb-1">
                          <span>p.{paper.lastPage}/{paper.totalPages}</span>
                          {paper.lastOpenedAt && (
                            <span>{relativeTime(paper.lastOpenedAt)}</span>
                          )}
                        </div>
                        <ProgressBar value={progressPct} variant="accent" />
                      </div>
                    )}
                  </button>

                  {/* Bottom action bar */}
                  {/* Fixed (not min-) height: must never change size when swapping
                      between the page-count text and the edit/delete icons, or
                      the card's total height shifts and pushes neighboring cards. */}
                  <div className="flex items-center justify-center h-10">
                    <AnimatePresence mode="wait">
                      {hoveredId === paper.id ? (
                        <motion.div
                          key="actions"
                          initial={{ y: -8, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -8, opacity: 0 }}
                          transition={{ duration: 0.12 }}
                          className="flex items-center gap-1"
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEditStart(paper); }}
                            className="p-1 rounded-md text-muted-foreground/30 hover:text-foreground hover:bg-secondary transition-colors"
                            title="Rename"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(paper); }}
                            className="p-1 rounded-md text-muted-foreground/30 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </motion.div>
                      ) : (
                        <motion.span
                          key="pages"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.1 }}
                          className="text-xs text-muted-foreground/50"
                        >
                          {paper.totalPages > 0 ? `${paper.totalPages} pages` : ""}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          <button
            onClick={() => setModalOpen(true)}
            className="shrink-0 flex flex-col items-center gap-2 group"
          >
            <div className="w-60 aspect-[3/4] rounded-xl bg-card border border-border/40 border-dashed shadow-sm hover:shadow-md hover:scale-105 hover:border-muted-foreground/15 transition-all flex items-center justify-center">
              <Plus className="h-10 w-10 text-muted-foreground/20 group-hover:text-muted-foreground/40 transition-colors" />
            </div>
            <span className="text-xs text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors">{isBooks ? "add book" : "add paper"}</span>
          </button>
        </div>
        </div>
        </div>
      </div>

      <AddPaperModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={handleAddPaper}
        variant={isBooks ? "book" : "paper"}
      />

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40"
              onClick={() => setDeleteTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-card rounded-xl shadow-xl p-6 w-full max-w-xs mx-4"
            >
              <button
                onClick={() => setDeleteTarget(null)}
                className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="text-sm text-foreground mb-1">Delete {isBooks ? "book" : "paper"}?</p>
              <p className="text-xs text-muted-foreground mb-4 line-clamp-2">
                &ldquo;{deleteTarget.title}&rdquo; will be permanently removed.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteTarget)}
                  className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 transition-colors"
                >
                  delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default HomePage;
