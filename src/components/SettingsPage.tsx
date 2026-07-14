import { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getKey, setKey, deleteKey } from "@/lib/secureStore";
import LlmModelPicker from "@/components/LlmModelPicker";

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      {children}
    </div>
  );
}

function SettingsPage() {
  const bgTheme = useAppStore((s) => s.bgTheme);
  const setBgTheme = useAppStore((s) => s.setBgTheme);
  const doodleColor = useAppStore((s) => s.doodleColor);
  const setDoodleColor = useAppStore((s) => s.setDoodleColor);
  const doodleStyle = useAppStore((s) => s.doodleStyle);
  const setDoodleStyle = useAppStore((s) => s.setDoodleStyle);
  const strokeCount = useAppStore((s) => s.strokeCount);
  const setStrokeCount = useAppStore((s) => s.setStrokeCount);
  const sloppiness = useAppStore((s) => s.sloppiness);
  const setSloppiness = useAppStore((s) => s.setSloppiness);
  const llmProvider = useAppStore((s) => s.llmProvider);
  const llmMaxTokens = useAppStore((s) => s.llmMaxTokens);
  const setLlmMaxTokens = useAppStore((s) => s.setLlmMaxTokens);
  const zoom = useAppStore((s) => s.zoom);
  const setZoom = useAppStore((s) => s.setZoom);
  const rightDockWidth = useAppStore((s) => s.rightDockWidth);
  const leftDockWidth = useAppStore((s) => s.leftDockWidth);

  const [apiKey, setApiKeyInput] = useState("");
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    const provider = useAppStore.getState().llmProvider;
    if (provider !== "ollama") {
      getKey(provider).then(setSavedApiKey);
    } else {
      setSavedApiKey(null);
    }
  }, [llmProvider]);

  const rowClass = "flex items-center gap-3";
  const labelClass = "text-sm text-muted-foreground min-w-[90px] shrink-0";

  const btn = (active: boolean) =>
    `px-3 py-1 rounded-md text-sm transition-colors ${
      active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div
      className="flex-1 flex flex-col bg-background overflow-hidden overflow-y-auto transition-[margin] duration-150"
      style={{ marginRight: rightDockWidth || undefined, marginLeft: leftDockWidth || undefined }}
    >
      <div className="max-w-lg mx-auto w-full p-8 pb-24">
        <h1 className="text-lg font-medium text-foreground mb-8">Settings</h1>

        <div className="flex flex-col gap-8">
          {/* General */}
          <SettingGroup title="General">
            <div className={rowClass}>
              <span className={labelClass}>Theme</span>
              <div className="flex gap-1">
                {(["light", "sepia", "dark"] as const).map((t) => (
                  <button key={t} onClick={() => setBgTheme(t)} className={btn(bgTheme === t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </SettingGroup>

          {/* Reading */}
          <SettingGroup title="Reading">
            <div className={rowClass}>
              <span className={labelClass}>Default zoom</span>
              <div className="flex gap-1">
                {[0.75, 1.0, 1.25, 1.5].map((z) => (
                  <button key={z} onClick={() => setZoom(z)} className={btn(zoom === z)}>
                    {Math.round(z * 100)}%
                  </button>
                ))}
              </div>
            </div>
            <div className={rowClass}>
              <span className={labelClass}>Font size</span>
              <span className="text-sm text-muted-foreground/50 italic">Coming soon</span>
            </div>
          </SettingGroup>

          {/* Doodles */}
          <SettingGroup title="Doodles">
            <div className={rowClass}>
              <span className={labelClass}>Color</span>
              <div className="flex gap-1.5">
                {["red", "blue", "green", "orange", "purple", "yellow"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setDoodleColor(c)}
                    className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                      doodleColor === c ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : ""
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className={rowClass}>
              <span className={labelClass}>Style</span>
              <div className="flex gap-1">
                {(["underline", "strikethrough", "squiggly"] as const).map((s) => (
                  <button key={s} onClick={() => setDoodleStyle(s)} className={btn(doodleStyle === s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className={rowClass}>
              <span className={labelClass}>Strokes</span>
              <div className="flex gap-1">
                {[1, 2, 3].map((n) => (
                  <button key={n} onClick={() => setStrokeCount(n)} className={btn(strokeCount === n)}>
                    {n}x
                  </button>
                ))}
              </div>
            </div>
            <div className={rowClass}>
              <span className={labelClass}>Roughness</span>
              <div className="flex gap-1">
                {(["clean", "medium", "sloppy"] as const).map((l) => (
                  <button key={l} onClick={() => setSloppiness(l)} className={btn(sloppiness === l)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </SettingGroup>

          {/* AI / LLM */}
          <SettingGroup title="AI / LLM">
            <LlmModelPicker />

            {/* Max tokens */}
            <div className={rowClass}>
              <span className={labelClass}>Max tokens</span>
              <input
                type="number"
                min={256}
                max={16384}
                step={256}
                value={llmMaxTokens}
                onChange={(e) => setLlmMaxTokens(Math.max(256, parseInt(e.target.value) || 256))}
                className="w-28 text-sm bg-secondary rounded-lg px-3 py-1.5 outline-none border border-transparent focus:border-border transition-colors"
              />
            </div>

            {/* API key (cloud & opencode) */}
            {llmProvider !== "ollama" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className={labelClass}>{llmProvider === "anthropic" ? "Anthropic" : llmProvider === "opencode" ? "OpenCode" : "OpenAI"} key</span>
                  {savedApiKey && (
                    <button
                      onClick={() => { deleteKey(llmProvider); setSavedApiKey(null); setApiKeyInput(""); }}
                      className="text-xs text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      remove
                    </button>
                  )}
                </div>
                {savedApiKey ? (
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm bg-secondary rounded-lg px-3 py-2 font-mono truncate">
                      {showApiKey ? savedApiKey : savedApiKey.slice(0, 8) + "••••" + savedApiKey.slice(-4)}
                    </span>
                    <button onClick={() => setShowApiKey(!showApiKey)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                      {showApiKey ? "hide" : "show"}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={llmProvider === "anthropic" ? "sk-ant-api..." : "sk-..."}
                      className="flex-1 text-sm bg-secondary rounded-lg px-3 py-2 outline-none border border-transparent focus:border-border transition-colors"
                    />
                    <button
                      onClick={async () => {
                        if (!apiKey.trim()) return;
                        await setKey(llmProvider, apiKey.trim());
                        setSavedApiKey(apiKey.trim());
                        setApiKeyInput("");
                      }}
                      className="px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:opacity-80 transition-opacity"
                    >
                      save
                    </button>
                  </div>
                )}
              </div>
            )}
          </SettingGroup>

          {/* Shortcuts */}
          <SettingGroup title="Shortcuts">
            <table className="text-sm">
              <tbody>
                {[
                  ["Ctrl+O", "Open file"],
                  ["Mouse wheel", "Zoom in / out"],
                  ["Drag & drop", "Add PDF"],
                  ["Select text", "Highlight menu"],
                  ["Right edge drag", "Dock sketchpad"],
                  ["Left edge drag", "Dock image search"],
                ].map(([key, desc]) => (
                  <tr key={key}>
                    <td className="py-1 pr-6 font-mono text-xs text-foreground whitespace-nowrap">{key}</td>
                    <td className="py-1 text-muted-foreground">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SettingGroup>

          {/* Data */}
          <SettingGroup title="Data">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => {
                  localStorage.removeItem("research-reader-annotations");
                  useAppStore.setState({ pinnedDoodles: {} });
                }}
                className="px-4 py-2 text-sm bg-red-500/10 text-red-600 rounded-lg hover:bg-red-500/20 transition-colors"
              >
                Clear annotations
              </button>
              <button
                onClick={() => {
                  const annotations = useAppStore.getState().annotations;
                  const doodles = useAppStore.getState().pinnedDoodles;
                  const blob = new Blob([JSON.stringify({ annotations, doodles }, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "research-reader-export.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-4 py-2 text-sm bg-secondary text-muted-foreground rounded-lg hover:text-foreground transition-colors"
              >
                Export data
              </button>
              <button
                onClick={() => {
                  const { papers, annotations, conversations } = useAppStore.getState();
                  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
                  const lines: string[] = [`# Research Notes`, `*Exported from ReHero · ${date}*`, ""];
                  let hasContent = false;
                  for (const paper of papers) {
                    const paperAnnotations = annotations[paper.filePath] || [];
                    const paperConversations = conversations[paper.filePath] || [];
                    if (paperAnnotations.length === 0 && paperConversations.length === 0) continue;
                    hasContent = true;
                    lines.push("---", "", `## ${paper.title}`, `*${paper.totalPages} pages · last read page ${paper.lastPage}*`, "");
                    if (paperAnnotations.length > 0) {
                      lines.push("### Notes", "");
                      const byPage = paperAnnotations.reduce((acc, a) => {
                        (acc[a.pageNumber] ||= []).push(a);
                        return acc;
                      }, {} as Record<number, typeof paperAnnotations>);
                      for (const [page, anns] of Object.entries(byPage).sort(([a], [b]) => +a - +b)) {
                        for (const ann of anns) {
                          if (ann.highlightedText) lines.push(`**Page ${page}** — *"${ann.highlightedText}"*`);
                          else lines.push(`**Page ${page}**`);
                          if (ann.note) lines.push(`> ${ann.note.replace(/\n/g, "\n> ")}`);
                          lines.push("");
                        }
                      }
                    }
                    if (paperConversations.length > 0) {
                      lines.push("### AI Conversations", "");
                      for (const entry of paperConversations) {
                        const modeLabel = entry.mode.charAt(0).toUpperCase() + entry.mode.slice(1);
                        lines.push(`**${modeLabel}** · Page ${entry.page}`);
                        if (entry.sourceHighlight) lines.push(`*"${entry.sourceHighlight.slice(0, 120)}${entry.sourceHighlight.length > 120 ? "…" : ""}"*`);
                        lines.push(`Q: ${entry.question}`, "");
                        lines.push(entry.answer, "");
                      }
                    }
                    lines.push("");
                  }
                  if (!hasContent) return;
                  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "research-notes.md";
                  a.click();
                  URL.revokeObjectURL(url);
                  useAppStore.getState().awardXP("export_notes");
                }}
                className="px-4 py-2 text-sm bg-secondary text-muted-foreground rounded-lg hover:text-foreground transition-colors"
              >
                Export notes (.md)
              </button>
            </div>
          </SettingGroup>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
