import { create } from "zustand";
import type { ArxivPaper } from "@/lib/arxiv";
import type { ClassificationResult } from "@/lib/paperClassifier";

export type CategoryMode = "general" | "detailed";
export type ExplorePhase = "idle" | "searching" | "classifying" | "ranking" | "error";
export type ExploreSortMode = "relevance" | "citations";

// Separate from useAppStore (not persisted — in-memory only, per
// docs/explore-tab-plan.md Phase 3) so a search survives navigating away
// from the Explore tab and back. Since this lives outside React entirely,
// an in-flight search/classify/rank keeps running in the background even
// while ExplorePage is unmounted, and the result is there when you return.
type ExploreStoreState = {
  query: string;
  categoryMode: CategoryMode;
  category: string;

  // What was actually searched — "Look through more papers" continues
  // this, independent of whatever's currently typed/selected in the form.
  lastQuery: string;
  lastCategoryValues: string[];

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
};

const initialState: ExploreStoreState = {
  query: "",
  categoryMode: "general",
  category: "",
  lastQuery: "",
  lastCategoryValues: [],
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
};

export const useExploreStore = create<ExploreStoreState>(() => initialState);
