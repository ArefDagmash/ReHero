import { useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { FileUp, FileText, Trash2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { log } from "@/lib/logger";
import type { Paper } from "@/types";

const objectUrls = new Set<string>();

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function createObjectUrl(file: File): string {
  const url = URL.createObjectURL(file);
  objectUrls.add(url);
  return url;
}

function revokeStaleUrls(keepPath: string | null) {
  for (const url of objectUrls) {
    if (url !== keepPath) {
      URL.revokeObjectURL(url);
      objectUrls.delete(url);
    }
  }
}

type LibraryProps = {
  onSelect?: () => void;
};

function Library({ onSelect }: LibraryProps) {
  const papers = useAppStore((s) => s.papers);
  const activePaperPath = useAppStore((s) => s.activePaperPath);
  const setActivePaper = useAppStore((s) => s.setActivePaper);
  const addPaper = useAppStore((s) => s.addPaper);
  const removePaper = useAppStore((s) => s.removePaper);
  const doodleColor = useAppStore((s) => s.doodleColor);
  const doodleStyle = useAppStore((s) => s.doodleStyle);
  const strokeCount = useAppStore((s) => s.strokeCount);
  const sloppiness = useAppStore((s) => s.sloppiness);
  const setDoodleColor = useAppStore((s) => s.setDoodleColor);
  const setDoodleStyle = useAppStore((s) => s.setDoodleStyle);
  const setStrokeCount = useAppStore((s) => s.setStrokeCount);
  const setSloppiness = useAppStore((s) => s.setSloppiness);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = useCallback(
    (file: File) => {
      log.library.info("File selected", {
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
      });
      const url = createObjectUrl(file);
      const fileName = file.name.replace(/\.pdf$/i, "");
      const paper: Paper = {
        id: uuidv4(),
        title: fileName,
        filePath: url,
        totalPages: 0,
        lastPage: 1,
        tags: [],
      };
      revokeStaleUrls(url);
      addPaper(paper);
      onSelect?.();
    },
    [addPaper, onSelect],
  );

  const handleOpenPdf = useCallback(async () => {
    if (isTauri()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          multiple: false,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });
        if (selected) {
          const filePath =
            typeof selected === "string" ? selected : selected[0];
          const fileName =
            filePath.split("/").pop()?.replace(/\.pdf$/i, "") ?? filePath;
          const paper: Paper = {
            id: uuidv4(),
            title: fileName,
            filePath,
            totalPages: 0,
            lastPage: 1,
            tags: [],
          };
          addPaper(paper);
          onSelect?.();
        }
      } catch (e) {
        log.library.error("Tauri dialog failed", e);
      }
    } else {
      fileInputRef.current?.click();
    }
  }, [addPaper, onSelect]);

  const handlePaperClick = useCallback(
    (paper: Paper) => {
      setActivePaper(paper.filePath);
      onSelect?.();
    },
    [setActivePaper, onSelect],
  );

  const handleDeletePaper = useCallback(
    (e: React.MouseEvent, paper: Paper) => {
      e.stopPropagation();
      if (paper.filePath.startsWith("blob:")) {
        URL.revokeObjectURL(paper.filePath);
        objectUrls.delete(paper.filePath);
      }
      removePaper(paper.id);
    },
    [removePaper],
  );

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelected(file);
            e.target.value = "";
          }}
        />
        <button
          onClick={handleOpenPdf}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <FileUp className="h-4 w-4" />
          Open PDF
        </button>
      </div>

      <div className="flex-1 overflow-auto px-2 pb-4">
        {papers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-sm text-center">
            <FileText className="h-8 w-8 mb-2 opacity-40" />
            <p>No papers yet</p>
            <p className="text-xs mt-0.5">Open a PDF to get started</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {papers.map((paper) => (
              <div
                key={paper.id}
                onClick={() => handlePaperClick(paper)}
                className={`group relative px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  activePaperPath === paper.filePath
                    ? "bg-secondary"
                    : "hover:bg-secondary/50"
                }`}
              >
                <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 break-words pr-6">
                  {paper.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  p.{paper.lastPage}
                  {paper.totalPages > 0 ? ` / ${paper.totalPages}` : ""}
                </p>
                <button
                  onClick={(e) => handleDeletePaper(e, paper)}
                  className="absolute right-2 top-2 h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border mt-auto px-4 py-3 space-y-3">
        <p className="text-xs text-muted-foreground font-medium">Selection style</p>

        <div className="flex items-center gap-1">
          {["red", "blue", "green", "orange", "purple", "yellow"].map((c) => (
            <button
              key={c}
              onClick={() => setDoodleColor(c)}
              className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${
                doodleColor === c ? "ring-2 ring-foreground ring-offset-1 scale-110" : ""
              }`}
              style={{ background: c }}
            />
          ))}
        </div>

        <div className="flex items-center gap-1">
          {(["underline", "strikethrough", "squiggly"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setDoodleStyle(s)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                doodleStyle === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => setStrokeCount(n)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                strokeCount === n ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {n}x
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {(["clean", "medium", "sloppy"] as const).map((level) => (
            <button
              key={level}
              onClick={() => setSloppiness(level)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                sloppiness === level ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Library;
