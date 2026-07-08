import { useCallback, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  PanelRight,
  Menu,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { log } from "@/lib/logger";

type ToolbarProps = {
  onToggleLibrary: () => void;
  onToggleAnnotations: () => void;
  annotationsOpen: boolean;
};

function Toolbar({
  onToggleLibrary,
  onToggleAnnotations,
  annotationsOpen,
}: ToolbarProps) {
  const currentPage = useAppStore((s) => s.currentPage);
  const zoom = useAppStore((s) => s.zoom);
  const setPage = useAppStore((s) => s.setPage);
  const setZoom = useAppStore((s) => s.setZoom);
  const activePaperPath = useAppStore((s) => s.activePaperPath);
  const activePaper = useAppStore((s) =>
    s.papers.find((p) => p.filePath === s.activePaperPath),
  );

  const totalPages = activePaper?.totalPages ?? 0;

  const goNext = useCallback(() => {
    if (currentPage < totalPages) {
      log.toolbar.debug("Next page", { from: currentPage, to: currentPage + 1 });
      setPage(currentPage + 1);
    }
  }, [currentPage, totalPages, setPage]);

  const goPrev = useCallback(() => {
    if (currentPage > 1) {
      log.toolbar.debug("Previous page", { from: currentPage, to: currentPage - 1 });
      setPage(currentPage - 1);
    }
  }, [currentPage, setPage]);

  const zoomIn = useCallback(() => {
    const newZoom = Math.min(zoom + 0.25, 3.0);
    log.toolbar.debug("Zoom in", { from: zoom, to: newZoom });
    setZoom(newZoom);
  }, [zoom, setZoom]);

  const zoomOut = useCallback(() => {
    const newZoom = Math.max(zoom - 0.25, 0.5);
    log.toolbar.debug("Zoom out", { from: zoom, to: newZoom });
    setZoom(newZoom);
  }, [zoom, setZoom]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    log.toolbar.debug("Keyboard listener attached");
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      log.toolbar.debug("Keyboard listener detached");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goNext, goPrev]);

  const progressPct = activePaperPath && totalPages > 0
    ? Math.round((currentPage / totalPages) * 100)
    : 0;

  return (
    <div className="shrink-0">
      <div className="h-12 border-b flex items-center justify-between px-3 bg-background select-none">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onToggleLibrary}>
            <Menu className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={goPrev}
            disabled={currentPage <= 1 || !activePaperPath}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm tabular-nums min-w-[80px] text-center">
            {activePaperPath ? `${currentPage} / ${totalPages}` : "—"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={goNext}
            disabled={currentPage >= totalPages || !activePaperPath}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomOut}
            disabled={zoom <= 0.5 || !activePaperPath}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[48px] text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomIn}
            disabled={zoom >= 3.0 || !activePaperPath}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => useAppStore.setState({ drawingOpen: true })}
            title="Sketchpad"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant={annotationsOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={onToggleAnnotations}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {activePaperPath && totalPages > 0 && (
        <div className="h-1 w-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-foreground transition-[width] duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default Toolbar;
