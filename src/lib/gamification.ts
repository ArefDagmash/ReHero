import type { AchievementId, GamificationStats } from "@/types";

export const LEVELS = [
  { xp: 0,    title: "Newcomer",    flavor: "You've opened the first door." },
  { xp: 100,  title: "Reader",      flavor: "The pages are starting to speak." },
  { xp: 300,  title: "Annotator",   flavor: "Your marks matter." },
  { xp: 700,  title: "Scholar",     flavor: "You don't just read — you understand." },
  { xp: 1500, title: "Researcher",  flavor: "The library bends to your will." },
  { xp: 3000, title: "Deep Thinker",flavor: "You've gone where most don't follow." },
  { xp: 6000, title: "Archivist",   flavor: "Knowledge, accumulated. Wisdom, earned." },
];

export function getLevelIndex(xp: number): number {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xp) idx = i;
  }
  return idx;
}

export function getXpForNextLevel(levelIdx: number): number {
  return LEVELS[levelIdx + 1]?.xp ?? LEVELS[LEVELS.length - 1].xp;
}

export const XP_VALUES: Record<string, number> = {
  add_paper:      20,
  annotate:       15,
  read_page:       2,
  ask_ai:         10,
  ask_ai_graph:   20,
  follow_up:      15,
  pin_doodle:     12,
  canvas_push:    15,
  export_notes:   30,
  paper_complete: 50,
};

export type AchievementDef = {
  id: AchievementId;
  name: string;
  description: string;
  icon: string;
  rarity: "common" | "uncommon" | "rare" | "legendary" | "secret";
  secret?: boolean;
};

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: "first_paper",      name: "First Page",         icon: "📄", description: "Added your first paper.",                             rarity: "common" },
  { id: "curious_mind",     name: "Curious Mind",       icon: "💡", description: "Asked your first AI question.",                      rarity: "common" },
  { id: "ink_on_page",      name: "Ink on the Page",    icon: "✏️", description: "Made your first annotation.",                        rarity: "common" },
  { id: "the_sketcher",     name: "The Sketcher",       icon: "🎨", description: "Pinned your first doodle.",                          rarity: "common" },
  { id: "diagrammer",       name: "Diagrammer",         icon: "🗺️", description: "Generated your first knowledge diagram.",            rarity: "uncommon" },
  { id: "deep_diver",       name: "Deep Diver",         icon: "🤿", description: "Asked a follow-up inside an AI response.",           rarity: "uncommon" },
  { id: "the_annotator",    name: "The Annotator",      icon: "📚", description: "Left 25 annotations across your library.",           rarity: "uncommon" },
  { id: "full_spectrum",    name: "Full Spectrum",       icon: "🌈", description: "Used all 6 AI modes on a single paper.",             rarity: "rare" },
  { id: "hundred_pages",    name: "Hundred Pages",      icon: "💯", description: "Read 100 pages total across all papers.",            rarity: "uncommon" },
  { id: "thousand_pages",   name: "Thousand Pages",     icon: "🏛️", description: "Read 1,000 pages. You're the real thing.",           rarity: "rare" },
  { id: "paper_trail",      name: "Paper Trail",        icon: "🗂️", description: "Added 10 papers to your library.",                   rarity: "uncommon" },
  { id: "finished_strong",  name: "Finished Strong",    icon: "🏁", description: "Reached the last page of a paper.",                  rarity: "uncommon" },
  { id: "the_synthesizer",  name: "The Synthesizer",    icon: "📤", description: "Exported your research notes to Markdown.",          rarity: "rare" },
  { id: "canvas_mind",      name: "Canvas Mind",        icon: "🖼️", description: "Pushed a diagram to the sketch canvas.",             rarity: "rare" },
  { id: "fifty_sparks",     name: "Fifty Sparks",       icon: "✨", description: "50 AI conversations saved across your library.",     rarity: "rare" },
  { id: "night_scholar",    name: "Night Scholar",      icon: "🌙", description: "Some questions can only be asked after midnight.",   rarity: "secret", secret: true },
  { id: "the_completionist",name: "The Completionist",  icon: "🎓", description: "Finished 5 papers (reached the last page on each).", rarity: "legendary" },
  { id: "grand_scholar",    name: "Grand Scholar",      icon: "🏆", description: "Reached Researcher rank.",                          rarity: "legendary" },
];

export const RARITY_COLORS: Record<string, string> = {
  common:     "text-muted-foreground",
  uncommon:   "text-emerald-500",
  rare:       "text-blue-500",
  legendary:  "text-amber-500",
  secret:     "text-purple-500",
};

export function checkNewAchievements(
  stats: GamificationStats,
  level: number,
  alreadyUnlocked: Set<AchievementId>,
): AchievementId[] {
  const earned: AchievementId[] = [];
  const check = (id: AchievementId, condition: boolean) => {
    if (condition && !alreadyUnlocked.has(id)) earned.push(id);
  };

  check("first_paper",       stats.papersAdded >= 1);
  check("curious_mind",      stats.totalAiQueries >= 1);
  check("ink_on_page",       stats.totalAnnotations >= 1);
  check("the_sketcher",      stats.pinnedDoodles >= 1);
  check("diagrammer",        stats.diagramsGenerated >= 1);
  check("deep_diver",        stats.totalFollowUps >= 1);
  check("the_annotator",     stats.totalAnnotations >= 25);
  check("full_spectrum",     Object.values(stats.aiModesUsedPerPaper).some((modes) => {
    const s = new Set(modes);
    return ["simplify", "clarify", "example", "recap", "graph", "custom"].every((m) => s.has(m));
  }));
  check("hundred_pages",     stats.totalPagesRead >= 100);
  check("thousand_pages",    stats.totalPagesRead >= 1000);
  check("paper_trail",       stats.papersAdded >= 10);
  check("finished_strong",   stats.papersCompleted >= 1);
  check("the_synthesizer",   stats.exportsDone >= 1);
  check("canvas_mind",       stats.canvasPushes >= 1);
  check("fifty_sparks",      stats.totalAiQueries >= 50);
  check("night_scholar",     new Date().getHours() < 4);
  check("the_completionist", stats.papersCompleted >= 5);
  check("grand_scholar",     level >= 4); // index 4 = "Researcher"

  return earned;
}

export const INITIAL_GAMIFICATION_STATS: GamificationStats = {
  totalPagesRead: 0,
  totalAnnotations: 0,
  totalAiQueries: 0,
  totalFollowUps: 0,
  papersCompleted: 0,
  completedPapers: [],
  papersAdded: 0,
  diagramsGenerated: 0,
  canvasPushes: 0,
  exportsDone: 0,
  pinnedDoodles: 0,
  aiModesUsedPerPaper: {},
  lastSessionDate: null,
  readingRunDays: 0,
  lastReadDate: null,
  pagesReadToday: 0,
};
