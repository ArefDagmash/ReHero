import { useMemo } from "react";
import { Compass, Loader2, Check, ExternalLink, Sparkles, RotateCw } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useExploreStore, type CategoryMode } from "@/store/useExploreStore";
import { searchArxiv, ARXIV_CATEGORY_GROUPS, type ArxivPaper } from "@/lib/arxiv";
import { classifyPapers, rankPapers, type ClassificationResult, type RankedPaper } from "@/lib/paperClassifier";
import { fetchCitationCounts } from "@/lib/semanticScholar";
import { addPaperFromBytes } from "@/lib/addPaper";
import LlmModelPicker from "@/components/LlmModelPicker";
import { log } from "@/lib/logger";

const PAGE_SIZE = 20;

// "General" mode offers one option per archive/group (e.g. "Physics" ->
// physics.*); "Detailed" offers the full ~155-category list. Both read from
// the same ARXIV_CATEGORY_GROUPS data — General mode's option value is just
// the group's label, resolved back to its generalValues here.
function resolveCategoryValues(mode: CategoryMode, category: string): string[] {
  if (!category) return [];
  if (mode === "detailed") return [category];
  return ARXIV_CATEGORY_GROUPS.find((g) => g.label === category)?.generalValues ?? [];
}

// 10 discrete steps from red (0-9%) to green (90-100%), solid fill + white
// text so contrast holds regardless of light/sepia/dark theme (a translucent
// tint + colored text would need separate tuning per theme to stay readable).
function scoreColor(score: number): string {
  const clamped = Math.min(100, Math.max(0, score));
  const decile = Math.min(9, Math.floor(clamped / 10));
  const hue = (decile / 9) * 130; // 0 = red, 130 = green
  return `hsl(${hue}, 65%, 42%)`;
}

type ExploreResult = RankedPaper & { citations?: number };

// Scores only the papers that don't have one yet (so "load more" doesn't
// re-score already-classified candidates), then re-ranks the FULL combined
// set — ranking has to see everything together to stay comparable, but
// scoring doesn't need to redo work it already did.
async function classifyAndRank(
  intent: string,
  allPapers: ArxivPaper[],
  papersToScore: ArxivPaper[],
  previousScored: Map<string, ClassificationResult>,
): Promise<{ scoredMap: Map<string, ClassificationResult>; rankedIds: string[] | null }> {
  let scoredMap = previousScored;

  if (papersToScore.length > 0) {
    useExploreStore.setState({ phase: "classifying" });
    try {
      const newScored = await classifyPapers(intent, papersToScore, (current, total) =>
        useExploreStore.setState({ classifyProgress: { current, total } }));
      scoredMap = new Map([...previousScored, ...newScored]);
      if (newScored.size === 0) {
        useExploreStore.setState({ classifyWarning: "Couldn't score the new results — showing them unranked." });
      }
    } catch (e) {
      log.explore.error("classification failed", e);
      useExploreStore.setState({ classifyWarning: "Couldn't score the new results — showing them unranked." });
    }
    useExploreStore.setState({ classifyProgress: null });
  }

  const scoredList = allPapers
    .map((p) => ({ ...p, ...scoredMap.get(p.id) }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  useExploreStore.setState({ phase: "ranking" });
  let rankedIds: string[] | null = null;
  try {
    const order = await rankPapers(intent, scoredList);
    if (order) {
      rankedIds = order;
    } else {
      useExploreStore.setState({ classifyWarning: "Couldn't do a final head-to-head ranking — sorted by individual score instead." });
    }
  } catch (e) {
    log.explore.error("ranking failed", e);
    useExploreStore.setState({ classifyWarning: "Couldn't do a final head-to-head ranking — sorted by individual score instead." });
  }

  return { scoredMap, rankedIds };
}

// Fire-and-forget best-effort enrichment — only queries papers we haven't
// already looked up, and any failure just means those papers show no
// citation stat (never surfaced as an error, per docs/explore-tab-plan.md).
function fetchMissingCitations(papers: ArxivPaper[]) {
  const existing = useExploreStore.getState().citationCounts;
  const missingIds = papers.filter((p) => !existing.has(p.id)).map((p) => p.id);
  if (missingIds.length === 0) return;

  fetchCitationCounts(missingIds).then((fetched) => {
    if (fetched.size === 0) return;
    const merged = new Map([...useExploreStore.getState().citationCounts, ...fetched]);
    useExploreStore.setState({ citationCounts: merged });
  }).catch((e) => log.explore.error("citation fetch failed", e));
}

function ExplorePage() {
  const rightDockWidth = useAppStore((s) => s.rightDockWidth);
  const leftDockWidth = useAppStore((s) => s.leftDockWidth);

  const query = useExploreStore((s) => s.query);
  const categoryMode = useExploreStore((s) => s.categoryMode);
  const category = useExploreStore((s) => s.category);
  const phase = useExploreStore((s) => s.phase);
  const activeAction = useExploreStore((s) => s.activeAction);
  const classifyProgress = useExploreStore((s) => s.classifyProgress);
  const classifyWarning = useExploreStore((s) => s.classifyWarning);
  const error = useExploreStore((s) => s.error);
  const rawPapers = useExploreStore((s) => s.rawPapers);
  const scoredEntries = useExploreStore((s) => s.scoredEntries);
  const citationCounts = useExploreStore((s) => s.citationCounts);
  const rankedIds = useExploreStore((s) => s.rankedIds);
  const sortMode = useExploreStore((s) => s.sortMode);
  const hasSearched = useExploreStore((s) => s.hasSearched);
  const noMoreResults = useExploreStore((s) => s.noMoreResults);
  const addingId = useExploreStore((s) => s.addingId);
  const addedIds = useExploreStore((s) => s.addedIds);
  const addError = useExploreStore((s) => s.addError);

  const busy = phase !== "idle" && phase !== "error";

  // Single derived view combining raw search results + scores + citation
  // counts + rank order + sort mode — so citation counts (which arrive
  // asynchronously, sometimes after the list is already showing) merge in
  // automatically, and switching sort mode is a free client-side re-sort
  // with no re-fetching.
  const results: ExploreResult[] = useMemo(() => {
    const merged: ExploreResult[] = rawPapers.map((p) => ({
      ...p,
      ...scoredEntries.get(p.id),
      citations: citationCounts.get(p.id),
    }));

    if (sortMode === "citations") {
      return [...merged].sort((a, b) => (b.citations ?? -1) - (a.citations ?? -1));
    }

    if (rankedIds) {
      const order = new Map(rankedIds.map((id, i) => [id, i]));
      return [...merged].sort((a, b) => {
        const ra = order.has(a.id) ? order.get(a.id)! : Infinity;
        const rb = order.has(b.id) ? order.get(b.id)! : Infinity;
        return ra - rb;
      });
    }
    return [...merged].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [rawPapers, scoredEntries, citationCounts, rankedIds, sortMode]);

  const hasCitationData = citationCounts.size > 0;

  const handleSearch = async () => {
    const q = query.trim();
    if (!q || busy) return;
    useExploreStore.setState({
      activeAction: "search", phase: "searching", error: null, classifyWarning: null, noMoreResults: false,
    });

    const categoryValues = resolveCategoryValues(categoryMode, category);
    let papers: ArxivPaper[];
    try {
      papers = await searchArxiv(q, { categoryValues, maxResults: PAGE_SIZE });
      log.explore.info("arxiv search results", { query: q, categoryValues, count: papers.length });
    } catch (e: any) {
      log.explore.error("arxiv search failed", e);
      useExploreStore.setState({
        error: e?.message ?? "Search failed.", phase: "error", activeAction: null, hasSearched: true,
      });
      return;
    }

    useExploreStore.setState({
      lastQuery: q,
      lastCategoryValues: categoryValues,
      rawPapers: papers,
      scoredEntries: new Map(),
      citationCounts: new Map(),
      rankedIds: null,
      hasSearched: true,
    });

    if (papers.length === 0) {
      useExploreStore.setState({ phase: "idle", activeAction: null });
      return;
    }

    const { scoredMap, rankedIds: newRankedIds } = await classifyAndRank(q, papers, papers, new Map());
    useExploreStore.setState({ scoredEntries: scoredMap, rankedIds: newRankedIds, phase: "idle", activeAction: null });
    fetchMissingCitations(papers);
  };

  const handleLoadMore = async () => {
    const state = useExploreStore.getState();
    if (busy || !state.lastQuery) return;
    useExploreStore.setState({ activeAction: "loadMore", phase: "searching", error: null, classifyWarning: null });

    let nextBatch: ArxivPaper[];
    try {
      nextBatch = await searchArxiv(state.lastQuery, {
        categoryValues: state.lastCategoryValues,
        maxResults: PAGE_SIZE,
        start: state.rawPapers.length,
      });
      log.explore.info("arxiv load more results", { query: state.lastQuery, start: state.rawPapers.length, count: nextBatch.length });
    } catch (e: any) {
      log.explore.error("arxiv load more failed", e);
      useExploreStore.setState({ error: e?.message ?? "Couldn't load more results.", phase: "error", activeAction: null });
      return;
    }

    if (nextBatch.length === 0) {
      useExploreStore.setState({ noMoreResults: true, phase: "idle", activeAction: null });
      return;
    }

    const merged = [...state.rawPapers, ...nextBatch];
    useExploreStore.setState({ rawPapers: merged });

    const { scoredMap, rankedIds: newRankedIds } = await classifyAndRank(state.lastQuery, merged, nextBatch, state.scoredEntries);
    useExploreStore.setState({ scoredEntries: scoredMap, rankedIds: newRankedIds, phase: "idle", activeAction: null });
    fetchMissingCitations(merged);
  };

  const handleAdd = async (paper: ArxivPaper) => {
    useExploreStore.setState({ addingId: paper.id, addError: null });
    try {
      const res = await fetch(paper.pdfUrl);
      if (!res.ok) throw new Error(`Failed to download PDF (${res.status})`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      // navigate: false — stay on the results list so you can add several
      // candidates in one pass, instead of jumping into the Reader like a
      // manual upload does.
      await addPaperFromBytes(bytes, paper.title, false, { navigate: false });
      useExploreStore.setState((s) => ({ addedIds: new Set(s.addedIds).add(paper.id) }));
    } catch (e: any) {
      log.explore.error("add to library failed", e);
      useExploreStore.setState({ addError: e?.message ?? "Failed to add paper." });
    } finally {
      useExploreStore.setState({ addingId: null });
    }
  };

  const phaseLabel = (forAction: "search" | "loadMore") => {
    if (activeAction !== forAction) return null;
    if (phase === "searching") return forAction === "search" ? "Searching arXiv..." : "Fetching more...";
    if (phase === "classifying") return `Scoring${classifyProgress ? ` (${classifyProgress.current}/${classifyProgress.total})` : "..."}`;
    if (phase === "ranking") return "Comparing top matches...";
    return null;
  };

  return (
    <div
      className="flex-1 flex flex-col bg-background overflow-hidden overflow-y-auto transition-[margin] duration-150"
      style={{ marginRight: rightDockWidth || undefined, marginLeft: leftDockWidth || undefined }}
    >
      <div className="max-w-2xl mx-auto w-full p-8 pb-24">
        <div className="flex items-center gap-2 mb-2">
          <Compass className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-medium text-foreground">Explore</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Describe what you're looking for — the topic, the purpose, what the
          paper should cover — and an AI will search arXiv and rank
          candidates against what you said.
        </p>

        <div className="mb-6 p-3 rounded-lg bg-secondary/40 border border-border/60">
          <LlmModelPicker compact />
        </div>

        <div className="flex flex-col gap-2 mb-6">
          <textarea
            value={query}
            onChange={(e) => useExploreStore.setState({ query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSearch();
            }}
            placeholder="e.g. I'm looking for recent work on real-time hierarchical object detection for traffic sign recognition, ideally with a benchmark comparison"
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <div className="flex items-center gap-2">
            {/* General = one option per archive (e.g. "Physics" -> physics.*);
                Detailed = the full ~155-category list. Switching resets the
                selection since the two modes use different value domains. */}
            <div className="flex rounded-lg border border-border overflow-hidden shrink-0 text-xs">
              <button
                onClick={() => useExploreStore.setState({ categoryMode: "general", category: "" })}
                className={`px-2 py-2 transition-colors ${categoryMode === "general" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}
              >
                General
              </button>
              <button
                onClick={() => useExploreStore.setState({ categoryMode: "detailed", category: "" })}
                className={`px-2 py-2 transition-colors ${categoryMode === "detailed" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}
              >
                Detailed
              </button>
            </div>
            {categoryMode === "general" ? (
              <select
                value={category}
                onChange={(e) => useExploreStore.setState({ category: e.target.value })}
                className="px-2 py-2 rounded-lg bg-card border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring max-w-[220px]"
              >
                <option value="">All categories</option>
                {ARXIV_CATEGORY_GROUPS.map((group) => (
                  <option key={group.label} value={group.label}>{group.label}</option>
                ))}
              </select>
            ) : (
              <select
                value={category}
                onChange={(e) => useExploreStore.setState({ category: e.target.value })}
                className="px-2 py-2 rounded-lg bg-card border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring max-w-[220px]"
              >
                <option value="">All categories</option>
                {ARXIV_CATEGORY_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.categories.map((c) => (
                      <option key={c.value} value={c.value}>{c.label} ({c.value})</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
            <button
              onClick={handleSearch}
              disabled={busy || !query.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
            >
              {activeAction === "search" && busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {phaseLabel("search") ?? "Search"}
            </button>
          </div>
        </div>

        {phase === "error" && (
          <p className="text-sm text-red-500 mb-4">{error}</p>
        )}
        {addError && (
          <p className="text-sm text-red-500 mb-4">{addError}</p>
        )}
        {classifyWarning && (
          <p className="text-xs text-muted-foreground/70 mb-4">{classifyWarning}</p>
        )}
        {hasSearched && phase === "idle" && results.length === 0 && (
          <p className="text-sm text-muted-foreground">No results. Try describing it differently.</p>
        )}

        {results.length > 0 && (
          <div className="flex flex-col gap-4">
            {hasCitationData && (
              <div className="flex items-center gap-2 -mb-2">
                <span className="text-xs text-muted-foreground">Sort by</span>
                <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                  <button
                    onClick={() => useExploreStore.setState({ sortMode: "relevance" })}
                    className={`px-2 py-1 transition-colors ${sortMode === "relevance" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}
                  >
                    Relevance
                  </button>
                  <button
                    onClick={() => useExploreStore.setState({ sortMode: "citations" })}
                    className={`px-2 py-1 transition-colors ${sortMode === "citations" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}
                  >
                    Citations
                  </button>
                </div>
              </div>
            )}

            {results.map((paper, idx) => {
              const isAdding = addingId === paper.id;
              const isAdded = addedIds.has(paper.id);
              return (
                <div
                  key={paper.id}
                  className="p-4 rounded-xl bg-card border border-border/60"
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <a
                      href={paper.arxivUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-foreground hover:underline"
                    >
                      {paper.title}
                    </a>
                    <span className="shrink-0 flex items-center gap-1.5">
                      {typeof paper.score === "number" && (
                        <>
                          <span className="text-xs px-2 py-1 rounded-full font-semibold bg-secondary text-foreground">
                            #{idx + 1}
                          </span>
                          <span
                            className="text-xs px-2 py-1 rounded-full font-semibold text-white"
                            style={{ backgroundColor: scoreColor(paper.score) }}
                          >
                            {paper.score}% fit
                          </span>
                        </>
                      )}
                      {typeof paper.citations === "number" && (
                        <span className="text-xs px-2 py-1 rounded-full font-semibold bg-secondary text-muted-foreground" title="Citations (Semantic Scholar)">
                          {paper.citations.toLocaleString()} cites
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {paper.authors.slice(0, 4).join(", ")}
                    {paper.authors.length > 4 ? " et al." : ""}
                    {paper.published && ` · ${paper.published.slice(0, 10)}`}
                    {paper.categories.length > 0 && ` · ${paper.categories.slice(0, 3).join(", ")}`}
                  </p>
                  <p className="text-xs text-muted-foreground/70 line-clamp-3 mb-2">{paper.summary}</p>
                  {paper.reason && (
                    <p className="flex items-start gap-1 text-xs text-indigo-500 dark:text-indigo-400 mb-3">
                      <Sparkles className="h-3 w-3 shrink-0 mt-0.5" />
                      {paper.reason}
                    </p>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleAdd(paper)}
                      disabled={isAdding || isAdded}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                        isAdded
                          ? "bg-secondary text-muted-foreground"
                          : "bg-foreground text-background hover:opacity-90 disabled:opacity-40"
                      }`}
                    >
                      {isAdding ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isAdded ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : null}
                      {isAdded ? "Added" : isAdding ? "Adding..." : "Add to Library"}
                    </button>
                    <a
                      href={paper.arxivUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      View on arXiv <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              );
            })}

            {noMoreResults ? (
              <p className="text-center text-xs text-muted-foreground/60 py-2">No more results for this search.</p>
            ) : (
              <button
                onClick={handleLoadMore}
                disabled={busy}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {activeAction === "loadMore" && busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" />
                )}
                {phaseLabel("loadMore") ?? "Look through more papers"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ExplorePage;
