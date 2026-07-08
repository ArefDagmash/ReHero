import { streamLlm } from "@/lib/llmStream";
import { useAppStore } from "@/store/useAppStore";
import { log } from "@/lib/logger";
import type { ChatMessage } from "@/types";
import type { ArxivPaper } from "@/lib/arxiv";

export type ClassificationResult = {
  id: string;
  fits: boolean;
  score: number; // 0-100
  reason: string;
};

export type RankedPaper = ArxivPaper & Partial<ClassificationResult>;

// Abstracts run ~150-250 words; batching ~15 per call keeps the prompt well
// within context for any provider while still doing far fewer round-trips
// than one call per paper.
const BATCH_SIZE = 15;

const SYSTEM_PROMPT = `You are a research paper triage assistant. The user has described what kind of paper they're looking for. You will be given a numbered list of candidate papers, each with an id, title, and abstract.

For EVERY paper in the list, decide:
- fits: true/false — does it plausibly match what the user described?
- score: 0-100 — how well it fits (100 = perfect match, 0 = unrelated)
- reason: one short sentence explaining the score, written for the user

Respond with ONLY a JSON array, no prose, no markdown code fences, nothing before or after it. Every paper id from the list must appear exactly once, in this exact shape:
[{"id":"2107.03374v1","fits":true,"score":85,"reason":"Directly addresses real-time detection under the same hardware constraints."}]`;

function buildBatchMessages(intent: string, batch: ArxivPaper[]): ChatMessage[] {
  const list = batch
    .map((p, i) => `${i + 1}. id=${p.id}\nTitle: ${p.title}\nAbstract: ${p.summary}`)
    .join("\n\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `What I'm looking for: ${intent}\n\nCandidate papers:\n${list}` },
  ];
}

// LLMs reliably wrap JSON in prose/code fences even when told not to (see
// docs/graph-mode-json-display-issue.md) — search for the array rather than
// assuming the whole response is clean JSON.
function extractJsonArray(text: string): unknown[] | null {
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to the bracket scan below
  }

  const start = text.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// classifyPapers() scores each paper against the intent, but batches are
// scored independently — a "90" in batch 1 isn't necessarily calibrated
// against a "90" in batch 2, and even within a batch nothing forces the
// model to actually compare candidates head-to-head rather than judging
// each in isolation. This second pass fixes that: it sees ALL candidates
// together (with their titles + step-1 score/reason, not full abstracts —
// keeps this call small regardless of how many papers there are) and asks
// for one definitive relative ordering.
const RANK_SYSTEM_PROMPT = `You are given a list of candidate papers that were already scored individually against what the user is looking for. Your job now is different: compare them all against EACH OTHER, not in isolation, and produce one definitive ranking from best fit to worst fit.

Two papers can have similar individual scores and still not be equally good matches once compared directly — rank the one that actually better matches what the user described higher, even if their earlier scores were close or tied.

Respond with ONLY a JSON array of paper ids in ranked order, best fit first, no prose, no markdown code fences, nothing before or after it. Every id given must appear exactly once:
["2107.03374v1","2306.14291v4"]`;

function buildRankMessages(intent: string, papers: RankedPaper[]): ChatMessage[] {
  const list = papers
    .map((p, i) => `${i + 1}. id=${p.id}\nTitle: ${p.title}\nIndividual score: ${p.score ?? "unscored"}\nIndividual reason: ${p.reason ?? "n/a"}`)
    .join("\n\n");
  return [
    { role: "system", content: RANK_SYSTEM_PROMPT },
    { role: "user", content: `What I'm looking for: ${intent}\n\nCandidates to rank against each other:\n${list}` },
  ];
}

// Classifies each candidate against the user's stated intent, batching
// requests to stay within context. Batches that fail to parse are skipped
// (their papers just come back unscored) rather than failing the whole
// search — callers should treat missing entries as "couldn't rank this one".
export async function classifyPapers(
  intent: string,
  papers: ArxivPaper[],
  onProgress?: (current: number, total: number) => void,
): Promise<Map<string, ClassificationResult>> {
  const batches = chunk(papers, BATCH_SIZE);
  const results = new Map<string, ClassificationResult>();

  const config = {
    provider: useAppStore.getState().llmProvider,
    model: useAppStore.getState().llmModel,
    ollamaEndpoint: useAppStore.getState().ollamaEndpoint,
    opencodeEndpoint: useAppStore.getState().opencodeEndpoint,
    temperature: useAppStore.getState().llmTemperature,
    maxTokens: useAppStore.getState().llmMaxTokens,
  };

  for (let i = 0; i < batches.length; i++) {
    onProgress?.(i + 1, batches.length);
    const batch = batches[i];
    const messages = buildBatchMessages(intent, batch);

    // Ollama-only: size num_ctx for this batch's own prompt + output budget
    // (see docs/narration-context-window.md for why this matters).
    const promptChars = messages.reduce((n, m) => n + m.content.length, 0);
    const inputCtx = Math.round(promptChars / 4) + config.maxTokens;

    let fullText = "";
    try {
      for await (const piece of streamLlm(messages, { ...config, inputCtx })) {
        fullText += piece;
      }
    } catch (e) {
      log.explore.error("classification batch request failed", { batch: i, error: e });
      continue;
    }

    const parsed = extractJsonArray(fullText);
    if (!parsed) {
      log.explore.error("classification batch: failed to parse JSON", { batch: i, textPreview: fullText.slice(0, 200) });
      continue;
    }

    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.id !== "string") continue;
      results.set(rec.id, {
        id: rec.id,
        fits: Boolean(rec.fits),
        score: typeof rec.score === "number" ? rec.score : 0,
        reason: typeof rec.reason === "string" ? rec.reason : "",
      });
    }
  }

  return results;
}

// Takes already-scored papers and returns a definitive head-to-head ranking
// (paper ids, best fit first), or null if the call/parse failed — callers
// should fall back to sorting by the individual scores in that case rather
// than blocking on this.
export async function rankPapers(intent: string, papers: RankedPaper[]): Promise<string[] | null> {
  const config = {
    provider: useAppStore.getState().llmProvider,
    model: useAppStore.getState().llmModel,
    ollamaEndpoint: useAppStore.getState().ollamaEndpoint,
    opencodeEndpoint: useAppStore.getState().opencodeEndpoint,
    temperature: useAppStore.getState().llmTemperature,
    maxTokens: useAppStore.getState().llmMaxTokens,
  };

  const messages = buildRankMessages(intent, papers);
  const promptChars = messages.reduce((n, m) => n + m.content.length, 0);
  const inputCtx = Math.round(promptChars / 4) + config.maxTokens;

  let fullText = "";
  try {
    for await (const piece of streamLlm(messages, { ...config, inputCtx })) {
      fullText += piece;
    }
  } catch (e) {
    log.explore.error("ranking request failed", e);
    return null;
  }

  const parsed = extractJsonArray(fullText);
  if (!parsed) {
    log.explore.error("ranking: failed to parse JSON", { textPreview: fullText.slice(0, 200) });
    return null;
  }

  const ids = parsed.filter((x): x is string => typeof x === "string");
  return ids.length > 0 ? ids : null;
}
