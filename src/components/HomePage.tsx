import { useCallback, useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Plus, FileText, Trash2, Pencil, X, Settings2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AddPaperModal from "@/components/AddPaperModal";
import { savePdf, deletePdf } from "@/lib/pdfStorage";
import { useAppStore } from "@/store/useAppStore";
import type { Paper } from "@/types";

const cardTilts = [-2, 1.5, -1, 2.5, -0.5, 1];

function HomePage({ onOpenPaper }: { onOpenPaper: () => void }) {
  const papers = useAppStore((s) => s.papers);
  const setActivePaper = useAppStore((s) => s.setActivePaper);
  const addPaper = useAppStore((s) => s.addPaper);
  const removePaper = useAppStore((s) => s.removePaper);
  const doodleColor = useAppStore((s) => s.doodleColor);
  const doodleStyle = useAppStore((s) => s.doodleStyle);
  const strokeCount = useAppStore((s) => s.strokeCount);
  const sloppiness = useAppStore((s) => s.sloppiness);
  const bgTheme = useAppStore((s) => s.bgTheme);
  const setDoodleColor = useAppStore((s) => s.setDoodleColor);
  const setDoodleStyle = useAppStore((s) => s.setDoodleStyle);
  const setStrokeCount = useAppStore((s) => s.setStrokeCount);
  const setSloppiness = useAppStore((s) => s.setSloppiness);
  const setBgTheme = useAppStore((s) => s.setBgTheme);
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = bgTheme;
  }, [bgTheme]);
  const [deleteTarget, setDeleteTarget] = useState<Paper | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleAddPaper = useCallback(
    async (file: File, name: string) => {
      const id = uuidv4();
      const bytes = new Uint8Array(await file.arrayBuffer());
      await savePdf(id, bytes);
      addPaper({
        id,
        title: name,
        filePath: `idb://${id}`,
        totalPages: 0,
        lastPage: 1,
        tags: [],
      });
    },
    [addPaper],
  );

  const handleDelete = useCallback(
    (paper: Paper) => {
      if (paper.filePath.startsWith("idb://")) {
        const id = paper.filePath.slice(6);
        deletePdf(id).catch(() => {});
      }
      removePaper(paper.id);
      setDeleteTarget(null);
    },
    [removePaper],
  );

  const handleEditStart = useCallback((paper: Paper) => {
    setEditingId(paper.id);
    setEditName(paper.title);
  }, []);

  const handleEditSave = useCallback(
    (paper: Paper) => {
      const name = editName.trim();
      if (name) {
        useAppStore.setState((s) => ({
          papers: s.papers.map((p) =>
            p.id === paper.id ? { ...p, title: name } : p,
          ),
        }));
      }
      setEditingId(null);
    },
    [editName],
  );

  const handlePaperClick = useCallback(
    (paper: Paper) => {
      if (editingId) return;
      setActivePaper(paper.filePath);
      onOpenPaper();
    },
    [setActivePaper, onOpenPaper, editingId],
  );

  if (papers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <button
          onClick={() => setModalOpen(true)}
          className="flex flex-col items-center gap-5 p-24 rounded-2xl bg-card border border-border shadow-sm hover:shadow-md hover:scale-[1.02] transition-all group"
        >
          <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center group-hover:scale-110 transition-transform">
            <Plus className="h-7 w-7 text-muted-foreground" />
          </div>
          <span className="text-sm text-muted-foreground">add paper</span>
        </button>

        <AddPaperModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onAdd={handleAddPaper}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden relative">
      {/* Settings — top left */}
      <div className="absolute top-4 left-4 z-20">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-all text-sm text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" />
          <span>selection</span>
        </button>

        <AnimatePresence>
          {settingsOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="mt-2 bg-card border border-border rounded-xl shadow-lg p-4 flex flex-col gap-4"
            >
              {/* Color */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">color</span>
                <svg className="h-3 w-8" viewBox="0 0 32 4">
                  <path d="M0,2 Q4,0 8,2 Q12,4 16,2 Q20,0 24,2 Q28,4 32,2" stroke={doodleColor} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
                {["red", "blue", "green", "orange", "purple", "yellow"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setDoodleColor(c)}
                    className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${
                      doodleColor === c ? "ring-2 ring-foreground ring-offset-1" : ""
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>

              {/* Style */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">style</span>
                <svg className="h-3 w-8" viewBox="0 0 32 8">
                  {doodleStyle === "underline" && (
                    <path d="M0,6 Q4,4 8,6 Q12,8 16,6 Q20,4 24,6 Q28,8 32,6" stroke={doodleColor} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  )}
                  {doodleStyle === "strikethrough" && (
                    <path d="M0,4 Q4,2 8,4 Q12,6 16,4 Q20,2 24,4 Q28,6 32,4" stroke={doodleColor} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  )}
                  {doodleStyle === "squiggly" && (
                    <rect x="1" y="1" width="30" height="6" rx="2" stroke={doodleColor} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  )}
                </svg>
                {(["underline", "strikethrough", "squiggly"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setDoodleStyle(s)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      doodleStyle === s ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Strokes */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">strokes</span>
                <svg className="h-3 w-8" viewBox="0 0 32 6">
                  {Array.from({ length: strokeCount }, (_, i) => (
                    <path
                      key={i}
                      d={`M0,${1.5 + i * 2} Q4,${0 + i * 2} 8,${1.5 + i * 2} Q12,${3 + i * 2} 16,${1.5 + i * 2} Q20,${0 + i * 2} 24,${1.5 + i * 2} Q28,${3 + i * 2} 32,${1.5 + i * 2}`}
                      stroke={doodleColor}
                      strokeWidth="1"
                      fill="none"
                      strokeLinecap="round"
                    />
                  ))}
                </svg>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => setStrokeCount(n)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      strokeCount === n ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {n}x
                  </button>
                ))}
              </div>

              {/* Sloppiness */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">rough</span>
                <svg className="h-3 w-8" viewBox="0 0 32 6">
                  <path
                    d={
                      sloppiness === "clean"
                        ? "M0,3 Q4,2 8,3 Q12,4 16,3 Q20,2 24,3 Q28,4 32,3"
                        : sloppiness === "medium"
                          ? "M0,3 Q3,1 6,4 Q9,0 12,3 Q15,5 18,2 Q21,1 24,4 Q27,2 30,3 Q32,1 32,1"
                          : "M0,3 Q2,0 5,5 Q8,1 10,4 Q13,0 16,5 Q19,2 22,0 Q25,4 28,1 Q30,5 32,2"
                    }
                    stroke={doodleColor}
                    strokeWidth="1.2"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
                {(["clean", "medium", "sloppy"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setSloppiness(l)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      sloppiness === l ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {/* Background */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">bg</span>
                <div
                  className="w-8 h-3 rounded border border-border"
                  style={{
                    background:
                      bgTheme === "dark"
                        ? "hsl(0 0% 3.9%)"
                        : bgTheme === "sepia"
                          ? "hsl(40 30% 92%)"
                          : "hsl(0 0% 96%)",
                  }}
                />
                {(["light", "sepia", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setBgTheme(t)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      bgTheme === t ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 flex items-center px-16 overflow-x-auto gap-12 py-20">
        <AnimatePresence>
          {papers.map((paper, i) => (
            <motion.div
              key={paper.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, delay: i * 0.05 }}
              className="shrink-0 flex flex-col items-center gap-2"
              style={{ transform: `rotate(${cardTilts[i % cardTilts.length]}deg)` }}
              onMouseEnter={() => setHoveredId(paper.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                onClick={() => handlePaperClick(paper)}
                className="w-80 h-[28rem] bg-card rounded-xl shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all flex flex-col items-center justify-center p-8 relative group border border-border/50"
              >
                <FileText className="h-16 w-16 text-muted-foreground/15 mb-5" />
                {editingId === paper.id ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEditSave(paper);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => handleEditSave(paper)}
                    className="text-base text-center bg-transparent border-b border-border outline-none w-full px-2 text-foreground"
                    autoFocus
                  />
                ) : (
                  <p className="text-base text-center text-muted-foreground line-clamp-6 font-medium leading-relaxed">
                    {paper.title}
                  </p>
                )}
              </button>

              {/* Bottom bar: page count or actions */}
              <div className="flex items-center justify-center min-h-[28px]">
                <AnimatePresence mode="wait">
                  {hoveredId === paper.id ? (
                    <motion.div
                      key="actions"
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -10, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1.5"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditStart(paper);
                        }}
                        className="p-1.5 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-secondary transition-colors"
                        title="Rename"
                      >
                        <Pencil className="h-5 w-5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(paper);
                        }}
                        className="p-1.5 rounded-md text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </motion.div>
                  ) : (
                    <motion.span
                      key="pages"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      className="text-xs text-muted-foreground"
                    >
                      {paper.totalPages > 0 ? `${paper.totalPages} pages` : ""}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <button
          onClick={() => setModalOpen(true)}
          className="shrink-0 flex flex-col items-center gap-4 group"
        >
          <div className="w-80 h-[28rem] rounded-xl bg-card border border-border shadow-md hover:shadow-lg hover:scale-105 hover:border-muted-foreground/20 transition-all flex items-center justify-center">
            <Plus className="h-12 w-12 text-muted-foreground/25 group-hover:text-muted-foreground/50 transition-colors" />
          </div>
          <span className="text-xs text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors">add paper</span>
        </button>
      </div>

      <AddPaperModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={handleAddPaper}
      />

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40"
              onClick={() => setDeleteTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-card rounded-xl shadow-xl p-6 w-full max-w-xs mx-4"
            >
              <button
                onClick={() => setDeleteTarget(null)}
                className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="text-sm text-foreground mb-1">Delete paper?</p>
              <p className="text-xs text-muted-foreground mb-4 line-clamp-2">
                &ldquo;{deleteTarget.title}&rdquo; will be permanently removed.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteTarget)}
                  className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 transition-colors"
                >
                  delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default HomePage;
