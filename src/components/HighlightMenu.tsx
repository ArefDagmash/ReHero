import { useState, useCallback, useRef, useEffect } from "react";
import { MessageSquare, Sparkles, Image } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/store/useAppStore";
import { log } from "@/lib/logger";
import type { ChatMessage } from "@/types";

function HighlightMenu() {
  const highlightMenuVisible = useAppStore((s) => s.highlightMenuVisible);
  const highlightText = useAppStore((s) => s.highlightText);
  const highlightRect = useAppStore((s) => s.highlightRect);
  const activePaperPath = useAppStore((s) => s.activePaperPath);
  const currentPage = useAppStore((s) => s.currentPage);
  const zoom = useAppStore((s) => s.zoom);
  const addPinnedDoodle = useAppStore((s) => s.addPinnedDoodle);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const abortRef = useRef<AbortController | null>(null);

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

  const handleNote = useCallback(() => {
    if (!activePaperPath) return;
    setNoteText("");
    setNoteOpen(true);
  }, [activePaperPath]);

  const handleNoteSave = useCallback(() => {
    const key = getDoodleKey();
    const doodle = {
      id: uuidv4(),
      note: noteText,
      zoom,
      rects: useAppStore.getState().currentDoodleRects,
    };
    addPinnedDoodle(key, doodle);
    setNoteOpen(false);
    useAppStore.setState({ highlightMenuVisible: false });
  }, [getDoodleKey, zoom, addPinnedDoodle, noteText]);

  const handleImageSearch = useCallback(() => {
    if (!highlightText) return;
    useAppStore.setState({
      imageSearchTerm: highlightText,
      imageSearchOpen: true,
      highlightMenuVisible: false,
    });
  }, [highlightText]);

  const handleAskAI = useCallback(() => {
    log.highlight.info("Opening AI dialog", { textLength: highlightText.length });
    log.ai.debug("Resetting chat state");
    setAiDialogOpen(true);
    setQuestion("");
    setChatMessages([]);
    setStreamContent("");
    setStreaming(false);
  }, [highlightText]);

  const handleSendQuestion = useCallback(async () => {
    if (!question.trim() || !highlightText) return;

    log.ai.info("Sending AI question", { questionLength: question.length });

    const userMsg: ChatMessage = {
      role: "user",
      content: `Highlighted text: "${highlightText}"\n\nQuestion: ${question}`,
    };

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a research assistant. The user has highlighted text from a paper. Answer their question about it concisely.",
      },
      ...chatMessages,
      userMsg,
    ];

    setChatMessages((prev) => [...prev, userMsg]);
    setQuestion("");
    setStreaming(true);
    setStreamContent("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      log.ai.debug("POST to Ollama", { model: "llama3.2", url: "http://localhost:11434/api/chat" });
      const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3.2",
          messages,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        log.ai.warn("Ollama returned non-OK", { status: response.status });
        throw new Error(`Ollama returned ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.trim());

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              fullContent += parsed.message.content;
              chunkCount++;
            }
          } catch {
            // skip non-JSON lines (e.g. empty lines in SSE)
          }
        }
        setStreamContent(fullContent);
      }

      log.ai.info("AI response complete", { totalLength: fullContent.length, chunks: chunkCount });
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: fullContent },
      ]);
    } catch (e: any) {
      if (e.name === "AbortError") {
        log.ai.debug("AI request aborted by user");
      } else {
        log.ai.error("AI request failed", e);
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Error: Unable to reach Ollama. Make sure it's running on port 11434.",
          },
        ]);
      }
    }

    setStreaming(false);
    setStreamContent("");
  }, [question, highlightText, chatMessages]);

  if (!highlightMenuVisible || !highlightRect) return null;

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: `${Math.min(highlightRect.x, window.innerWidth - 120)}px`,
    top: `${highlightRect.y - 48}px`,
    zIndex: 100,
  };

  return (
    <>
      <div
        className="flex items-center gap-1 rounded-lg border bg-popover px-1 py-1 shadow-md"
        style={menuStyle}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={handlePin}
        >
          <img src="/pin.svg" className="h-3.5 w-3.5" alt="Pin" />
          Pin
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={handleNote}
        >
          <MessageSquare className="h-3 w-3" />
          Note
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={handleAskAI}
        >
          <Sparkles className="h-3 w-3" />
          Ask AI
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={handleImageSearch}
        >
          <Image className="h-3 w-3" />
          Images
        </Button>
      </div>

      {/* Inline note popover */}
      {noteOpen && (
        <div
          className="fixed z-[101] bg-popover border border-border rounded-lg shadow-lg p-3 w-64"
          style={{ left: highlightRect.x - 100, top: highlightRect.y - 120 }}
        >
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note..."
            className="min-h-[60px] text-xs resize-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleNoteSave();
              }
            }}
          />
          <div className="flex justify-end gap-1 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setNoteOpen(false)}
            >
              cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleNoteSave}
            >
              save
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={aiDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            log.ai.debug("AI dialog closing");
            if (abortRef.current) abortRef.current.abort();
          }
          setAiDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[500px] h-[500px] flex flex-col">
          <DialogHeader>
            <DialogTitle>Ask AI about this text</DialogTitle>
          </DialogHeader>

          <div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground line-clamp-4 shrink-0">
            &ldquo;{highlightText}&rdquo;
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-3 pr-4">
              {chatMessages
                .filter((m) => m.role !== "system")
                .map((m, i) => (
                  <div
                    key={i}
                    className={`text-sm ${
                      m.role === "user" ? "text-right" : "text-left"
                    }`}
                  >
                    <div
                      className={`inline-block rounded-lg px-3 py-2 max-w-[85%] ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {m.role === "user"
                        ? m.content.replace(
                            /^Highlighted text:.*\n\nQuestion: /s,
                            "",
                          )
                        : m.content}
                    </div>
                  </div>
                ))}
              {streaming && streamContent && (
                <div className="text-left">
                  <div className="inline-block rounded-lg px-3 py-2 bg-muted max-w-[85%] text-sm">
                    {streamContent}
                  </div>
                </div>
              )}
              {streaming && !streamContent && (
                <div className="text-left text-sm text-muted-foreground animate-pulse">
                  Thinking...
                </div>
              )}
              {!streaming && chatMessages.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Ask a question about the highlighted text.
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex gap-2 pt-2 border-t shrink-0">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendQuestion();
                }
              }}
              placeholder="Ask about this text..."
              className="min-h-[40px] resize-none"
              rows={2}
            />
            <Button
              size="sm"
              onClick={handleSendQuestion}
              disabled={streaming || !question.trim()}
            >
              Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default HighlightMenu;
