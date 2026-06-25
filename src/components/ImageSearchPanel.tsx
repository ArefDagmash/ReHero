import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, GripHorizontal, Loader2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

function useDragMove(initialPos: { x: number; y: number }) {
  const [pos, setPos] = useState(initialPos);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        setPos({ x: ev.clientX - offset.current.x, y: ev.clientY - offset.current.y });
      };
      const onUp = () => {
        dragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [pos],
  );

  return { pos, onMouseDown };
}

function useDragResize(initialSize: { w: number; h: number }) {
  const [size, setSize] = useState(initialSize);
  const resizing = useRef(false);
  const start = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const edge = useRef<"e" | "s" | "se" | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent, dir: "e" | "s" | "se") => {
      e.stopPropagation();
      resizing.current = true;
      edge.current = dir;
      start.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
      const onMove = (ev: MouseEvent) => {
        if (!resizing.current) return;
        const dx = ev.clientX - start.current.x;
        const dy = ev.clientY - start.current.y;
        setSize((s) => {
          let w = s.w;
          let h = s.h;
          if (edge.current === "e" || edge.current === "se") w = Math.max(320, start.current.w + dx);
          if (edge.current === "s" || edge.current === "se") h = Math.max(280, start.current.h + dy);
          return { w, h };
        });
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

  return { size, onResizeMouseDown: onMouseDown };
}

async function fetchWikimediaImages(query: string): Promise<string[]> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=30&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json&origin=*`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return [];

    return Object.values(pages as Record<string, any>)
      .map((p: any) => p.imageinfo?.[0]?.thumburl)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function ImageSearchPanel() {
  const imageSearchOpen = useAppStore((s) => s.imageSearchOpen);
  const imageSearchTerm = useAppStore((s) => s.imageSearchTerm);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const { pos, onMouseDown: onDragMouseDown } = useDragMove({
    x: Math.max(40, window.innerWidth - 540),
    y: 80,
  });
  const { size, onResizeMouseDown } = useDragResize({ w: 500, h: 600 });

  const close = () => {
    useAppStore.setState({ imageSearchOpen: false, imageSearchTerm: "" });
  };

  const openYT = () => {
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(imageSearchTerm)}`, "_blank");
  };

  const openGoogle = () => {
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(imageSearchTerm)}`, "_blank");
  };

  useEffect(() => {
    if (!imageSearchOpen || !imageSearchTerm) return;

    let cancelled = false;
    setLoading(true);
    setImages([]);

    fetchWikimediaImages(imageSearchTerm).then((urls) => {
      if (cancelled) return;
      setImages(urls);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [imageSearchOpen, imageSearchTerm]);

  return (
    <AnimatePresence>
      {imageSearchOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="fixed z-50 bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
        >
          {/* Title bar */}
          <div
            onMouseDown={onDragMouseDown}
            className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 cursor-grab active:cursor-grabbing select-none bg-secondary/30"
          >
            <div className="flex items-center gap-2 min-w-0">
              <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/40" />
              <span className="text-xs text-muted-foreground truncate">
                &ldquo;{imageSearchTerm}&rdquo;
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={openYT}
                className="px-2 py-0.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="YouTube"
              >
                YouTube
              </button>
              <button
                onClick={openGoogle}
                className="px-2 py-0.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Google Images"
              >
                Google
              </button>
              <span className="w-px h-3 bg-border mx-0.5" />
              <button
                onClick={close}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Image grid */}
          <div className="flex-1 overflow-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : images.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-sm">
                <p>No images found</p>
                <button
                  onClick={openGoogle}
                  className="text-xs underline hover:text-foreground"
                >
                  search in browser →
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {images.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setZoomedImage(url)}
                    className="block rounded-lg overflow-hidden hover:opacity-90 transition-opacity cursor-zoom-in"
                  >
                    <img
                      src={url}
                      alt={`${imageSearchTerm} ${i + 1}`}
                      className="w-full h-32 object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Resize handles */}
          <div
            onMouseDown={(e) => onResizeMouseDown(e, "e")}
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-ring/20"
          />
          <div
            onMouseDown={(e) => onResizeMouseDown(e, "s")}
            className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-ring/20"
          />
          <div
            onMouseDown={(e) => onResizeMouseDown(e, "se")}
            className="absolute right-0 bottom-0 w-3 h-3 cursor-nwse-resize"
          />

          {/* Lightbox */}
          <AnimatePresence>
            {zoomedImage && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 bg-black/80 flex items-center justify-center overflow-hidden"
                onClick={() => {
                  setZoomedImage(null);
                  setZoomLevel(1);
                  setPan({ x: 0, y: 0 });
                }}
                onWheel={(e) => {
                  e.stopPropagation();
                  setZoomLevel((z) => Math.max(0.5, Math.min(5, z - e.deltaY * 0.002)));
                }}
              >
                <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
                  <span className="text-white/50 text-xs tabular-nums mr-1">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <a
                    href={zoomedImage}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 rounded-md bg-black/50 text-white/80 hover:text-white transition-colors"
                    title="Open original"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    onClick={() => {
                      setZoomedImage(null);
                      setZoomLevel(1);
                      setPan({ x: 0, y: 0 });
                    }}
                    className="p-1.5 rounded-md bg-black/50 text-white/80 hover:text-white transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <img
                  src={zoomedImage}
                  alt={imageSearchTerm}
                  className="max-w-full max-h-full object-contain p-4 select-none"
                  style={{ transform: `scale(${zoomLevel}) translate(${pan.x}px, ${pan.y}px)` }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => {
                    if (zoomLevel <= 1) return;
                    e.stopPropagation();
                    e.preventDefault();
                    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
                    const onMove = (ev: MouseEvent) => {
                      setPan({
                        x: panStart.current.panX + (ev.clientX - panStart.current.x) / zoomLevel,
                        y: panStart.current.panY + (ev.clientY - panStart.current.y) / zoomLevel,
                      });
                    };
                    const onUp = () => {
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                    };
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                  }}
                  draggable={false}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ImageSearchPanel;
