import { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

// Shared provider/model picker — used by SettingsPage (the source of truth
// for LLM config) and ExplorePage (so you can swap the classification model
// without leaving the tab). Both edit the same global settings; there's
// only one LLM config in this app, just surfaced in two places.
export default function LlmModelPicker({ compact = false }: { compact?: boolean }) {
  const llmProvider = useAppStore((s) => s.llmProvider);
  const setLlmProvider = useAppStore((s) => s.setLlmProvider);
  const llmModel = useAppStore((s) => s.llmModel);
  const setLlmModel = useAppStore((s) => s.setLlmModel);
  const ollamaEndpoint = useAppStore((s) => s.ollamaEndpoint);
  const setOllamaEndpoint = useAppStore((s) => s.setOllamaEndpoint);

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);

  const [opencodeModels, setOpencodeModels] = useState<string[]>([]);
  const [ocDetecting, setOcDetecting] = useState(false);
  const [ocDetectMsg, setOcDetectMsg] = useState<string | null>(null);

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

    const tags = await tryFetch(`${ep}/api/tags`, (d) => (d.models || []).map((m: any) => m.name));
    if (tags.ok && tags.names) {
      setOllamaModels(tags.names);
      setDetectMsg(`Found ${tags.names.length} model${tags.names.length > 1 ? "s" : ""}`);
      setDetecting(false);
      return;
    }

    const v1 = await tryFetch(`${ep}/v1/models`, (d) => (d.data || []).map((m: any) => m.id));
    if (v1.ok && v1.names) {
      setOllamaModels(v1.names);
      setDetectMsg(`Found ${v1.names.length} model${v1.names.length > 1 ? "s" : ""}`);
      setDetecting(false);
      return;
    }

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

  useEffect(() => {
    if (llmProvider === "opencode" && opencodeModels.length === 0) {
      handleOcDetect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llmProvider]);

  const btn = (active: boolean) =>
    `px-2.5 py-1 rounded-md text-xs transition-colors ${
      active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
    }`;

  const selectClass = "flex-1 text-xs bg-secondary rounded-lg px-2.5 py-1.5 outline-none border border-transparent focus:border-border transition-colors min-w-0";
  const labelClass = `text-xs text-muted-foreground shrink-0 ${compact ? "" : "min-w-[70px]"}`;

  return (
    <div className={`flex flex-col gap-2 ${compact ? "" : "gap-3"}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={labelClass}>Provider</span>
        <div className="flex gap-1 shrink-0">
          {(["ollama", "anthropic", "openai", "opencode"] as const).map((p) => (
            <button key={p} onClick={() => setLlmProvider(p)} className={btn(llmProvider === p)}>
              {p === "ollama" ? "Ollama" : p === "anthropic" ? "Anthropic" : p === "openai" ? "OpenAI" : "OpenCode"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={labelClass}>Model</span>
        {llmProvider === "ollama" ? (
          <select value={llmModel} onChange={(e) => setLlmModel(e.target.value)} className={selectClass}>
            {ollamaModels.length > 0
              ? ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)
              : <option value={llmModel}>{llmModel || "Press Detect to list models"}</option>}
            {!ollamaModels.includes(llmModel) && ollamaModels.length > 0 && (
              <option value={llmModel}>{llmModel}</option>
            )}
          </select>
        ) : llmProvider === "opencode" ? (
          opencodeModels.length > 0 ? (
            <select value={llmModel} onChange={(e) => setLlmModel(e.target.value)} className={selectClass}>
              {opencodeModels.map((m) => <option key={m} value={m}>{m}</option>)}
              {!opencodeModels.includes(llmModel) && <option value={llmModel}>{llmModel}</option>}
            </select>
          ) : (
            <span className="flex-1 text-xs text-muted-foreground/50 italic min-w-0 truncate">
              {llmModel || "Detecting models..."}
            </span>
          )
        ) : (
          <input
            type="text"
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
            placeholder={llmProvider === "anthropic" ? "e.g. claude-sonnet-4-20250514" : "e.g. gpt-4o"}
            className={`${selectClass} font-mono`}
          />
        )}

        {llmProvider === "ollama" && (
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="px-2.5 py-1 text-xs bg-secondary text-muted-foreground rounded-md hover:text-foreground transition-colors shrink-0"
          >
            {detecting ? "Scanning..." : "Detect"}
          </button>
        )}
        {llmProvider === "opencode" && (
          <button
            onClick={handleOcDetect}
            disabled={ocDetecting}
            className="px-2.5 py-1 text-xs bg-secondary text-muted-foreground rounded-md hover:text-foreground transition-colors shrink-0"
          >
            {ocDetecting ? "..." : "Detect"}
          </button>
        )}
      </div>

      {llmProvider === "ollama" && !compact && (
        <div className="flex items-center gap-2">
          <span className={labelClass}>Endpoint</span>
          <input
            type="text"
            value={ollamaEndpoint}
            onChange={(e) => setOllamaEndpoint(e.target.value)}
            className="flex-1 text-xs bg-secondary rounded-lg px-2.5 py-1.5 outline-none border border-transparent focus:border-border transition-colors font-mono"
          />
        </div>
      )}
      {llmProvider === "ollama" && detectMsg && <div className="text-xs text-muted-foreground">{detectMsg}</div>}
      {llmProvider === "opencode" && ocDetectMsg && <div className="text-xs text-muted-foreground">{ocDetectMsg}</div>}
    </div>
  );
}
