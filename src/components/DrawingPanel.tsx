import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Pencil } from "lucide-react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { useAppStore } from "@/store/useAppStore";
import { setExcalidrawApi, pushTextToCanvas } from "@/lib/excalidrawApi";

// Fixed right sidebar — the old floating/draggable panel was too small to
// draw anything meaningful in, so it's just a docked panel now, same as
// Notes/Clarify/Image Search. Width-only resize (drag the left edge) is
// kept since that's actually useful; free dragging/undocking is not.
const DEFAULT_WIDTH = 640;
const MIN_WIDTH = 420;
const MAX_WIDTH = 1000;

function DrawingPanel() {
  const drawingOpen = useAppStore((s) => s.drawingOpen);
  const pendingSketchText = useAppStore((s) => s.pendingSketchText);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const resizingRef = useRef(false);

  // Push highlighted text into Excalidraw when triggered from HighlightMenu
  useEffect(() => {
    if (!pendingSketchText || !drawingOpen) return;
    let attempts = 0;
    const tryPush = () => {
      if (pushTextToCanvas(pendingSketchText)) {
        useAppStore.setState({ pendingSketchText: null });
      } else if (++attempts < 10) {
        setTimeout(tryPush, 100);
      } else {
        useAppStore.setState({ pendingSketchText: null }); // give up
      }
    };
    tryPush();
  }, [pendingSketchText, drawingOpen]);

  // Push content area aside while open, same as the other docked panels
  useEffect(() => {
    if (drawingOpen) {
      useAppStore.setState({ rightDockWidth: width, leftDockWidth: 0 });
    }
  }, [drawingOpen, width]);

  const close = () => {
    useAppStore.setState({ drawingOpen: false, rightDockWidth: 0 });
  };

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      // Panel is docked right — dragging the left edge left (negative dx)
      // should widen it, dragging right should narrow it.
      const dx = startX - moveEvent.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + dx));
      setWidth(next);
    };
    const onMouseUp = () => {
      resizingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <AnimatePresence>
      {drawingOpen && (
        <motion.div
          // Fade only — no transform/translate. Excalidraw measures its
          // container's position on mount; animating position (e.g. a
          // slide-in via x) risks it caching a stale, mid-animation origin,
          // which then makes every click land offset from the cursor until
          // something forces a remeasure (e.g. leaving and re-entering).
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed top-0 right-0 bottom-0 z-50 bg-card border-l border-border shadow-2xl flex flex-col"
          style={{ width }}
        >
          {/* Width resize handle */}
          <div
            onMouseDown={onResizeMouseDown}
            className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize hover:bg-ring/20 z-10"
          />

          {/* Title bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 bg-secondary/30">
            <div className="flex items-center gap-2 min-w-0">
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Sketchpad</span>
            </div>
            <button
              onClick={close}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Excalidraw canvas — small even padding so toolbars have room */}
          <div className="flex-1 min-h-0 p-1">
            <div className="w-full h-full">
              <Excalidraw
                excalidrawAPI={(api: ExcalidrawImperativeAPI) => setExcalidrawApi(api)}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default DrawingPanel;
