import { useCallback, useMemo, useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, MessageSquareText, GripHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/store/useAppStore";
import { useDragMove, useDragResize } from "@/lib/useDragMove";
import { log } from "@/lib/logger";
import type { Annotation } from "@/types";

function AnnotationPanel() {
  const annotationPanelOpen = useAppStore((s) => s.annotationPanelOpen);
  const activePaperPath = useAppStore((s) => s.activePaperPath);
  const annotations = useAppStore((s) =>
    activePaperPath ? (s.annotations[activePaperPath] ?? null) : null,
  );
  const currentPage = useAppStore((s) => s.currentPage);
  const addAnnotation = useAppStore((s) => s.addAnnotation);
  const updateAnnotation = useAppStore((s) => s.updateAnnotation);
  const deleteAnnotation = useAppStore((s) => s.deleteAnnotation);

  const { pos, docked, onMouseDown: onDragMouseDown } = useDragMove({ x: Math.max(40, window.innerWidth - 500), y: 80 });
  const { size, onResizeMouseDown, onDockResizeMouseDown } = useDragResize({ w: 400, h: 600 });

  useEffect(() => {
    if (docked) {
      useAppStore.setState({ rightDockWidth: docked === "right" ? size.w : 0, leftDockWidth: docked === "left" ? size.w : 0 });
    } else if (annotationPanelOpen) {
      useAppStore.setState({ rightDockWidth: 0, leftDockWidth: 0 });
    }
  }, [docked, size.w, annotationPanelOpen]);

  const close = () => {
    useAppStore.setState({ annotationPanelOpen: false, rightDockWidth: 0, leftDockWidth: 0 });
  };

  const [editingId, setEditingId] = useState<string | null>(null);

  const groupedAnnotations = useMemo(() => {
    if (!annotations || !activePaperPath) return new Map<number, Annotation[]>();
    const map = new Map<number, Annotation[]>();
    for (const a of annotations) {
      const list = map.get(a.pageNumber) || [];
      list.push(a);
      map.set(a.pageNumber, list);
    }
    return new Map([...map.entries()].sort(([a], [b]) => a - b));
  }, [annotations, activePaperPath]);

  const currentPageAnnotations = annotations !== null
    ? annotations.filter((a) => a.pageNumber === currentPage)
    : [];

  const handleAddBlankNote = useCallback(() => {
    if (!activePaperPath) return;
    const note: Annotation = {
      id: uuidv4(),
      pageNumber: currentPage,
      highlightedText: "",
      note: "",
      createdAt: new Date().toISOString(),
    };
    log.annotations.info("Adding blank note", { id: note.id, pageNumber: currentPage });
    addAnnotation(activePaperPath, note);
    setEditingId(note.id);
  }, [activePaperPath, currentPage, addAnnotation]);

  const handleDelete = useCallback(
    (id: string) => {
      if (!activePaperPath) return;
      log.annotations.info("Deleting annotation", { id });
      deleteAnnotation(activePaperPath, id);
    },
    [activePaperPath, deleteAnnotation],
  );

  const handleNoteChange = useCallback(
    (id: string, note: string) => {
      if (!activePaperPath) return;
      log.annotations.debug("Updating annotation note", { id, noteLength: note.length });
      updateAnnotation(activePaperPath, id, note);
    },
    [activePaperPath, updateAnnotation],
  );

  log.annotations.debug("AnnotationPanel render", {
    activePaperPath: activePaperPath?.slice(0, 40),
    annotationCount: annotations?.length ?? 0,
    currentPage,
  });

  if (!annotationPanelOpen) return null;

  const hasPaper = !!activePaperPath;
  const hasAnnotations = annotations !== null && annotations.length > 0;

  return (
    <AnimatePresence>
      <motion.div
        key="annotations"
        initial={docked ? { height: "100%", opacity: 0 } : { opacity: 0, scale: 0.95 }}
        animate={docked ? { height: "100%", opacity: 1 } : { opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className={`fixed z-50 bg-card border border-border shadow-lg flex flex-col overflow-hidden ${docked ? "top-0 bottom-0 rounded-none" : "rounded-xl"}`}
        style={
          docked
            ? { [docked === "right" ? "right" : "left"]: 0, width: size.w, height: "100%" }
            : { left: Math.max(0, Math.min(pos.x, window.innerWidth - 300)), top: Math.max(0, Math.min(pos.y, window.innerHeight - 100)), width: size.w, height: size.h }
        }
      >
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border cursor-grab active:cursor-grabbing select-none" onMouseDown={onDragMouseDown}>
          <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground flex-1">Notes</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAddBlankNote} disabled={!hasPaper}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); close(); }}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {docked && (
          <div className={`absolute top-0 bottom-0 w-2 cursor-col-resize hover:bg-foreground/10 z-10 ${docked === "right" ? "left-0" : "right-0"}`} onMouseDown={(e) => onDockResizeMouseDown(e as any, docked as any)} />
        )}
        {!hasPaper && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4 text-center">
            <div className="flex flex-col items-center gap-2">
              <MessageSquareText className="h-8 w-8 opacity-50" />
              <p>Open a paper to view notes</p>
            </div>
          </div>
        )}
        {hasPaper && (
          <ScrollArea className="flex-1">
            {!hasAnnotations ? (
              <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-sm text-center">
                <MessageSquareText className="h-8 w-8 mb-2 opacity-50" />
                <p>No notes yet.</p>
                <p className="mt-1">Select text or click + to add a note.</p>
              </div>
            ) : (
              <div className="p-3 flex flex-col gap-3">
                {currentPageAnnotations.length > 0 && (
                  <div className="text-xs text-muted-foreground font-medium">
                    This page
                  </div>
                )}
                {currentPageAnnotations.map((a) => (
                  <AnnotationCard
                    key={a.id}
                    annotation={a}
                    isEditing={editingId === a.id}
                    onEdit={() => setEditingId(a.id)}
                    onNoteChange={(note) => handleNoteChange(a.id, note)}
                    onDelete={() => handleDelete(a.id)}
                  />
                ))}

                {[...groupedAnnotations.entries()]
                  .filter(([page]) => page !== currentPage)
                  .map(([page, items]) => (
                    <div key={page} className="flex flex-col gap-2">
                      <div className="text-xs text-muted-foreground font-medium pt-2 border-t">
                        Page {page}
                      </div>
                      {items.map((a) => (
                        <AnnotationCard
                          key={a.id}
                          annotation={a}
                          isEditing={editingId === a.id}
                          onEdit={() => setEditingId(a.id)}
                          onNoteChange={(note) => handleNoteChange(a.id, note)}
                          onDelete={() => handleDelete(a.id)}
                        />
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </ScrollArea>
        )}
        {!docked && (
          <>
            <div onMouseDown={(e) => onResizeMouseDown(e, "e")} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-ring/20" />
            <div onMouseDown={(e) => onResizeMouseDown(e, "s")} className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-ring/20" />
            <div onMouseDown={(e) => onResizeMouseDown(e, "se")} className="absolute right-0 bottom-0 w-3 h-3 cursor-nwse-resize" />
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

type AnnotationCardProps = {
  annotation: Annotation;
  isEditing: boolean;
  onEdit: () => void;
  onNoteChange: (note: string) => void;
  onDelete: () => void;
};

function AnnotationCard({
  annotation,
  isEditing,
  onEdit,
  onNoteChange,
  onDelete,
}: AnnotationCardProps) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Badge variant="secondary" className="text-xs shrink-0">
          p.{annotation.pageNumber}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {annotation.highlightedText && (
        <blockquote className="border-l-2 border-muted pl-3 text-sm text-muted-foreground italic line-clamp-4">
          &ldquo;{annotation.highlightedText}&rdquo;
        </blockquote>
      )}

      {isEditing ? (
        <Textarea
          value={annotation.note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Write your note..."
          className="min-h-[60px] text-sm"
          autoFocus
        />
      ) : (
        <div className="text-sm cursor-text min-h-[24px]" onClick={onEdit}>
          {annotation.note || (
            <span className="text-muted-foreground italic">
              Click to add note...
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default AnnotationPanel;
