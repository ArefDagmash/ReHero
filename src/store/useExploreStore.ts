import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArxivPaper } from "@/lib/arxiv";
import type { DoabBook } from "@/lib/doab";
import type { ClassificationResult } from "@/lib/paperClassifier";

export type CategoryMode = "general" | "detailed";
export type ExplorePhase = "idle" | "rewriting" | "searching" | "classifying" | "ranking" | "error";
export type ExploreSortMode = "relevance" | "citations";
// Papers = arXiv, Books = DOAB (see docs/explore-books-plan.md). Books mode
// has its own, simpler phase enum for now — no query rewriting or AI
// classification yet (Phase 0/1 only), unlike Papers' full pipeline.
export type ExploreMode = "papers" | "books";
export type BooksPhase = "idle" | "searching" | "error";

export type SavedSearch = {
  query: string;
  categoryMode: CategoryMode;
  category: string;
  searchedAt: string;
};

const MAX_SAVED_SEARCHES = 8;

// Separate from useAppStore (not persisted — in-memory only, per
// docs/explore-tab-plan.md Phase 3) so a search survives navigating away
// from the Explore tab and back. Since this lives outside React entirely,
// an in-flight search/classify/rank keeps running in the background even
// while ExplorePage is unmounted, and the result is there when you return.
// The one exception is `searchHistory` (Phase 4's "save/revisit past
// searches") — that's the one piece of Explore state meant to survive an
// app restart, so it's the only thing in this store's persist partialize.
type ExploreStoreState = {
  mode: ExploreMode;

  query: string;
  categoryMode: CategoryMode;
  category: string;

  // What was actually searched — "Look through more papers" continues
  // this, independent of whatever's currently typed/selected in the form.
  lastQuery: string;
  lastCategoryValues: string[];
  // The arXiv-side phrases actually used for the search (post query-rewrite,
  // or just [lastQuery] if rewriting was skipped/failed) — "load more"
  // reuses these directly rather than re-rewriting on every page.
  lastSearchPhrases: string[];

  phase: ExplorePhase;
  activeAction: "search" | "loadMore" | null;
  classifyProgress: { current: number; total: number } | null;
  classifyWarning: string | null;
  error: string | null;

  rawPapers: ArxivPaper[];
  scoredEntries: Map<string, ClassificationResult>;
  citationCounts: Map<string, number>;
  // Order from the last successful comparative ranking pass — the displayed
  // list is derived from rawPapers + scoredEntries + citationCounts +
  // rankedIds + sortMode in ExplorePage.tsx, not stored as its own array,
  // so citation counts (which arrive asynchronously) merge in automatically.
  rankedIds: string[] | null;
  sortMode: ExploreSortMode;
  hasSearched: boolean;
  noMoreResults: boolean;

  addingId: string | null;
  addedIds: Set<string>;
  addError: string | null;

  // Books (DOAB) — Phase 0/1: plain search only, no rewriting/classify/
  // rank/citations yet.
  lastBookQuery: string;
  booksPhase: BooksPhase;
  booksActiveAction: "search" | "loadMore" | null;
  booksError: string | null;
  rawBooks: DoabBook[];
  hasSearchedBooks: boolean;
  noMoreBookResults: boolean;

  searchHistory: SavedSearch[];
};

const initialState: Omit<ExploreStoreState, "searchHistory"> = {
  mode: "papers",
  query: "",
  categoryMode: "general",
  category: "",
  lastQuery: "",
  lastCategoryValues: [],
  lastSearchPhrases: [],
  phase: "idle",
  activeAction: null,
  classifyProgress: null,
  classifyWarning: null,
  error: null,
  rawPapers: [],
  scoredEntries: new Map(),
  citationCounts: new Map(),
  rankedIds: null,
  sortMode: "relevance",
  hasSearched: false,
  noMoreResults: false,
  addingId: null,
  addedIds: new Set(),
  addError: null,
  lastBookQuery: "",
  booksPhase: "idle",
  booksActiveAction: null,
  booksError: null,
  rawBooks: [],
  hasSearchedBooks: false,
  noMoreBookResults: false,
};

export const useExploreStore = create<ExploreStoreState>()(
  persist(
    () => ({ ...initialState, searchHistory: [] }),
    {
      name: "explore-search-history",
      partialize: (state) => ({ searchHistory: state.searchHistory }),
    },
  ),
);

// Records a search into the persisted history: moves it to the front if
// the same query+category was already saved (dedup, case-insensitive on
// the query text) rather than piling up near-duplicates, capped at
// MAX_SAVED_SEARCHES.
export function recordSearchHistory(query: string, categoryMode: CategoryMode, category: string) {
  const entry: SavedSearch = { query, categoryMode, category, searchedAt: new Date().toISOString() };
  const existing = useExploreStore.getState().searchHistory;
  const deduped = existing.filter(
    (s) => !(s.query.toLowerCase() === query.toLowerCase() && s.categoryMode === categoryMode && s.category === category),
  );
  useExploreStore.setState({ searchHistory: [entry, ...deduped].slice(0, MAX_SAVED_SEARCHES) });
}

export function removeSearchHistoryEntry(searchedAt: string) {
  useExploreStore.setState((s) => ({ searchHistory: s.searchHistory.filter((e) => e.searchedAt !== searchedAt) }));
}
