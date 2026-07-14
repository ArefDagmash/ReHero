import { Trophy } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { ACHIEVEMENT_DEFS, LEVELS, getXpForNextLevel, RARITY_COLORS } from "@/lib/gamification";

// Promoted out of SettingsPage's compact "Scholar XP" section into its own
// tab — same data, just given the room a full page allows (bigger
// achievement cards with descriptions always visible instead of tooltip-only,
// and the full stats breakdown instead of just 3 of them).
function AchievementsPage() {
  const rightDockWidth = useAppStore((s) => s.rightDockWidth);
  const leftDockWidth = useAppStore((s) => s.leftDockWidth);
  const { xp, level, achievements, stats } = useAppStore((s) => s.gamification);

  const levelInfo = LEVELS[level];
  const nextLevelXp = getXpForNextLevel(level);
  const prevLevelXp = LEVELS[level]?.xp ?? 0;
  const range = nextLevelXp - prevLevelXp;
  const progress = range > 0 ? Math.min(100, ((xp - prevLevelXp) / range) * 100) : 100;
  const isMaxLevel = level >= LEVELS.length - 1;
  const unlockedIds = new Set(achievements.map((a) => a.id));

  const statEntries = [
    { label: "Pages read", value: stats.totalPagesRead },
    { label: "AI queries", value: stats.totalAiQueries },
    { label: "Annotations", value: stats.totalAnnotations },
    { label: "Papers added", value: stats.papersAdded },
    { label: "Papers completed", value: stats.papersCompleted },
    { label: "Follow-up questions", value: stats.totalFollowUps },
    { label: "Diagrams generated", value: stats.diagramsGenerated },
    { label: "Doodles pinned", value: stats.pinnedDoodles },
    { label: "Reading streak (days)", value: stats.readingRunDays },
  ];

  return (
    <div
      className="flex-1 flex flex-col bg-background overflow-hidden overflow-y-auto transition-[margin] duration-150"
      style={{ marginRight: rightDockWidth || undefined, marginLeft: leftDockWidth || undefined }}
    >
      <div className="max-w-3xl mx-auto w-full p-8 pb-24">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-medium text-foreground">Achievements</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Your Scholar XP, level, and everything you've unlocked so far.
        </p>

        {/* Level + XP bar */}
        <div className="flex flex-col gap-1.5 mb-6 p-4 rounded-xl bg-card border border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-muted-foreground/70 tabular-nums align-middle mr-1.5">
                Level {level + 1}/{LEVELS.length}
              </span>
              <span className="text-base font-medium text-foreground">{levelInfo.title}</span>
              <span className="text-xs text-muted-foreground/50 ml-2 italic">{levelInfo.flavor}</span>
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">
              {xp.toLocaleString()} XP
            </span>
          </div>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground/30 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          {!isMaxLevel && (
            <p className="text-xs text-muted-foreground/40">
              {nextLevelXp - xp} XP until {LEVELS[level + 1]?.title}
            </p>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {statEntries.map(({ label, value }) => (
            <div key={label} className="bg-card border border-border/60 rounded-lg py-3 px-3 text-center">
              <p className="text-lg font-semibold text-foreground tabular-nums">{value.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground/60">{label}</p>
            </div>
          ))}
        </div>

        {/* Achievements grid */}
        <div>
          <p className="text-xs font-medium text-muted-foreground/50 uppercase tracking-wider mb-3">
            Achievements · {achievements.length}/{ACHIEVEMENT_DEFS.length}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ACHIEVEMENT_DEFS.map((def) => {
              const unlocked = unlockedIds.has(def.id);
              const isSecret = def.secret && !unlocked;
              return (
                <div
                  key={def.id}
                  className={`flex items-start gap-3 rounded-xl border p-3 transition-opacity ${
                    unlocked ? "border-border bg-card" : "border-border/30 bg-secondary/20 opacity-50"
                  }`}
                >
                  <span className="text-2xl leading-none shrink-0">{isSecret ? "🔒" : def.icon}</span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium leading-tight ${unlocked ? RARITY_COLORS[def.rarity] : "text-muted-foreground/40"}`}>
                      {isSecret ? "???" : def.name}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      {isSecret ? "Keep exploring to find out." : def.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AchievementsPage;
