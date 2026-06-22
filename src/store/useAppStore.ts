import { create } from "zustand";
import { persist } from "zustand/middleware";
import { log } from "@/lib/logger";
import type { Paper, Annotation } from "@/types";

function loadAnnotations(): Record<string, Annotation[]> {
  try {
    const stored = localStorage.getItem("research-reader-annotations");
    if (stored) {
      const data = JSON.parse(stored);
      log.store.info("Annotations loaded from localStorage", { keyCount: Object.keys(data).length });
      return data;
    }
  } catch (e) {
    log.store.error("Failed to load annotations from localStorage", e);
  }
  log.store.debug("No annotations in localStorage");
  return {};
}

function saveAnnotations(data: Record<string, Annotation[]>) {
  try {
    localStorage.setItem("research-reader-annotations", JSON.stringify(data));
    log.store.debug("Annotations saved to localStorage", { keyCount: Object.keys(data).length });
  } catch (e) {
    log.store.error("Failed to save annotations to localStorage", e);
  }
}

type AppState = {
  papers: Paper[];
  activePaperPath: string | null;
  currentPage: number;
  zoom: number;
  annotations: Record<string, Annotation[]>;

  highlightMenuVisible: boolean;
  highlightText: string;
  highlightRect: { x: number; y: number } | null;

  addPaper: (paper: Paper) => void;
  setActivePaper: (path: string | null) => void;
  setPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  updatePaperLastPage: (path: string, lastPage: number) => void;
  updatePaperTotalPages: (path: string, totalPages: number) => void;
  addAnnotation: (filePath: string, annotation: Annotation) => void;
  updateAnnotation: (filePath: string, id: string, note: string) => void;
  deleteAnnotation: (filePath: string, id: string) => void;
  removePaper: (id: string) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      papers: [],
      activePaperPath: null,
      currentPage: 1,
      zoom: 1.0,
      annotations: {},
      highlightMenuVisible: false,
      highlightText: "",
      highlightRect: null,

      addPaper: (paper) =>
        set((state) => {
          const exists = state.papers.find((p) => p.filePath === paper.filePath);
          if (exists) {
            log.store.info("Paper already exists, setting active", { title: paper.title });
            return { activePaperPath: paper.filePath };
          }
          log.store.info("Adding new paper", { title: paper.title, id: paper.id, totalPapers: state.papers.length + 1 });
          return {
            papers: [...state.papers, paper],
            activePaperPath: paper.filePath,
          };
        }),

      setActivePaper: (path) => {
        log.store.info("Setting active paper", { path: path?.slice(0, 60) ?? "null" });
        set((state) => ({
          activePaperPath: path,
          currentPage: path
            ? (state.papers.find((p) => p.filePath === path)?.lastPage ?? 1)
            : 1,
        }));
      },

      setPage: (page) => {
        log.store.debug("Setting page", { page });
        set({ currentPage: page });
      },

      setZoom: (zoom) => {
        log.store.debug("Setting zoom", { zoom });
        set({ zoom });
      },

      updatePaperLastPage: (path, lastPage) =>
        set((state) => {
          log.store.debug("Updating paper lastPage", { path: path.slice(0, 60), lastPage });
          return {
            papers: state.papers.map((p) =>
              p.filePath === path ? { ...p, lastPage } : p,
            ),
          };
        }),

      updatePaperTotalPages: (path, totalPages) =>
        set((state) => {
          log.store.info("Updating paper totalPages", { path: path.slice(0, 60), totalPages });
          return {
            papers: state.papers.map((p) =>
              p.filePath === path ? { ...p, totalPages } : p,
            ),
          };
        }),

      addAnnotation: (filePath, annotation) => {
        log.store.info("Adding annotation", { filePath: filePath.slice(0, 60), id: annotation.id, pageNumber: annotation.pageNumber });
        const current = { ...get().annotations };
        current[filePath] = [...(current[filePath] || []), annotation];
        set({ annotations: current });
        saveAnnotations(current);
      },

      updateAnnotation: (filePath, id, note) => {
        log.store.debug("Updating annotation", { id, noteLength: note.length });
        const current = { ...get().annotations };
        current[filePath] = (current[filePath] || []).map((a) =>
          a.id === id ? { ...a, note } : a,
        );
        set({ annotations: current });
        saveAnnotations(current);
      },

      deleteAnnotation: (filePath, id) => {
        log.store.info("Deleting annotation", { id });
        const current = { ...get().annotations };
        current[filePath] = (current[filePath] || []).filter(
          (a) => a.id !== id,
        );
        set({ annotations: current });
        saveAnnotations(current);
      },

      removePaper: (id) => {
        const state = get();
        const paper = state.papers.find((p) => p.id === id);
        if (!paper) return;

        log.store.info("Removing paper", { id, title: paper.title });

        if (state.activePaperPath === paper.filePath) {
          const remaining = state.papers.filter((p) => p.id !== id);
          set({
            papers: remaining,
            activePaperPath: remaining.length > 0 ? remaining[remaining.length - 1].filePath : null,
          });
        } else {
          set({
            papers: state.papers.filter((p) => p.id !== id),
          });
        }

        const anns = { ...get().annotations };
        delete anns[paper.filePath];
        set({ annotations: anns });
        saveAnnotations(anns);
      },
    }),
    {
      name: "research-reader-papers",
      partialize: (state) => ({
        papers: state.papers,
        activePaperPath: state.activePaperPath,
        currentPage: state.currentPage,
        zoom: state.zoom,
      }),
      onRehydrateStorage: () => {
        log.store.info("Store rehydrating from persist middleware");
        return (state, error) => {
          if (error) {
            log.store.error("Store rehydration failed", error);
          } else {
            log.store.info("Store rehydrated successfully", {
              paperCount: state?.papers.length ?? 0,
              activePaperPath: (state?.activePaperPath ?? "").slice(0, 60),
            });
            const annotations = loadAnnotations();
            useAppStore.setState({ annotations });
          }
        };
      },
    },
  ),
);
