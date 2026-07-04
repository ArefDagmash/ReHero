import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { ACHIEVEMENT_DEFS, RARITY_COLORS } from "@/lib/gamification";

export default function XPToast() {
  const pendingToasts = useAppStore((s) => s.gamification.pendingToasts);
  const dismissToast = useAppStore((s) => s.dismissToast);
  const toast = pendingToasts[0] ?? null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 2800);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col items-end gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toast && (
          <motion.div
            key={`${toast.xp}-${toast.achievementIds.join("-")}`}
            initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-1"
          >
            {/* XP pill */}
            {toast.xp > 0 && (
              <div className="self-end flex items-center gap-1.5 bg-card border border-border rounded-full px-3 py-1.5 shadow-lg">
                <span className="text-xs font-semibold text-foreground">+{toast.xp} XP</span>
              </div>
            )}

            {/* Achievement toasts */}
            {toast.achievementIds.map((id) => {
              const def = ACHIEVEMENT_DEFS.find((d) => d.id === id);
              if (!def) return null;
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 shadow-lg"
                >
                  <span className="text-base leading-none">{def.icon}</span>
                  <div className="flex flex-col">
                    <span className={`text-xs font-semibold ${RARITY_COLORS[def.rarity]}`}>
                      {def.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-snug max-w-[180px]">
                      {def.description}
                    </span>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
