import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Image, Pencil, ArrowLeft, Minimize2, Lightbulb, Blocks, ListChecks, Workflow, MessageSquareText } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { log } from "@/lib/logger";

const AI_MODES = [
  { id: "simplify" as const, label: "Simplify", icon: Minimize2 },
  { id: "clarify" as const, label: "Clarify", icon: Lightbulb },
  { id: "example" as const, label: "Example", icon: Blocks },
  { id: "recap" as const, label: "Recap", icon: ListChecks },
  { id: "graph" as const, label: "Graph", icon: Workflow },
  { id: "custom" as const, label: "Custom", icon: MessageSquareText },
];

export function getModeIcon(mode: string) {
  return AI_MODES.find((m) => m.id === mode)?.icon ?? Sparkles;
}

function HighlightMenu() {
  const highlightMenuVisible = useAppStore((s) => s.highlightMenuVisible);
  const highlightText = useAppStore((s) => s.highlightText);
  const highlightRect = useAppStore((s) => s.highlightRect);
  const activePaperPath = useAppStore((s) => s.activePaperPath);
  const currentPage = useAppStore((s) => s.currentPage);
  const zoom = useAppStore((s) => s.zoom);
  const addPinnedDoodle = useAppStore((s) => s.addPinnedDoodle);

  const [showAiModes, setShowAiModes] = useState(false);

  useEffect(() => {
    if (!highlightMenuVisible) setShowAiModes(false);
  }, [highlightMenuVisible]);

  useEffect(() => {
    const handleClick = () => {
      const sel = window.getSelection();
      if (!sel || sel.toString().trim().length === 0) {
        if (useAppStore.getState().highlightMenuVisible) {
          log.highlight.debug("Selection cleared, hiding menu");
          useAppStore.setState({ highlightMenuVisible: false });
        }
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const getDoodleKey = useCallback(() => {
    return `${activePaperPath}-${currentPage}`;
  }, [activePaperPath, currentPage]);

  const handlePin = useCallback(() => {
    if (!activePaperPath) return;
    const key = getDoodleKey();
    const doodle = {
      id: uuidv4(),
      note: "",
      zoom,
      rects: useAppStore.getState().currentDoodleRects,
    };
    addPinnedDoodle(key, doodle);
    useAppStore.setState({ highlightMenuVisible: false });
  }, [activePaperPath, zoom, getDoodleKey, addPinnedDoodle]);

  const handleSketchIt = useCallback(() => {
    if (!highlightText) return;
    useAppStore.setState({
      pendingSketchText: highlightText,
      drawingOpen: true,
      highlightMenuVisible: false,
    });
  }, [highlightText]);

  const handleImageSearch = useCallback(() => {
    if (!highlightText) return;
    useAppStore.setState({
      imageSearchTerm: highlightText,
      imageSearchOpen: true,
      highlightMenuVisible: false,
    });
  }, [highlightText]);

  const handleAskAI = useCallback(() => {
    setShowAiModes(true);
  }, []);

  const handleAiMode = useCallback((mode: typeof AI_MODES[number]["id"]) => {
    if (!highlightText) return;
    const state = useAppStore.getState();
    useAppStore.setState({
      clarifyHighlightText: highlightText,
      clarifyHighlightRects: state.currentDoodleRects,
      clarifyMode: mode,
      clarifyPanelOpen: true,
      highlightMenuVisible: false,
    });
  }, [highlightText]);

  if (!highlightMenuVisible || !highlightRect) return null;

  const PADDING = 8;
  const menuLeft = Math.max(PADDING, Math.min(highlightRect.x, window.innerWidth - PADDING));
  const menuTop = Math.max(PADDING, highlightRect.y - 48);

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: `${menuLeft}px`,
    top: `${menuTop}px`,
    maxWidth: `calc(100vw - ${menuLeft + PADDING}px)`,
    zIndex: 100,
  };

  return (
    <AnimatePresence mode="wait">
      {showAiModes ? (
        <motion.div
          key="ai"
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: 0.12 }}
          className="flex flex-wrap items-center gap-1 rounded-lg border bg-popover px-1 py-1 shadow-md"
          style={menuStyle}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-xs"
            onClick={(e) => { e.stopPropagation(); setShowAiModes(false); }}
          >
            <ArrowLeft className="h-3 w-3" />
          </Button>
          {AI_MODES.map((m) => {
            const Icon = m.icon;
            return (
              <Button
                key={m.id}
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs bg-foreground/5"
                onClick={(e) => { e.stopPropagation(); handleAiMode(m.id); }}
              >
                <Icon className="h-3 w-3" />
                {m.label}
              </Button>
            );
          })}
        </motion.div>
      ) : (
        <motion.div
          key="main"
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: 0.12 }}
          className="flex flex-wrap items-center gap-1 rounded-lg border bg-popover px-1 py-1 shadow-md"
          style={menuStyle}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={handlePin}>
            <img src="/pin.svg" className="h-3.5 w-3.5" alt="Pin" />
            Pin
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={handleSketchIt}>
            <Pencil className="h-3 w-3" />
            Sketch it
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={handleImageSearch}>
            <Image className="h-3 w-3" />
            Images
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={handleAskAI}>
            <Sparkles className="h-3 w-3" />
            Ask AI
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default HighlightMenu;
