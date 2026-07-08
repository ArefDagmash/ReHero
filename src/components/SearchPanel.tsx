import { useMemo, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FileText, MessageSquareText, Sparkles, CornerDownRight } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { Paper, Annotation, StoredEntry } from "@/types";

type SearchResult =
  | { type: "paper"; paper: Paper; match: string }
  | { type: "annotation"; paper?: Paper; annotation: Annotation; match: string }
  | { type: "conversation"; paper?: Paper; entry: StoredEntry; match: string };

function SearchPanel() {
  const searchOpen = useAppStore((s) => s.searchOpen);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const papers = useAppStore((s) => s.papers);
  const books = useAppStore((s) => s.books);
  const annotations = useAppStore((s) => s.annotations);
  const conversations = useAppStore((s) => s.conversations);
  const setActivePaper = useAppStore((s) => s.setActivePaper);
  const setPage = useAppStore((s) => s.setPage);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      useAppStore.setState({ searchQuery: "" });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  const allPapers = useMemo(() => [...papers, ...books], [papers, books]);

  const results = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    const res: SearchResult[] = [];

    for (const p of allPapers) {
      if (p.title.toLowerCase().includes(q)) {
        res.push({ type: "paper", paper: p, match: p.title });
      }
    }

    for (const [filePath, anns] of Object.entries(annotations)) {
      const paper = allPapers.find((p) => p.filePath === filePath);
      for (const a of anns) {
        const noteHit = a.note?.toLowerCase().includes(q);
        const hlHit = a.highlightedText?.toLowerCase().includes(q);
        if (noteHit || hlHit) {
          res.push({ type: "annotation", paper, annotation: a, match: noteHit ? a.note : a.highlightedText });
        }
      }
    }

    for (const [filePath, entries] of Object.entries(conversations)) {
      const paper = allPapers.find((p) => p.filePath === filePath);
      for (const e of entries) {
        const qHit = e.question?.toLowerCase().includes(q);
        const aHit = e.answer?.toLowerCase().includes(q);
        if (qHit || aHit) {
          res.push({ type: "conversation", paper, entry: e, match: qHit ? e.question : e.answer });
        }
      }
    }

    return res.slice(0, 20);
  }, [searchQuery, allPapers, annotations, conversations]);

  const grouped = useMemo(() => {
    return {
      papers: results.filter((r) => r.type === "paper"),
      annotations: results.filter((r) => r.type === "annotation"),
      conversations: results.filter((r) => r.type === "conversation"),
    };
  }, [results]);

  const handleSelect = useCallback((r: SearchResult) => {
    if (r.type === "paper") {
      setActivePaper(r.paper.filePath);
    } else if (r.type === "annotation" && r.paper) {
      setActivePaper(r.paper.filePath);
      setPage(r.annotation.pageNumber);
    } else if (r.type === "conversation" && r.paper) {
      setActivePaper(r.paper.filePath);
      setPage(r.entry.page);
      useAppStore.setState({
        clarifyPanelOpen: true,
        clarifyScrollToEntryId: r.entry.id,
        clarifyMode: "clarify",
      });
    }
    useAppStore.setState({ searchOpen: false, searchQuery: "" });
  }, [setActivePaper, setPage]);

  const close = useCallback(() => {
    useAppStore.setState({ searchOpen: false, searchQuery: "" });
  }, []);

  if (!searchOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/40"
          onClick={close}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ duration: 0.15 }}
          className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => useAppStore.setState({ searchQuery: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
                if (e.key === "Enter" && results.length > 0) handleSelect(results[0]);
              }}
              placeholder="Search papers, notes, AI conversations..."
              className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground/50"
            />
            {searchQuery && (
              <span className="text-[10px] text-muted-foreground/40 tabular-nums shrink-0">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {results.length > 0 && (
            <div className="max-h-[360px] overflow-y-auto px-2 py-2 flex flex-col gap-0.5">
              {grouped.papers.length > 0 && (
                <>
                  <div className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider px-2 py-1 mt-1">Papers</div>
                  {grouped.papers.map((r, i) => {
                    const p = (r as SearchResult & { type: "paper" }).paper;
                    return (
                      <button
                        key={`paper-${i}`}
                        onClick={() => handleSelect(r)}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left hover:bg-secondary transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm text-foreground truncate">{p.title}</span>
                          <span className="text-[10px] text-muted-foreground/50">
                            {p.totalPages > 0 ? `p.${p.lastPage}/${p.totalPages}` : ""}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {grouped.annotations.length > 0 && (
                <>
                  <div className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider px-2 py-1 mt-1">Notes</div>
                  {grouped.annotations.map((r, i) => {
                    const a = (r as SearchResult & { type: "annotation" }).annotation;
                    const p = (r as SearchResult & { type: "annotation" }).paper;
                    return (
                      <button
                        key={`ann-${i}`}
                        onClick={() => handleSelect(r)}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left hover:bg-secondary transition-colors"
                      >
                        <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm text-foreground truncate">
                            {a.note || a.highlightedText?.slice(0, 80) || "(no text)"}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">
                            {p?.title ?? "Unknown paper"} · p.{a.pageNumber}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {grouped.conversations.length > 0 && (
                <>
                  <div className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider px-2 py-1 mt-1">AI Conversations</div>
                  {grouped.conversations.map((r, i) => {
                    const e = (r as SearchResult & { type: "conversation" }).entry;
                    const p = (r as SearchResult & { type: "conversation" }).paper;
                    return (
                      <button
                        key={`conv-${i}`}
                        onClick={() => handleSelect(r)}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left hover:bg-secondary transition-colors"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm text-foreground truncate">
                            {e.question}
                            {e.isBranch && <CornerDownRight className="h-3 w-3 inline ml-1 text-muted-foreground/50" />}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">
                            {p?.title ?? "Unknown paper"} · {e.mode} · p.{e.page}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {searchQuery.length >= 2 && results.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-1 py-12 text-muted-foreground/40 text-sm">
              <Search className="h-5 w-5" />
              <p>No results for "{searchQuery}"</p>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default SearchPanel;
