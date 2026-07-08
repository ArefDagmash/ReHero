import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { FileText } from "lucide-react";
import { loadPdf } from "@/lib/pdfStorage";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type Props = {
  paperId: string;
  filePath: string;
};

export default function PdfThumbnail({ filePath }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const docRef: { current: pdfjsLib.PDFDocumentProxy | null } = { current: null };

    async function render() {
      try {
        let bytes: Uint8Array | null = null;
        if (filePath.startsWith("idb://")) {
          bytes = await loadPdf(filePath.slice(6));
        }
        if (!bytes || cancelled) return;

        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) { doc.destroy(); return; }
        docRef.current = doc;

        const page = await doc.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const viewport = page.getViewport({ scale: 0.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setLoaded(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    render();
    return () => {
      cancelled = true;
      docRef.current?.destroy();
    };
  }, [filePath]);

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-secondary/50">
        <FileText className="h-12 w-12 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <div className="w-full h-full relative overflow-hidden rounded-t-xl bg-secondary/30">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <FileText className="h-12 w-12 text-muted-foreground/20 animate-pulse" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-cover object-top transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
