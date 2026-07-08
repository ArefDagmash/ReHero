export type Paper = {
  id: string;
  title: string;
  filePath: string;
  totalPages: number;
  lastPage: number;
  tags: string[];
  lastOpenedAt?: string;
  thumbnailUrl?: string;
};

export type Annotation = {
  id: string;
  pageNumber: number;
  highlightedText: string;
  note: string;
  createdAt: string;
};

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type StoredEntry = {
  id: string;
  question: string;
  answer: string;
  sourceHighlight?: string;
  mode: string;
  page: number;
  timestamp: string;
  threadId?: string; // set on continuation entries; points to the root entry's id
  isBranch?: boolean; // true for entries created via the floating Branch button
};

export type AchievementId =
  | "first_paper" | "curious_mind" | "ink_on_page" | "the_sketcher"
  | "diagrammer" | "deep_diver" | "the_annotator" | "full_spectrum"
  | "hundred_pages" | "thousand_pages" | "paper_trail" | "finished_strong"
  | "the_synthesizer" | "canvas_mind" | "fifty_sparks"
  | "night_scholar" | "the_completionist" | "grand_scholar";

export type UnlockedAchievement = {
  id: AchievementId;
  unlockedAt: string;
};

export type GamificationStats = {
  totalPagesRead: number;
  totalAnnotations: number;
  totalAiQueries: number;
  totalFollowUps: number;
  papersCompleted: number;
  completedPapers: string[];
  papersAdded: number;
  diagramsGenerated: number;
  canvasPushes: number;
  exportsDone: number;
  pinnedDoodles: number;
  aiModesUsedPerPaper: Record<string, string[]>;
  lastSessionDate: string | null;
  readingRunDays: number;
  lastReadDate: string | null;
  pagesReadToday: number;
};

export type GamificationState = {
  xp: number;
  level: number;
  achievements: UnlockedAchievement[];
  stats: GamificationStats;
  pendingToasts: Array<{ xp: number; achievementIds: AchievementId[] }>;
};
