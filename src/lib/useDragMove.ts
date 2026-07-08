import { useState, useCallback, useRef } from "react";

const SNAP_PX = 60;

export type DockSide = "left" | "right" | null;

export function useDragMove(initialPos: { x: number; y: number }, initialDocked: DockSide = null) {
  const [pos, setPos] = useState(initialPos);
  const [docked, setDocked] = useState<DockSide>(initialDocked);
  const [showHint, setShowHint] = useState<DockSide>(null);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const undockRef = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      dragging.current = true;

      if (docked) {
        undockRef.current = true;
        const x = e.clientX - 20;
        const y = e.clientY - 20;
        setPos({ x: Math.max(0, Math.min(x, window.innerWidth - 420)), y: Math.max(0, y) });
        setDocked(null);
        setShowHint(null);
        offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      } else {
        offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      }

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const nx = ev.clientX - offset.current.x;
        const ny = ev.clientY - offset.current.y;
        setPos({ x: nx, y: ny });
        // snap hint
        const distR = window.innerWidth - ev.clientX;
        const distL = ev.clientX;
        setShowHint(distR < SNAP_PX ? "right" : distL < SNAP_PX ? "left" : null);
      };
      const onUp = (ev: MouseEvent) => {
        dragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        // Don't re-dock if we just un-docked (e.g. clicking close button)
        if (!undockRef.current) {
          const distR = window.innerWidth - ev.clientX;
          const distL = ev.clientX;
          if (distR < SNAP_PX) setDocked("right");
          else if (distL < SNAP_PX) setDocked("left");
        }
        undockRef.current = false;
        setShowHint(null);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [pos, docked],
  );

  return { pos, docked, setDocked, showHint, onMouseDown, setPos };
}

const MIN_DOCK_W = 280;

export function useDragResize(
  initialSize: { w: number; h: number },
  panelPos?: { x: number; y: number },
  onPanelPosChange?: (pos: { x: number; y: number }) => void,
) {
  const [size, setSize] = useState(initialSize);
  const [pos, setPos] = useState(panelPos ?? { x: 0, y: 0 });
  const resizing = useRef(false);
  const start = useRef({ x: 0, y: 0, w: 0, h: 0, px: 0, py: 0 });
  const edge = useRef<string | null>(null);

  // ponytail: side-only handles (e, s) and corner handles (se, sw, ne, nw, w, n)
  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent, dir: string) => {
      e.stopPropagation();
      if (edge.current === "dock") return;
      resizing.current = true;
      edge.current = dir;
      const curSize = panelPos ? { w: size.w, h: size.h } : size;
      const curPos = panelPos ?? pos;
      start.current = { x: e.clientX, y: e.clientY, w: curSize.w, h: curSize.h, px: curPos.x, py: curPos.y };

      const onMove = (ev: MouseEvent) => {
        if (!resizing.current) return;
        const dx = ev.clientX - start.current.x;
        const dy = ev.clientY - start.current.y;
        const ed = edge.current;
        let newW = start.current.w;
        let newH = start.current.h;
        let newX = start.current.px;
        let newY = start.current.py;

        if (ed === "e" || ed === "ne" || ed === "se") newW = Math.max(320, start.current.w + dx);
        if (ed === "w" || ed === "nw" || ed === "sw") {
          newW = Math.max(320, start.current.w - dx);
          newX = start.current.px + start.current.w - newW;
        }
        if (ed === "s" || ed === "se" || ed === "sw") newH = Math.max(280, start.current.h + dy);
        if (ed === "n" || ed === "ne" || ed === "nw") {
          newH = Math.max(280, start.current.h - dy);
          newY = start.current.py + start.current.h - newH;
        }

        setSize({ w: newW, h: newH });
        setPos({ x: newX, y: newY });
        if (onPanelPosChange) onPanelPosChange({ x: newX, y: newY });
      };
      const onUp = () => {
        resizing.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [size, pos, panelPos, onPanelPosChange],
  );

  // Resize a docked panel by dragging its inner edge
  const onDockResizeMouseDown = useCallback(
    (e: React.MouseEvent, docked: "left" | "right") => {
      e.stopPropagation();
      e.preventDefault();
      resizing.current = true;
      edge.current = "dock";
      start.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h, px: 0, py: 0 };
      const onMove = (ev: MouseEvent) => {
        if (!resizing.current) return;
        const dx = ev.clientX - start.current.x;
        const delta = docked === "right" ? -dx : dx;
        setSize((s) => ({
          w: Math.max(MIN_DOCK_W, Math.min(window.innerWidth - 320, start.current.w + delta)),
          h: s.h,
        }));
      };
      const onUp = () => {
        resizing.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [size],
  );

  return { size, pos, setPos, onResizeMouseDown, onDockResizeMouseDown };
}
