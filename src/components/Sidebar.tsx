import { useState, useEffect, useRef, useCallback } from "react";
import { Settings2, MessageSquareText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";

const ICON_PATHS: Record<string, string[]> = {
  home: [
    "M3 9.5L12 3l9 6.5V20a2 2 0 01-2 2H5a2 2 0 01-2-2V9.5z",
    "M9 22V12h6v10",
  ],
  papers: [
    "M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z",
    "M14 2v6h6",
    "M16 13H8",
    "M16 17H8",
  ],
  books: [
    "M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z",
    "M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z",
  ],
  explore: [
    "M2 12a10 10 0 1 0 20 0 10 10 0 1 0 -20 0",
    "M16.24 7.76L14.12 14.12L7.76 16.24L9.88 9.88Z",
  ],
};

function SvgIcon({ paths, className }: { paths: string[]; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const els = svgRef.current?.querySelectorAll("path");
    if (!els || !els.length) return;
    els.forEach((p) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
    });
    svgRef.current?.getBoundingClientRect();
    els.forEach((p) => {
      p.style.transition = "stroke-dashoffset 0.5s ease-in-out";
      p.style.strokeDashoffset = "0";
    });
  }, []);

  const reset = useCallback(() => {
    const els = svgRef.current?.querySelectorAll("path");
    if (!els) return;
    els.forEach((p) => {
      p.style.strokeDasharray = "";
      p.style.strokeDashoffset = "";
      p.style.transition = "";
    });
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      onMouseEnter={draw}
      onMouseLeave={reset}
    >
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

const navItems = [
  { id: "home", label: "Home" },
  { id: "papers", label: "Papers" },
  { id: "books", label: "Books" },
  { id: "explore", label: "Explore" },
] as const;

type NavId = (typeof navItems)[number]["id"] | "settings";

type Props = {
  active: NavId;
  onNavigate: (id: NavId) => void;
  view: "home" | "reader";
};

function Sidebar({ active, onNavigate, view }: Props) {
  const rightDockWidth = useAppStore((s) => s.rightDockWidth);
  const leftDockWidth = useAppStore((s) => s.leftDockWidth);

  const [collapsed, setCollapsed] = useState(false);
  const prevView = useRef(view);

  return (
    <AnimatePresence mode="wait">
      {collapsed ? (
        <motion.div
          key="collapsed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="shrink-0 flex flex-col h-full py-3"
        >
          <button
            onClick={() => setCollapsed(false)}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card border border-border/50 transition-colors"
            title="Show sidebar"
          >
            <img src="/triple-line.png" className="h-7 w-7" alt="Menu" />
          </button>
        </motion.div>
      ) : (
        <motion.div
          key="expanded"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 256, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          className="shrink-0 border-r border-border bg-card flex flex-col h-full overflow-hidden transition-[margin] duration-150"
          style={{
            marginLeft: leftDockWidth || undefined,
          }}
        >
          <div className="flex items-center gap-2 p-2 border-b border-border">
            <button
              onClick={() => setCollapsed(true)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Hide sidebar"
            >
              <img src="/triple-line.png" className="h-6 w-6" alt="Close" />
            </button>
            <span className="text-sm font-medium text-foreground tracking-tight" style={{ fontFamily: '"Excalifont", cursive' }}>ReHero</span>
          </div>

          {/* Nav */}
          <div className="flex flex-col gap-0.5 p-2">
            {navItems.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                aria-current={active === id ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active === id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <SvgIcon paths={ICON_PATHS[id]} className="h-5 w-5 shrink-0" />
                {label}
              </button>
            ))}
          </div>

            <div className="flex-1" />

            <div className="border-t border-border/70 p-2 pt-3">
              <button
                onClick={() => useAppStore.setState({ annotationPanelOpen: true })}
                className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary`}
              >
                <MessageSquareText className="h-5 w-5" />
                Notes
              </button>
              <button
                onClick={() => onNavigate("settings")}
                aria-current={active === "settings" ? "page" : undefined}
                className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                  active === "settings"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Settings2 className="h-5 w-5" />
                Settings
              </button>
            </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default Sidebar;
