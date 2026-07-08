import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, GripHorizontal, Pencil } from "lucide-react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { useAppStore } from "@/store/useAppStore";
import { useDragMove, useDragResize } from "@/lib/useDragMove";
import { setExcalidrawApi, pushTextToCanvas } from "@/lib/excalidrawApi";

function DrawingPanel() {
  const drawingOpen = useAppStore((s) => s.drawingOpen);
  const pendingSketchText = useAppStore((s) => s.pendingSketchText);
  const startDocked = useAppStore((s) => s.drawingStartDocked);

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

  const { pos, docked, showHint, onMouseDown: onDragMouseDown, setPos, setDocked } = useDragMove({
    x: Math.max(80, window.innerWidth - 640),
    y: 80,
  });

  // ponytail: start docked when toolbar icon triggers, reset after
  useEffect(() => {
    if (drawingOpen && startDocked) {
      setDocked("right");
      useAppStore.setState({ drawingStartDocked: false });
    }
  }, [drawingOpen, startDocked, setDocked]);
  const { size, onResizeMouseDown, onDockResizeMouseDown } = useDragResize({ w: 600, h: 500 }, pos, setPos);

  // Push content area aside when docked
  useEffect(() => {
    if (docked) {
      useAppStore.setState({
        rightDockWidth: docked === "right" ? size.w : 0,
        leftDockWidth: docked === "left" ? size.w : 0,
      });
    } else if (drawingOpen) {
      useAppStore.setState({ rightDockWidth: 0, leftDockWidth: 0 });
    }
  }, [docked, size.w, drawingOpen]);

  const close = () => {
    useAppStore.setState({ drawingOpen: false, rightDockWidth: 0, leftDockWidth: 0 });
  };

  return (
    <AnimatePresence>
      {/* Snap hint overlay */}
      {showHint && drawingOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed z-40 pointer-events-none border-2 border-dashed border-ring/40 bg-ring/5"
          style={
            showHint === "right"
              ? { top: 0, right: 0, bottom: 0, width: Math.max(420, size.w) }
              : { top: 0, left: 0, bottom: 0, width: Math.max(420, size.w) }
          }
        />
      )}
      {drawingOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className={`fixed z-50 bg-card border border-border shadow-2xl flex flex-col ${
            docked ? "rounded-none" : "rounded-xl"
          }`}
          style={
            docked === "right"
              ? { top: 0, right: 0, bottom: 0, width: size.w, position: "fixed" as const }
              : docked === "left"
                ? { top: 0, left: 0, bottom: 0, width: size.w, position: "fixed" as const }
                : { left: pos.x, top: pos.y, width: size.w, height: size.h }
          }
        >
          {/* Title bar */}
          <div
            onMouseDown={onDragMouseDown}
            className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 cursor-grab active:cursor-grabbing select-none bg-secondary/30"
          >
            <div className="flex items-center gap-2 min-w-0">
              <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/40" />
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Sketchpad</span>
            </div>
            <button
              onMouseDown={(e) => e.stopPropagation()}
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

          {/* Resize handles — hidden when docked, dock-resize strip when docked */}
          {docked ? (
            <div
              onMouseDown={(e) => onDockResizeMouseDown(e, docked)}
              className={`absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-ring/20 z-10 ${
                docked === "right" ? "left-0" : "right-0"
              }`}
            />
          ) : (
            <>
              {/* Edges */}
              <div onMouseDown={(e) => onResizeMouseDown(e, "n")}
                className="absolute left-0 right-0 top-0 h-1.5 cursor-ns-resize hover:bg-ring/20" />
              <div onMouseDown={(e) => onResizeMouseDown(e, "s")}
                className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-ring/20" />
              <div onMouseDown={(e) => onResizeMouseDown(e, "w")}
                className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize hover:bg-ring/20" />
              <div onMouseDown={(e) => onResizeMouseDown(e, "e")}
                className="absolute top-0 bottom-0 right-0 w-1.5 cursor-ew-resize hover:bg-ring/20" />
              {/* Corners */}
              <div onMouseDown={(e) => onResizeMouseDown(e, "nw")}
                className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize" />
              <div onMouseDown={(e) => onResizeMouseDown(e, "ne")}
                className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize" />
              <div onMouseDown={(e) => onResizeMouseDown(e, "sw")}
                className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize" />
              <div onMouseDown={(e) => onResizeMouseDown(e, "se")}
                className="absolute right-0 bottom-0 w-3 h-3 cursor-se-resize" />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default DrawingPanel;
