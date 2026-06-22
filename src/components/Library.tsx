import { useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { FileUp, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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

function Library() {
  const papers = useAppStore((s) => s.papers);
  const activePaperPath = useAppStore((s) => s.activePaperPath);
  const setActivePaper = useAppStore((s) => s.setActivePaper);
  const addPaper = useAppStore((s) => s.addPaper);
  const removePaper = useAppStore((s) => s.removePaper);
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
      log.library.info("Paper created", { id: paper.id, title: paper.title, filePath: paper.filePath });
      revokeStaleUrls(url);
      addPaper(paper);
      log.library.info("Paper added to store");
    },
    [addPaper],
  );

  const handleOpenPdf = useCallback(async () => {
    log.library.info("Open PDF button clicked");
    if (isTauri()) {
      log.library.info("Running in Tauri, opening native dialog");
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
          log.library.info("Tauri file selected", { filePath, fileName });
          const paper: Paper = {
            id: uuidv4(),
            title: fileName,
            filePath,
            totalPages: 0,
            lastPage: 1,
            tags: [],
          };
          addPaper(paper);
        } else {
          log.library.debug("File dialog cancelled");
        }
      } catch (e) {
        log.library.error("Tauri dialog failed", e);
      }
    } else {
      log.library.info("Running in browser, triggering file input");
      fileInputRef.current?.click();
    }
  }, [addPaper]);

  const handlePaperClick = useCallback((paper: Paper) => {
    log.library.info("Paper clicked", { title: paper.title, filePath: paper.filePath });
    setActivePaper(paper.filePath);
  }, [setActivePaper]);

  const handleDeletePaper = useCallback((e: React.MouseEvent, paper: Paper) => {
    e.stopPropagation();
    log.library.info("Deleting paper", { id: paper.id, title: paper.title });
    if (paper.filePath.startsWith("blob:")) {
      URL.revokeObjectURL(paper.filePath);
      objectUrls.delete(paper.filePath);
    }
    removePaper(paper.id);
  }, [removePaper]);

  log.library.debug("Library render", { paperCount: papers.length, activePaperPath });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
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
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={handleOpenPdf}
        >
          <FileUp className="h-4 w-4" />
          Open PDF
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {papers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-sm text-center">
            <FileText className="h-8 w-8 mb-2 opacity-50" />
            <p>No papers yet.</p>
            <p>Open a PDF to get started.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-2">
            {papers.map((paper) => (
              <Card
                key={paper.id}
                className={`group cursor-pointer transition-colors hover:bg-accent ${
                  activePaperPath === paper.filePath
                    ? "bg-accent border-primary/50"
                    : "bg-transparent border-transparent"
                }`}
                onClick={() => handlePaperClick(paper)}
              >
                <CardHeader className="p-3 pb-1 pr-8 relative">
                  <CardTitle className="text-sm font-medium truncate">
                    {paper.title}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleDeletePaper(e, paper)}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <p className="text-xs text-muted-foreground">
                    Page {paper.lastPage}
                    {paper.totalPages > 0 ? ` / ${paper.totalPages}` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default Library;
