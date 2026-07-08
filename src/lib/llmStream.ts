// ponytail: raw HTTP + streaming, no SDKs.
// Pattern from odysseus: resolve endpoint → build headers → build URL → stream.
// Pipeline: resolveEndpoint → buildHeaders → buildPayload → streamLlm
import { getKey } from "@/lib/secureStore";
import type { ChatMessage } from "@/types";

export type LlmProvider = "ollama" | "anthropic" | "openai" | "opencode";

type LlmConfig = {
  provider: string;
  model: string;
  ollamaEndpoint: string;
  opencodeEndpoint: string;
  temperature: number;
  maxTokens: number;
  inputCtx?: number;
  onReasoning?: (chunk: string) => void;
};

type StreamResult = { text: string; reasoning: string };

// ── Resolve: provider → (endpoint URL, plaintext API key or null) ──────
async function resolveEndpoint(provider: string, config: LlmConfig) {
  if (provider === "ollama") return { url: `${config.ollamaEndpoint}/api/chat`, apiKey: null as string | null };

  const isTauri = "__TAURI_INTERNALS__" in window;

  if (provider === "opencode") {
    const apiKey = await getKey("opencode");
    const base = isTauri
      ? (config.opencodeEndpoint || "https://opencode.ai/zen/go/v1")
      : "/api/proxy/opencode/zen/go/v1";
    return { url: `${base}/chat/completions`, apiKey };
  }

  // Cloud providers: use proxy in web mode (Vite dev proxy or production reverse proxy)
  const apiKey = await getKey(provider);
  if (!apiKey) throw new Error(`No ${provider} API key configured`);

  if (provider === "anthropic") {
    const base = isTauri ? "https://api.anthropic.com" : "/api/proxy/anthropic";
    return { url: `${base}/v1/messages`, apiKey };
  }
  const base = isTauri ? "https://api.openai.com" : "/api/proxy/openai";
  return { url: `${base}/v1/chat/completions`, apiKey };
}

// ── Build: provider + key → HTTP headers ───────────────────────────────
function buildHeaders(provider: string, apiKey: string | null): Record<string, string> {
  const base = { "Content-Type": "application/json" };
  if (provider === "anthropic") return { ...base, "x-api-key": apiKey!, "anthropic-version": "2023-06-01" };
  if (provider === "ollama") return base;
  // openai, opencode — Bearer auth (skip if no key)
  if (!apiKey) return base;
  return { ...base, Authorization: `Bearer ${apiKey}` };
}

// ── Build: provider + params → request body JSON ───────────────────────
function buildPayload(
  provider: string,
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  stream: boolean,
  inputCtx?: number,
): string {
  if (provider === "ollama") {
    const body: any = { model, messages, temperature, stream };
    if (maxTokens) body.options = { num_predict: maxTokens };
    if (inputCtx) body.options = { ...body.options, num_ctx: inputCtx };
    return JSON.stringify(body);
  }
  if (provider === "anthropic") {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    return JSON.stringify({
      model, max_tokens: maxTokens, temperature,
      system: systemMsg?.content || "",
      messages: chatMessages,
      stream,
    });
  }
  return JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream });
}

// ── Stream: fetch + SSE parser + async generator ───────────────────────
export async function* streamLlm(
  messages: ChatMessage[],
  config: LlmConfig,
): AsyncGenerator<string, StreamResult, unknown> {
  const { provider, model, temperature, maxTokens } = config;

  const { url, apiKey } = await resolveEndpoint(provider, config);
  const headers = buildHeaders(provider, apiKey);
  const body = buildPayload(provider, model, messages, temperature, maxTokens, true, config.inputCtx);

  const response = await fetch(url, { method: "POST", headers, body });
  if (!response.ok) {
    let detail = `${provider} returned ${response.status}`;
    try {
      const errBody = await response.text();
      if (errBody) detail += ` — ${errBody.slice(0, 300)}`;
    } catch {}
    throw new Error(detail);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullText = "";
  let reasoningText = "";

  if (provider === "ollama") {
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        try {
          const p = JSON.parse(line.trim());
          if (p.message?.content) {
            fullText += p.message.content;
            yield p.message.content;
          }
        } catch {}
      }
    }
  } else {
    // SSE streaming: parse data: lines as they arrive
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() || "";
      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const p = JSON.parse(data);

            // Anthropic
            if (p.type === "content_block_delta" && p.delta?.text) {
              fullText += p.delta.text;
              yield p.delta.text;
              continue;
            }

            // OpenAI / OpenCode / DeepSeek
            const choice = p.choices?.[0]?.delta;
            if (!choice) continue;
            if (choice.content != null && choice.content !== "") {
              fullText += choice.content;
              yield choice.content;
            }
            if (choice.reasoning_content != null && choice.reasoning_content !== "") {
              reasoningText += choice.reasoning_content;
              config.onReasoning?.(choice.reasoning_content);
            }
          } catch {}
        }
      }
    }

    // Non-streaming fallback: parse entire remaining buf as single JSON
    if (!fullText && buf.trim()) {
      try {
        const p = JSON.parse(buf.trim());
        const c = p.choices?.[0]?.message?.content
          || p.choices?.[0]?.text
          || p.content
          || "";
        if (c) { fullText = c; yield c; }
      } catch {}
    }
  }

  // Diagnostic: if we got nothing, dump what we know so user can see
  if (!fullText) {
    const diagParts = ["EMPTY RESPONSE"];
    if (reasoningText) diagParts.push(`reasoning:${reasoningText.length}chars`);
    else diagParts.push("NO reasoning text at all");
    diagParts.push(`startPrefix:${(reasoningText || "").slice(0, 80)}`);
    fullText = diagParts.join(" | ");
    yield fullText;
  }

  return { text: fullText, reasoning: reasoningText };
}


