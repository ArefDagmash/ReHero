import { streamLlm } from "@/lib/llmStream";
import { useAppStore } from "@/store/useAppStore";
import { log } from "@/lib/logger";
import { extractJsonArray } from "@/lib/jsonExtract";
import type { ChatMessage } from "@/types";

// arXiv's `all:` field ORs space-separated words together rather than
// treating them as a phrase or ANDing them — verified live:
// `all:diffusion model` echoes back as `all:diffusion OR all:model`, not
// "diffusion AND model" or a phrase match. So handing it a raw,
// sentence-length intent (the previous behavior) matches almost anything
// that shares even one common word with the description. This extracts a
// handful of short key phrases instead; the caller ANDs them together as
// separate quoted `all:"phrase"` clauses (also verified: quoted phrases are
// matched as exact phrases, and explicit AND across them narrows results
// correctly — see docs/explore-tab-plan.md Phase 4).
const SYSTEM_PROMPT = `You convert a natural-language description of a research paper someone wants into short search phrases for arXiv. The caller ANDs your phrases together as EXACT phrase matches — a phrase only matches if that exact wording appears verbatim in a paper's title or abstract. This means:

- Keep phrases SHORT: 1-2 words each, almost never 3+. A 3-word phrase like "hierarchical object detection" is a specific claim that rarely appears verbatim, even though the underlying concepts are common — use "object detection" instead and let it stand alone.
- Use the canonical, commonly-written form of each term, not a paraphrase or invented compound. If you're not confident a phrase would appear word-for-word in real papers, split it into a shorter, more standard term instead (or drop it).
- Only 2-3 phrases total, and only the essential, most distinctive concepts — every extra phrase makes the combination stricter, so a longer list is more likely to match nothing at all. Drop qualifiers like "real-time" or "recent" unless they're truly central to what's being asked.
- Drop filler words, connecting phrases, and vague scoping language like "recent work on", "I'm looking for", "ideally with a".

Respond with ONLY a JSON array of 2-3 short phrases, no prose, no markdown code fences, nothing before or after it:
["object detection","traffic sign"]`;

// Short inputs are already close to keyword form — skip the LLM round trip.
const REWRITE_MIN_WORDS = 5;

// Returns null if rewriting wasn't attempted or failed — callers should fall
// back to searching the raw intent text in that case, same best-effort
// pattern as citation lookups and ranking elsewhere in Explore.
export async function rewriteQuery(intent: string): Promise<string[] | null> {
  const trimmed = intent.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return null;
  if (wordCount < REWRITE_MIN_WORDS) return [trimmed];

  const config = {
    provider: useAppStore.getState().llmProvider,
    model: useAppStore.getState().llmModel,
    ollamaEndpoint: useAppStore.getState().ollamaEndpoint,
    opencodeEndpoint: useAppStore.getState().opencodeEndpoint,
    temperature: useAppStore.getState().llmTemperature,
    maxTokens: useAppStore.getState().llmMaxTokens,
  };

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: trimmed },
  ];

  let fullText = "";
  try {
    for await (const piece of streamLlm(messages, config)) fullText += piece;
  } catch (e) {
    log.explore.error("query rewrite request failed", e);
    return null;
  }

  const parsed = extractJsonArray(fullText);
  if (!parsed) {
    log.explore.error("query rewrite: failed to parse JSON", { textPreview: fullText.slice(0, 200) });
    return null;
  }

  const phrases = parsed
    .filter((x): x is string => typeof x === "string")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3);

  return phrases.length > 0 ? phrases : null;
}
