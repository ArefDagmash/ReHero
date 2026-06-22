import { useCallback, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Plus, Trash2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/store/useAppStore";
import { log } from "@/lib/logger";
import type { Annotation } from "@/types";

function AnnotationPanel() {
  const activePaperPath = useAppStore((s) => s.activePaperPath);
  const annotations = useAppStore((s) =>
    activePaperPath ? s.annotations[activePaperPath] ?? [] : [],
  );
  const currentPage = useAppStore((s) => s.currentPage);
  const addAnnotation = useAppStore((s) => s.addAnnotation);
  const updateAnnotation = useAppStore((s) => s.updateAnnotation);
  const deleteAnnotation = useAppStore((s) => s.deleteAnnotation);

  const [editingId, setEditingId] = useState<string | null>(null);

  const groupedAnnotations = useMemo(() => {
    if (!activePaperPath) return new Map<number, Annotation[]>();
    const map = new Map<number, Annotation[]>();
    for (const a of annotations) {
      const list = map.get(a.pageNumber) || [];
      list.push(a);
      map.set(a.pageNumber, list);
    }
    return new Map([...map.entries()].sort(([a], [b]) => a - b));
  }, [annotations, activePaperPath]);

  const currentPageAnnotations = annotations.filter(
    (a) => a.pageNumber === currentPage,
  );

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
    annotationCount: annotations.length,
    currentPage,
  });

  if (!activePaperPath) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4 text-center">
        <div className="flex flex-col items-center gap-2">
          <MessageSquareText className="h-8 w-8 opacity-50" />
          <p>Open a paper to view notes</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between shrink-0">
        <span className="text-sm font-medium">Annotations</span>
        <Button variant="ghost" size="icon" onClick={handleAddBlankNote}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {annotations.length === 0 ? (
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
    </div>
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
        <Badge variant="secondary" className="text-[10px] shrink-0">
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
