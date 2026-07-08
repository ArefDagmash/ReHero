import type { ChatMessage } from "@/types";
import { log } from "@/lib/logger";

const KOKORO_URL = "http://localhost:8765/tts";

export const NARRATION_SYSTEM_PROMPT = `You are a research paper narrator. Your output will be spoken aloud by a text-to-speech engine.

Core rules:
1. Speak naturally — never output raw symbols. Say "not equal to" not "!=", "squared" not "^2", "arrow" not "->", "approximately" not "~", "is less than or equal to" not "<=", "percent" not "%".
2. Walk through the content sequentially from top to bottom. Never jump ahead or summarize before explaining.
3. Name and explain every concept, term, or variable the first time it appears.
4. For math and formulas: read them left to right in spoken form, then explain intuitively what they mean. Say "the sum of" not the sigma symbol, "the integral of" not the integral symbol.
5. For citations like [1] or (Smith, 2020), say "reference 1" or "by Smith in 2020".
6. Use natural transition phrases: "Now moving on...", "Notice here that...", "This next part describes...", "What this means is..."
7. Keep paragraphs short — no more than 5 sentences without a natural break.
8. No markdown, no code blocks, no bullet lists. Only flowing prose paragraphs.
9. Sound like a tutor sitting next to someone, guiding them through the paper.
10. If the content spans multiple pages, narrate ALL pages sequentially. Do not skip or summarize any section.

Narrate the following research paper content so it sounds natural when read aloud.`;

export function buildNarrationMessages(title: string, pageText: string, previousTail?: string): ChatMessage[] {
  const continuity = previousTail
    ? `\n\nThe narration so far ended with: "...${previousTail}"\nContinue smoothly from there — do not repeat it, do not re-introduce the paper, just carry on into the next section.`
    : "";
  return [
    { role: "system", content: NARRATION_SYSTEM_PROMPT },
    { role: "user", content: `Paper: "${title}"\n\nContent to narrate:\n${pageText}${continuity}` },
  ];
}

let currentAudio: HTMLAudioElement | null = null;

async function ensureKokoroRunning(): Promise<void> {
  const isTauri = "__TAURI_INTERNALS__" in window;
  if (!isTauri) {
    log.narrator.debug("not running in Tauri, skipping Kokoro auto-start");
    return;
  }

  log.narrator.info("ensuring Kokoro server is running");
  const { invoke } = await import("@tauri-apps/api/core");
  const result: string = await invoke("start_kokoro");
  log.narrator.info(`start_kokoro result: ${result}`);

  if (result === "started") {
    log.narrator.info("fresh start — waiting 2s for model to load");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export async function synthesizeSpeechBlob(text: string): Promise<Blob> {
  log.narrator.info("synthesizeSpeechBlob called", { textLen: text.length });

  await ensureKokoroRunning();

  log.narrator.info("POST to Kokoro", { url: KOKORO_URL });
  const response = await fetch(KOKORO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    log.narrator.error("Kokoro returned error", { status: response.status, body: errText });
    throw new Error(errText || `Kokoro server returned ${response.status}`);
  }

  const blob = await response.blob();
  log.narrator.info("received audio", { sizeBytes: blob.size });
  return blob;
}

export function playAudioBlob(blob: Blob, startAtSeconds = 0): HTMLAudioElement {
  stopSpeaking();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  if (startAtSeconds > 0) {
    // currentTime is ignored until metadata (duration/seekable range) is known.
    audio.addEventListener("loadedmetadata", () => {
      audio.currentTime = startAtSeconds;
    }, { once: true });
  }
  audio.onended = () => {
    log.narrator.info("playback ended");
    URL.revokeObjectURL(url);
    if (currentAudio === audio) currentAudio = null;
  };
  audio.onerror = (e) => {
    log.narrator.error("audio playback error", e);
  };
  currentAudio = audio;
  audio.play();
  log.narrator.info("playback started");
  return audio;
}

export async function speakText(text: string): Promise<HTMLAudioElement> {
  const blob = await synthesizeSpeechBlob(text);
  return playAudioBlob(blob);
}

export function stopSpeaking(): void {
  if (currentAudio) {
    log.narrator.info("stopping playback");
    currentAudio.pause();
    currentAudio = null;
  }
}
