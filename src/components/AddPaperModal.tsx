import { useCallback, useRef, useState, DragEvent } from "react";
import { Plus, Upload, X } from "lucide-react";
import { motion } from "framer-motion";

type AddPaperModalProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (file: File, name: string) => void;
  variant?: "paper" | "book";
};

function AddPaperModal({ open, onClose, onAdd, variant = "paper" }: AddPaperModalProps) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noun = variant === "book" ? "book" : "paper";

  const handleSubmit = useCallback(() => {
    if (!file) return;
    const itemName = name.trim() || file.name.replace(/\.pdf$/i, "");
    onAdd(file, itemName);
    setName("");
    setFile(null);
    onClose();
  }, [file, name, onAdd, onClose]);

  const handleFile = useCallback((f: File) => {
    if (f.type === "application/pdf" || f.name.endsWith(".pdf")) {
      setFile(f);
      if (!name) {
        setName(f.name.replace(/\.pdf$/i, ""));
      }
    }
  }, [name]);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="relative bg-card rounded-xl shadow-xl p-8 w-full max-w-sm mx-4"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-sm font-medium text-foreground mb-5">new {noun}</h2>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              {noun} name?
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={variant === "book" ? "My Book" : "My Research Paper"}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              drop file
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
                dragOver
                  ? "border-ring bg-ring/5"
                  : file
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-border hover:border-muted-foreground/30"
              }`}
            >
              {file ? (
                <>
                  <Upload className="h-5 w-5 text-green-500" />
                  <span className="text-xs text-muted-foreground truncate max-w-full">
                    {file.name}
                  </span>
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5 text-muted-foreground/50" />
                  <span className="text-xs text-muted-foreground/50">
                    click or drop a PDF
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!file}
            className="w-full py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-20 disabled:cursor-not-allowed"
          >
            add {noun}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default AddPaperModal;
