import { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getKey, setKey, deleteKey } from "@/lib/secureStore";
import { ACHIEVEMENT_DEFS, LEVELS, getXpForNextLevel, RARITY_COLORS } from "@/lib/gamification";

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
  const setLlmProvider = useAppStore((s) => s.setLlmProvider);
  const llmModel = useAppStore((s) => s.llmModel);
  const setLlmModel = useAppStore((s) => s.setLlmModel);
  const ollamaEndpoint = useAppStore((s) => s.ollamaEndpoint);
  const setOllamaEndpoint = useAppStore((s) => s.setOllamaEndpoint);
  const llmMaxTokens = useAppStore((s) => s.llmMaxTokens);
  const setLlmMaxTokens = useAppStore((s) => s.setLlmMaxTokens);
  const zoom = useAppStore((s) => s.zoom);
  const setZoom = useAppStore((s) => s.setZoom);
  const rightDockWidth = useAppStore((s) => s.rightDockWidth);
  const leftDockWidth = useAppStore((s) => s.leftDockWidth);

  useEffect(() => {
    document.documentElement.dataset.theme = bgTheme;
  }, [bgTheme]);

  const [apiKey, setApiKeyInput] = useState("");
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);

  const [opencodeModels, setOpencodeModels] = useState<string[]>([]);
  const [ocDetecting, setOcDetecting] = useState(false);
  const [ocDetectMsg, setOcDetectMsg] = useState<string | null>(null);

  useEffect(() => {
    const provider = useAppStore.getState().llmProvider;
    if (provider !== "ollama") {
      getKey(provider).then(setSavedApiKey);
    } else {
      setSavedApiKey(null);
    }
  }, [llmProvider]);

  const handleDetect = async () => {
    setDetecting(true);
    setDetectMsg(null);

    const ep = useAppStore.getState().ollamaEndpoint || "http://localhost:11434";
    if (!useAppStore.getState().ollamaEndpoint) setOllamaEndpoint(ep);

    const tryFetch = async (url: string, parse: (data: any) => string[]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return { ok: false, msg: `HTTP ${res.status}` };
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          const names = parse(data);
          if (names.length > 0) return { ok: true, names };
          return { ok: false, msg: `No models in response. Raw: ${text.slice(0, 200)}` };
        } catch {
          return { ok: false, msg: `Not JSON. Raw: ${text.slice(0, 200)}` };
        }
      } catch (e: any) {
        return { ok: false, msg: e.message || "Network error" };
      }
    };

    // try /api/tags first (native)
    const tags = await tryFetch(`${ep}/api/tags`, (d) => (d.models || []).map((m: any) => m.name));
    if (tags.ok && tags.names) {
      setOllamaModels(tags.names);
      setDetectMsg(`Found ${tags.names.length} model${tags.names.length > 1 ? "s" : ""}`);
      setDetecting(false);
      return;
    }

    // try /v1/models fallback
    const v1 = await tryFetch(`${ep}/v1/models`, (d) => (d.data || []).map((m: any) => m.id));
    if (v1.ok && v1.names) {
      setOllamaModels(v1.names);
      setDetectMsg(`Found ${v1.names.length} model${v1.names.length > 1 ? "s" : ""}`);
      setDetecting(false);
      return;
    }

    // both failed — show the error from /api/tags (primary endpoint)
    setDetectMsg(`[${ep}/api/tags] ${tags.msg || v1.msg || "Unknown error"}`);
    setDetecting(false);
  };

  const handleOcDetect = async () => {
    setOcDetecting(true);
    setOcDetectMsg(null);
    const isTauri = "__TAURI_INTERNALS__" in window;
    const base = isTauri
      ? (useAppStore.getState().opencodeEndpoint || "https://opencode.ai/zen/go/v1")
      : "/api/proxy/opencode/zen/go/v1";
    try {
      const res = await fetch(`${base}/models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const names: string[] = (data.data || []).map((m: any) => m.id).filter(Boolean);
      if (names.length > 0) {
        setOpencodeModels(names);
        setOcDetectMsg(`Found ${names.length} model${names.length > 1 ? "s" : ""}`);
        const cur = useAppStore.getState().llmModel;
        if (!names.includes(cur)) setLlmModel(names[0]);
      } else {
        setOcDetectMsg("No models returned");
      }
    } catch (e: any) {
      setOcDetectMsg(e.message || "Failed to list models");
    }
    setOcDetecting(false);
  };

  // Auto-detect models on provider switch
  useEffect(() => {
    if (llmProvider === "opencode" && opencodeModels.length === 0) {
      handleOcDetect();
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
            {/* Provider */}
            <div className={rowClass}>
              <span className={labelClass}>Provider</span>
              <div className="flex gap-1">
                {(["ollama", "anthropic", "openai", "opencode"] as const).map((p) => (
                  <button key={p} onClick={() => setLlmProvider(p)} className={btn(llmProvider === p)}>
                    {p === "ollama" ? "Ollama" : p === "anthropic" ? "Anthropic" : p === "openai" ? "OpenAI" : "OpenCode"}
                  </button>
                ))}
              </div>
            </div>

             {/* Ollama endpoint (only when ollama) */}
            {llmProvider === "ollama" && (
              <>
                <div className={rowClass}>
                  <span className={labelClass}>Endpoint</span>
                  <input
                    type="text"
                    value={ollamaEndpoint}
                    onChange={(e) => setOllamaEndpoint(e.target.value)}
                    className="flex-1 text-sm bg-secondary rounded-lg px-3 py-1.5 outline-none border border-transparent focus:border-border transition-colors font-mono"
                  />
                  <button
                    onClick={handleDetect}
                    disabled={detecting}
                    className="px-3 py-1 text-xs bg-secondary text-muted-foreground rounded-md hover:text-foreground transition-colors shrink-0"
                  >
                    {detecting ? "Scanning..." : "Detect"}
                  </button>
                </div>
                {detectMsg && (
                  <div className="text-xs text-muted-foreground ml-[90px]">{detectMsg}</div>
                )}
              </>
            )}

            {/* Model */}
            <div className={rowClass}>
              <span className={labelClass}>Model</span>
              {llmProvider === "ollama" ? (
                <select
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  className="flex-1 text-sm bg-secondary rounded-lg px-3 py-1.5 outline-none border border-transparent focus:border-border transition-colors"
                >
                  {ollamaModels.length > 0
                    ? ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)
                    : <option value={llmModel}>{llmModel || "Press Detect to list models"}</option>}
                  {!ollamaModels.includes(llmModel) && ollamaModels.length > 0 && (
                    <option value={llmModel}>{llmModel}</option>
                  )}
                </select>
              ) : llmProvider === "opencode" ? (
                <>
                  {opencodeModels.length > 0 ? (
                    <select
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      className="flex-1 text-sm bg-secondary rounded-lg px-3 py-1.5 outline-none border border-transparent focus:border-border transition-colors"
                    >
                      {opencodeModels.map((m) => <option key={m} value={m}>{m}</option>)}
                      {!opencodeModels.includes(llmModel) && <option value={llmModel}>{llmModel}</option>}
                    </select>
                  ) : (
                    <span className="flex-1 text-xs text-muted-foreground/50 italic">
                      {llmModel || "Detecting models..."}
                    </span>
                  )}
                  <button
                    onClick={handleOcDetect}
                    disabled={ocDetecting}
                    className="px-3 py-1 text-xs bg-secondary text-muted-foreground rounded-md hover:text-foreground transition-colors shrink-0"
                  >
                    {ocDetecting ? "..." : "Detect"}
                  </button>
                </>
              ) : (
                <input
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder={llmProvider === "anthropic" ? "e.g. claude-sonnet-4-20250514" : "e.g. gpt-4o"}
                  className="flex-1 text-sm bg-secondary rounded-lg px-3 py-1.5 outline-none border border-transparent focus:border-border transition-colors font-mono"
                />
              )}
            </div>
            {ocDetectMsg && (
              <div className="text-xs text-muted-foreground ml-[90px]">{ocDetectMsg}</div>
            )}

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

          {/* Scholar XP */}
          <SettingGroup title="Scholar XP">
            <ScholarXPPanel />
          </SettingGroup>
        </div>
      </div>
    </div>
  );
}

function ScholarXPPanel() {
  const { xp, level, achievements, stats } = useAppStore((s) => s.gamification);
  const levelInfo = LEVELS[level];
  const nextLevelXp = getXpForNextLevel(level);
  const prevLevelXp = LEVELS[level]?.xp ?? 0;
  const range = nextLevelXp - prevLevelXp;
  const progress = range > 0 ? Math.min(100, ((xp - prevLevelXp) / range) * 100) : 100;
  const isMaxLevel = level >= LEVELS.length - 1;
  const unlockedIds = new Set(achievements.map((a) => a.id));

  return (
    <div className="flex flex-col gap-4">
      {/* Level + XP bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-foreground">{levelInfo.title}</span>
            <span className="text-xs text-muted-foreground/50 ml-2 italic">{levelInfo.flavor}</span>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {xp.toLocaleString()} XP
          </span>
        </div>
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-foreground/30 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        {!isMaxLevel && (
          <p className="text-[10px] text-muted-foreground/40">
            {nextLevelXp - xp} XP until {LEVELS[level + 1]?.title}
          </p>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Pages read", value: stats.totalPagesRead },
          { label: "AI queries", value: stats.totalAiQueries },
          { label: "Annotations", value: stats.totalAnnotations },
        ].map(({ label, value }) => (
          <div key={label} className="bg-secondary/50 rounded-lg py-2 px-3">
            <p className="text-sm font-semibold text-foreground tabular-nums">{value.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground/60">{label}</p>
          </div>
        ))}
      </div>

      {/* Achievements grid */}
      <div>
        <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-2">
          Achievements · {achievements.length}/{ACHIEVEMENT_DEFS.length}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ACHIEVEMENT_DEFS.map((def) => {
            const unlocked = unlockedIds.has(def.id);
            const isSecret = def.secret && !unlocked;
            return (
              <div
                key={def.id}
                title={isSecret ? "???" : `${def.name} — ${def.description}`}
                className={`flex flex-col items-center gap-1 rounded-lg border py-2.5 px-2 text-center transition-opacity ${
                  unlocked ? "border-border bg-card" : "border-border/30 bg-secondary/20 opacity-40"
                }`}
              >
                <span className="text-lg leading-none">{isSecret ? "🔒" : def.icon}</span>
                <span className={`text-[10px] font-medium leading-tight ${unlocked ? RARITY_COLORS[def.rarity] : "text-muted-foreground/40"}`}>
                  {isSecret ? "???" : def.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
