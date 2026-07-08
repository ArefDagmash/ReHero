import { create } from "zustand";
import { persist } from "zustand/middleware";
import { deletePdf } from "@/lib/pdfStorage";
import { log } from "@/lib/logger";
import type { Paper, Annotation, StoredEntry, AchievementId, GamificationState } from "@/types";
import {
  getLevelIndex, checkNewAchievements, XP_VALUES, INITIAL_GAMIFICATION_STATS,
} from "@/lib/gamification";

function loadConversations(): Record<string, StoredEntry[]> {
  try {
    const stored = localStorage.getItem("research-reader-conversations");
    if (stored) return JSON.parse(stored);
  } catch (e) {
    log.store.error("Failed to load conversations from localStorage", e);
  }
  return {};
}

function saveConversations(data: Record<string, StoredEntry[]>) {
  try {
    localStorage.setItem("research-reader-conversations", JSON.stringify(data));
  } catch (e) {
    log.store.error("Failed to save conversations to localStorage", e);
  }
}

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

type BgTheme = "dark" | "sepia" | "light";
type DoodleStyle = "underline" | "strikethrough" | "squiggly";
type Sloppiness = "clean" | "medium" | "sloppy";
type LlmProvider = "ollama" | "anthropic" | "openai" | "opencode";

type DoodleRect = { x: number; y: number; w: number; h: number };

type PinnedDoodle = {
  id: string;
  note: string;
  zoom: number;
  rects: DoodleRect[];
};

type AiMarker = {
  id: string;
  zoom: number;
  rects: DoodleRect[];
  text: string;
};

type AppState = {
  papers: Paper[];
  books: Paper[];
  activePaperPath: string | null;
  activeBookPath: string | null;
  currentPage: number;
  zoom: number;
  bgTheme: BgTheme;
  annotations: Record<string, Annotation[]>;
  conversations: Record<string, StoredEntry[]>;

  highlightMenuVisible: boolean;
  highlightText: string;
  highlightRect: { x: number; y: number } | null;

  imageSearchTerm: string;
  imageSearchOpen: boolean;
  drawingOpen: boolean;
  drawingStartDocked: boolean;
  pendingSketchText: string | null;
  rightDockWidth: number;
  leftDockWidth: number;
  clarifyPanelOpen: boolean;
  clarifyHighlightText: string;
  clarifyHighlightRects: { x: number; y: number; w: number; h: number }[];
  clarifyMode: "clarify" | "simplify" | "example" | "recap" | "custom" | "graph";
  clarifyScrollToEntryId: string | null;

  currentDoodleRects: DoodleRect[];
  pinnedDoodles: Record<string, PinnedDoodle[]>;
  aiMarkers: Record<string, AiMarker[]>;

  doodleColor: string;
  doodleStyle: DoodleStyle;
  strokeCount: number;
  sloppiness: Sloppiness;

  llmProvider: LlmProvider;
  llmModel: string;
  // Remembers the last model used per provider, so switching providers back
  // and forth doesn't leave a stale model id from a different provider sitting
  // in `llmModel` (e.g. an OpenCode model name still showing after switching
  // back to Ollama).
  llmModelByProvider: Partial<Record<LlmProvider, string>>;
  ollamaEndpoint: string;
  opencodeEndpoint: string;
  llmTemperature: number;
  llmMaxTokens: number;
  sidebarTab: "home" | "papers" | "books" | "explore" | "settings";

  gamification: GamificationState;
  awardXP: (event: string, context?: { mode?: string; paperPath?: string }) => void;
  dismissToast: () => void;

  annotationPanelOpen: boolean;
  searchOpen: boolean;
  searchQuery: string;

  setBgTheme: (theme: BgTheme) => void;
  setDoodleColor: (color: string) => void;
  setDoodleStyle: (style: DoodleStyle) => void;
  setStrokeCount: (count: number) => void;
  setSloppiness: (level: Sloppiness) => void;
  setLlmProvider: (provider: LlmProvider) => void;
  setLlmModel: (model: string) => void;
  setOllamaEndpoint: (endpoint: string) => void;
  setOpencodeEndpoint: (endpoint: string) => void;
  setLlmTemperature: (temperature: number) => void;
  setLlmMaxTokens: (maxTokens: number) => void;
  setSidebarTab: (tab: "home" | "papers" | "books" | "settings") => void;
  addPinnedDoodle: (key: string, doodle: PinnedDoodle) => void;
  removePinnedDoodle: (key: string, id: string) => void;
  updatePinnedNote: (key: string, id: string, note: string) => void;
  addAiMarker: (key: string, marker: AiMarker) => void;
  removeAiMarker: (key: string, id: string) => void;
  addPaper: (paper: Paper, opts?: { navigate?: boolean }) => void;
  setActivePaper: (path: string | null) => void;
  addBook: (book: Paper, opts?: { navigate?: boolean }) => void;
  setActiveBook: (path: string | null) => void;
  setPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  updatePaperLastPage: (path: string, lastPage: number) => void;
  updatePaperTotalPages: (path: string, totalPages: number) => void;
  addAnnotation: (filePath: string, annotation: Annotation) => void;
  updateAnnotation: (filePath: string, id: string, note: string) => void;
  deleteAnnotation: (filePath: string, id: string) => void;
  saveConversationEntry: (filePath: string, entry: StoredEntry) => void;
  deleteConversationEntry: (filePath: string, id: string) => void;
  clearConversations: (filePath: string) => void;
  removePaper: (id: string) => void;
  removeBook: (id: string) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      papers: [],
      books: [],
      activePaperPath: null,
      activeBookPath: null,
      currentPage: 1,
      zoom: 1.0,
      bgTheme: "light",
      annotations: {},
      conversations: {},
      highlightMenuVisible: false,
      highlightText: "",
      highlightRect: null,

      imageSearchTerm: "",
      imageSearchOpen: false,
      drawingOpen: false,
      drawingStartDocked: false,
      pendingSketchText: null,
      rightDockWidth: 0,
      leftDockWidth: 0,
      clarifyPanelOpen: false,
      clarifyHighlightText: "",
      clarifyHighlightRects: [],
      clarifyMode: "clarify",
      clarifyScrollToEntryId: null,

      currentDoodleRects: [],
      pinnedDoodles: {},
      aiMarkers: {},

      doodleColor: "red",
      doodleStyle: "underline",
      strokeCount: 1,
      sloppiness: "clean",

      llmProvider: "ollama",
      llmModel: "llama3.2",
      llmModelByProvider: { ollama: "llama3.2" },
      ollamaEndpoint: "http://localhost:11434",
      opencodeEndpoint: "https://opencode.ai/zen/go/v1",
      llmTemperature: 0.7,
      llmMaxTokens: 8192,
      sidebarTab: "home",

      gamification: {
        xp: 0,
        level: 0,
        achievements: [],
        stats: { ...INITIAL_GAMIFICATION_STATS },
        pendingToasts: [],
      },

      annotationPanelOpen: false,
      searchOpen: false,
      searchQuery: "",

      awardXP: (event, context) => {
        set((state) => {
          const g = state.gamification;
          const stats = { ...g.stats };
          const now = new Date();
          const today = now.toISOString().slice(0, 10);
          let xp = 0;

          // Update reading run
          if (stats.lastSessionDate !== today) {
            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            stats.readingRunDays = stats.lastSessionDate === yesterday ? stats.readingRunDays + 1 : 1;
            stats.lastSessionDate = today;
          }

          switch (event) {
            case "add_paper":
              stats.papersAdded += 1;
              xp = XP_VALUES.add_paper;
              break;
            case "annotate":
              stats.totalAnnotations += 1;
              xp = XP_VALUES.annotate;
              break;
            case "read_page": {
              if (stats.lastReadDate !== today) {
                stats.lastReadDate = today;
                stats.pagesReadToday = 0;
              }
              if (stats.pagesReadToday >= 15) break; // daily cap
              stats.totalPagesRead += 1;
              stats.pagesReadToday += 1;
              xp = XP_VALUES.read_page;
              break;
            }
            case "ask_ai": {
              stats.totalAiQueries += 1;
              const isGraph = context?.mode === "graph";
              xp = isGraph ? XP_VALUES.ask_ai_graph : XP_VALUES.ask_ai;
              if (isGraph) stats.diagramsGenerated += 1;
              if (context?.mode && context?.paperPath) {
                const modes = stats.aiModesUsedPerPaper[context.paperPath] || [];
                if (!modes.includes(context.mode)) {
                  stats.aiModesUsedPerPaper = {
                    ...stats.aiModesUsedPerPaper,
                    [context.paperPath]: [...modes, context.mode],
                  };
                }
              }
              break;
            }
            case "follow_up":
              stats.totalFollowUps += 1;
              xp = XP_VALUES.follow_up;
              break;
            case "pin_doodle":
              stats.pinnedDoodles += 1;
              xp = XP_VALUES.pin_doodle;
              break;
            case "canvas_push":
              stats.canvasPushes += 1;
              xp = XP_VALUES.canvas_push;
              break;
            case "export_notes":
              stats.exportsDone += 1;
              xp = XP_VALUES.export_notes;
              break;
            case "paper_complete": {
              const path = context?.paperPath;
              if (path && !stats.completedPapers.includes(path)) {
                stats.completedPapers = [...stats.completedPapers, path];
                stats.papersCompleted += 1;
                xp = XP_VALUES.paper_complete;
              }
              break;
            }
          }

          const newXp = g.xp + xp;
          const newLevel = getLevelIndex(newXp);
          const alreadyUnlocked = new Set(g.achievements.map((a) => a.id as AchievementId));
          const newAchievementIds = checkNewAchievements(stats, newLevel, alreadyUnlocked);
          const newAchievements = newAchievementIds.map((id) => ({ id, unlockedAt: now.toISOString() }));
          const addToast = xp > 0 || newAchievementIds.length > 0;

          return {
            gamification: {
              ...g,
              xp: newXp,
              level: newLevel,
              achievements: [...g.achievements, ...newAchievements],
              stats,
              pendingToasts: addToast
                ? [...g.pendingToasts, { xp, achievementIds: newAchievementIds }]
                : g.pendingToasts,
            },
          };
        });
      },

      dismissToast: () => {
        set((state) => ({
          gamification: {
            ...state.gamification,
            pendingToasts: state.gamification.pendingToasts.slice(1),
          },
        }));
      },

      addPaper: (paper, opts) => {
        const navigate = opts?.navigate ?? true;
        const exists = get().papers.find((p) => p.filePath === paper.filePath);
        set((state) => {
          if (exists) {
            log.store.info("Paper already exists, setting active", { title: paper.title });
            return navigate ? { activePaperPath: paper.filePath } : {};
          }
          log.store.info("Adding new paper", { title: paper.title, id: paper.id, totalPapers: state.papers.length + 1 });
          return navigate
            ? { papers: [...state.papers, paper], activePaperPath: paper.filePath }
            : { papers: [...state.papers, paper] };
        });
        if (!exists) get().awardXP("add_paper");
      },

      addBook: (book, opts) => {
        const navigate = opts?.navigate ?? true;
        const exists = get().books.find((b) => b.filePath === book.filePath);
        set((state) => {
          if (exists) return navigate ? { activeBookPath: book.filePath } : {};
          return navigate
            ? { books: [...state.books, book], activeBookPath: book.filePath }
            : { books: [...state.books, book] };
        });
        if (!exists) get().awardXP("add_paper");
      },

      setActivePaper: (path) => {
        log.store.info("Setting active paper", { path: path?.slice(0, 60) ?? "null" });
        set((state) => ({
          activePaperPath: path,
          currentPage: path
            ? (state.papers.find((p) => p.filePath === path)?.lastPage ?? 1)
            : 1,
          papers: path
            ? state.papers.map((p) =>
                p.filePath === path ? { ...p, lastOpenedAt: new Date().toISOString() } : p,
              )
            : state.papers,
        }));
      },

      setActiveBook: (path) => {
        set((state) => ({
          activeBookPath: path,
          activePaperPath: path,
          currentPage: path
            ? (state.books.find((b) => b.filePath === path)?.lastPage ?? 1)
            : 1,
          books: path
            ? state.books.map((b) =>
                b.filePath === path ? { ...b, lastOpenedAt: new Date().toISOString() } : b,
              )
            : state.books,
        }));
      },

      setPage: (page) => {
        log.store.debug("Setting page", { page });
        const s = get();
        const target = s.papers.find((p) => p.filePath === s.activePaperPath)
          ?? s.books.find((b) => b.filePath === s.activePaperPath);
        const isNewPage = !!target && page > target.lastPage;
        const isFirstCompletion = !!target && target.totalPages > 0
          && page >= target.totalPages && target.lastPage < target.totalPages;
        set((state) => {
          const paper = state.papers.find((p) => p.filePath === state.activePaperPath);
          const book = state.books.find((b) => b.filePath === state.activePaperPath);
          const t = paper ?? book;
          if (t && page > t.lastPage) {
            return {
              currentPage: page,
              papers: state.papers.map((p) =>
                p.filePath === state.activePaperPath ? { ...p, lastPage: page } : p,
              ),
              books: state.books.map((b) =>
                b.filePath === state.activePaperPath ? { ...b, lastPage: page } : b,
              ),
            };
          }
          return { currentPage: page };
        });
        if (isNewPage) get().awardXP("read_page");
        if (isFirstCompletion && s.activePaperPath) {
          get().awardXP("paper_complete", { paperPath: s.activePaperPath });
        }
      },

      setZoom: (zoom) => {
        log.store.debug("Setting zoom", { zoom });
        set({ zoom });
      },

      setBgTheme: (bgTheme) => {
        log.store.info("Setting bg theme", { bgTheme });
        set({ bgTheme });
      },

      setDoodleColor: (doodleColor) => set({ doodleColor }),
      setDoodleStyle: (doodleStyle) => set({ doodleStyle }),
      setStrokeCount: (strokeCount) => set({ strokeCount }),
      setSloppiness: (sloppiness) => set({ sloppiness }),

      setLlmProvider: (llmProvider) => set((state) => ({
        llmProvider,
        llmModel: state.llmModelByProvider[llmProvider] ?? "",
      })),
      setLlmModel: (llmModel) => set((state) => ({
        llmModel,
        llmModelByProvider: { ...state.llmModelByProvider, [state.llmProvider]: llmModel },
      })),
      setOllamaEndpoint: (ollamaEndpoint) => set({ ollamaEndpoint }),
      setOpencodeEndpoint: (opencodeEndpoint) => set({ opencodeEndpoint }),
      setLlmTemperature: (llmTemperature) => set({ llmTemperature }),
      setLlmMaxTokens: (llmMaxTokens) => set({ llmMaxTokens }),
      setSidebarTab: (sidebarTab) => set({ sidebarTab }),

      addPinnedDoodle: (key, doodle) => {
        set((state) => ({
          pinnedDoodles: {
            ...state.pinnedDoodles,
            [key]: [...(state.pinnedDoodles[key] || []), doodle],
          },
        }));
        get().awardXP("pin_doodle");
      },

      removePinnedDoodle: (key, id) =>
        set((state) => ({
          pinnedDoodles: {
            ...state.pinnedDoodles,
            [key]: (state.pinnedDoodles[key] || []).filter((d) => d.id !== id),
          },
        })),

      updatePinnedNote: (key, id, note) =>
        set((state) => ({
          pinnedDoodles: {
            ...state.pinnedDoodles,
            [key]: (state.pinnedDoodles[key] || []).map((d) =>
              d.id === id ? { ...d, note } : d,
            ),
          },
        })),

      addAiMarker: (key, marker) =>
        set((state) => ({
          aiMarkers: {
            ...state.aiMarkers,
            [key]: [...(state.aiMarkers[key] || []), marker],
          },
        })),

      removeAiMarker: (key, id) =>
        set((state) => ({
          aiMarkers: {
            ...state.aiMarkers,
            [key]: (state.aiMarkers[key] || []).filter((m) => m.id !== id),
          },
        })),

      updatePaperLastPage: (path, lastPage) =>
        set((state) => {
          log.store.debug("Updating paper lastPage", { path: path.slice(0, 60), lastPage });
          return {
            papers: state.papers.map((p) =>
              p.filePath === path ? { ...p, lastPage } : p,
            ),
            books: state.books.map((b) =>
              b.filePath === path ? { ...b, lastPage } : b,
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
            books: state.books.map((b) =>
              b.filePath === path ? { ...b, totalPages } : b,
            ),
          };
        }),

      addAnnotation: (filePath, annotation) => {
        log.store.info("Adding annotation", { filePath: filePath.slice(0, 60), id: annotation.id, pageNumber: annotation.pageNumber });
        const current = { ...get().annotations };
        current[filePath] = [...(current[filePath] || []), annotation];
        set({ annotations: current });
        saveAnnotations(current);
        get().awardXP("annotate");
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

      saveConversationEntry: (filePath, entry) => {
        const current = { ...get().conversations };
        const entries = current[filePath] || [];
        if (entries.some((e) => e.id === entry.id)) return;
        current[filePath] = [...entries, entry].slice(-50);
        set({ conversations: current });
        saveConversations(current);
      },

      deleteConversationEntry: (filePath, id) => {
        const current = { ...get().conversations };
        const entry = (current[filePath] || []).find((e) => e.id === id);
        current[filePath] = (current[filePath] || []).filter((e) => e.id !== id);
        const markers = { ...get().aiMarkers };
        if (entry) {
          const markerKey = `${filePath}-${entry.page}`;
          markers[markerKey] = (markers[markerKey] || []).filter((m) => m.id !== id);
        }
        set({ conversations: current, aiMarkers: markers });
        saveConversations(current);
      },

      clearConversations: (filePath) => {
        const current = { ...get().conversations };
        delete current[filePath];
        const markers = { ...get().aiMarkers };
        for (const key of Object.keys(markers)) {
          if (key.startsWith(filePath)) delete markers[key];
        }
        set({ conversations: current, aiMarkers: markers });
        saveConversations(current);
      },

      removePaper: (id) => {
        const state = get();
        const paper = state.papers.find((p) => p.id === id);
        if (!paper) return;

        log.store.info("Removing paper", { id, title: paper.title });

        if (paper.filePath.startsWith("idb://")) {
          deletePdf(id).catch(() => {});
        }

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

        const convs = { ...get().conversations };
        delete convs[paper.filePath];
        set({ conversations: convs });
        saveConversations(convs);
      },

      removeBook: (id) => {
        const state = get();
        const book = state.books.find((b) => b.id === id);
        if (!book) return;

        if (book.filePath.startsWith("idb://")) {
          deletePdf(id).catch(() => {});
        }

        if (state.activeBookPath === book.filePath) {
          const remaining = state.books.filter((b) => b.id !== id);
          set({
            books: remaining,
            activeBookPath: remaining.length > 0 ? remaining[remaining.length - 1].filePath : null,
            activePaperPath: remaining.length > 0 ? remaining[remaining.length - 1].filePath : null,
          });
        } else {
          set({
            books: state.books.filter((b) => b.id !== id),
          });
        }

        const anns = { ...get().annotations };
        delete anns[book.filePath];
        set({ annotations: anns });
        saveAnnotations(anns);

        const convs = { ...get().conversations };
        delete convs[book.filePath];
        set({ conversations: convs });
        saveConversations(convs);
      },
    }),
    {
      name: "research-reader-papers",
      partialize: (state) => ({
        papers: state.papers,
        books: state.books,
        activePaperPath: state.activePaperPath,
        activeBookPath: state.activeBookPath,
        currentPage: state.currentPage,
        zoom: state.zoom,
        bgTheme: state.bgTheme,
        pinnedDoodles: state.pinnedDoodles,
        aiMarkers: state.aiMarkers,
        conversations: state.conversations,
        llmProvider: state.llmProvider,
        llmModel: state.llmModel,
        llmModelByProvider: state.llmModelByProvider,
        ollamaEndpoint: state.ollamaEndpoint,
        opencodeEndpoint: state.opencodeEndpoint,
        llmTemperature: state.llmTemperature,
        llmMaxTokens: state.llmMaxTokens,
        sidebarTab: state.sidebarTab,
        gamification: state.gamification,
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
            // Migrate conversations from the old separate key if the partialize blob has none yet
            const rehydratedConvs = useAppStore.getState().conversations;
            const hasConvs = Object.keys(rehydratedConvs).length > 0;
            const legacyConvs = hasConvs ? null : loadConversations();
            useAppStore.setState({ annotations, ...(legacyConvs ? { conversations: legacyConvs } : {}) });
          }
        };
      },
    },
  ),
);
