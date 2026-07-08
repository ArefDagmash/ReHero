import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import HomePage from "@/components/HomePage";

const STICKMAN_SIZE = "h-88";
const FLY_DURATION = 1.2;

export default function LandingPage() {
  const setSidebarTab = useAppStore((s) => s.setSidebarTab);
  const rightDockWidth = useAppStore((s) => s.rightDockWidth);
  const leftDockWidth = useAppStore((s) => s.leftDockWidth);
  const [flying, setFlying] = useState(false);
  const [done, setDone] = useState(false);
  const curtainRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const navigateRef = useRef<ReturnType<typeof setTimeout>>();

  const handleFly = useCallback(() => {
    setFlying(true);
  }, []);

  // ponytail: direct DOM clip-path for reveal, avoids React rAF overhead
  useEffect(() => {
    if (!flying) return;
    const start = performance.now();

    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      const p = Math.min(elapsed / FLY_DURATION, 1);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const cx = 50 - eased * 50;
      const cy = 50 - eased * 50;
      const r = eased * 150;
      if (curtainRef.current) {
        const val = `radial-gradient(circle ${r}% at ${cx}% ${cy}%, transparent 0%, black 100%)`;
        curtainRef.current.style.WebkitMaskImage = val;
        curtainRef.current.style.maskImage = val;
      }
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    navigateRef.current = setTimeout(() => {
      setDone(true);
      setSidebarTab("papers");
    }, FLY_DURATION * 1000 + 400);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(navigateRef.current);
    };
  }, [flying, setSidebarTab]);

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden bg-background relative transition-[margin] duration-150"
      style={{
        marginRight: rightDockWidth || undefined,
        marginLeft: leftDockWidth || undefined,
      }}
    >
      {/* Bottom layer: actual homepage — only renders once fly starts */}
      {flying && (
        <div className="absolute inset-0">
          <HomePage variant="library" onOpenPaper={() => {}} />
        </div>
      )}

      {/* Curtain overlay — hides homepage, punched out by mask circle */}
      <div
        ref={curtainRef}
        className="absolute inset-0 z-10 bg-background"
        style={{
          WebkitMaskImage: "radial-gradient(circle 0% at 50% 50%, transparent 0%, black 100%)",
          maskImage: "radial-gradient(circle 0% at 50% 50%, transparent 0%, black 100%)",
        }}
      />

      {/* Stickman — always on top */}
      <AnimatePresence>
        {!done && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 pointer-events-none">
            {!flying ? (
              <>
                <motion.img
                  key="greeting"
                  src="/ReHero-Logo-OnlyDrawing.png"
                  alt=""
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.4 }}
                  className={`${STICKMAN_SIZE} w-auto select-none`}
                  draggable={false}
                />

                <motion.button
                  key="cta"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                  onClick={handleFly}
                  className="pointer-events-auto px-6 py-3 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  add your first paper
                </motion.button>
              </>
            ) : (
              <motion.img
                key="flying"
                src="/Flying-Stickman.png"
                alt=""
                initial={{ opacity: 0, x: 0, y: 0, rotate: -5 }}
                animate={{
                  opacity: [0, 1, 1],
                  x: [0, 120, -3000],
                  y: [0, 60, -1500],
                  rotate: [-5, -10, -20],
                }}
                transition={{
                  duration: FLY_DURATION,
                  ease: "linear",
                  times: [0, 0.3, 1],
                }}
                className={`${STICKMAN_SIZE} w-auto select-none absolute`}
                draggable={false}
              />
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
