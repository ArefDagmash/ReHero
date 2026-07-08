# Narration Context Window — How It Works Now

## The original problem

Narrating a multi-page range used to mean one giant LLM call: all selected
pages concatenated into a single prompt. If that input (plus expected output)
exceeded the model's context window, the model would silently drop the
**oldest** tokens to fit — so it ended up narrating only the last page or two
and skipping everything before it.

## The fix: chunk per page

Instead of one call for the whole range, `Reader.tsx`'s `startNarrate` now
loops **page by page**:

1. Extract text for each page in the selected range.
2. For each page, send a **separate** LLM call (`buildNarrationMessages` +
   `streamLlm`) containing only that page's text.
3. Pass the last ~300 characters of the previous page's narration as a
   "continue smoothly from here" hint, so transitions don't feel abrupt.
4. Append each page's narration to a running transcript.
5. Once every page is narrated, send the **full combined transcript** to
   Kokoro TTS in a single call to produce one continuous audio clip.

Because each LLM call only ever has to hold one page of input, there's no
scenario where a large selected range causes truncation — the call size
doesn't grow with the number of pages you select, only with how much text is
on a single page.

For Ollama specifically, `num_ctx` is still set per call, but now correctly:

```
num_ctx = (that page's estimated input tokens) + maxTokens
```

(previously it was `wholeRangeInputTokens + 2000`, a mismatch that could
still truncate if the configured output budget — `llmMaxTokens`, default
8192 — was larger than the hardcoded 2000 buffer).

## What the `~Nt` estimate in the range picker means now

When you open the range selector and see something like `~4,551t`, that's
just an FYI of the **total** text volume across your whole selected range
(extrapolated from page 1's length × page count) — a rough proxy for how
long generation will take (one call per page), not a truncation-risk
warning. Every individual page call stays small regardless of this number,
so there's no longer a hard ceiling where a large range "breaks."

The color coding (green → red as the number grows) is a holdover from the
single-call design and is more "this will take a while" than "this will
fail" at this point.

## Progress and time estimate

Since generation is now a loop of per-page calls, `Reader.tsx` times each
call (`performance.now()`) and keeps a rolling average. Once at least one
page has completed, the narrate button shows a live ETA:

```
Narrating 4/11 · ~48s left
```

The estimate is `average time per completed page × pages remaining`, so it
self-corrects as it goes rather than relying on a fixed guess — a slow local
Ollama model and a fast cloud API both converge to an accurate number after
the first page or two. Before the first page finishes there's no data yet,
so it just shows `Narrating 1/11...` with no ETA.

The final TTS synthesis step (one call to Kokoro over the full combined
narration) doesn't have an ETA — it's usually short relative to the
generation loop, so it just shows a static "Synthesizing..." state.

## "Page N" indicator during playback

Because narration is generated one page at a time, we know exactly how many
characters of the final combined transcript came from each page. As each
page's narration is appended, `startNarrate` records the character offset
where it starts; once the full transcript is known, those offsets are
converted to **fractions** (`startFrac = charOffset / totalChars`) and
stored alongside the audio as `pageBoundaries`.

During playback, a `timeupdate` listener compares `audio.currentTime /
audio.duration` against these fractions to figure out which page's narration
is currently playing, and a `Page N` label shows next to the mini player.

This is an approximation — it assumes speech pace is roughly proportional to
character count, which holds well enough in practice but isn't exact (pauses
at punctuation, page-to-page density differences, etc. can shift it slightly).

## Saved narrations

Generating a narration is fire-and-forget: once the TTS blob comes back, it's
saved to IndexedDB (`src/lib/narrationStorage.ts`) keyed by the paper's file
path, alongside its page range and `pageBoundaries`. One saved narration is
kept per paper — generating a new one overwrites the last.

`kokoro_server.py` originally returned raw WAV (PCM16 @ 24kHz mono, ~2.9
MB/minute of speech — an 11-page paper's narration was routinely 25–35 MB
stored per paper, indefinitely, in IndexedDB). It now pipes Kokoro's output
through `ffmpeg` to 64kbps mono MP3 (`wav_to_mp3` in `kokoro_server.py`)
before sending it back, which is audibly transparent for spoken narration
and cuts storage ~6x (that same 30 MB narration becomes ~5 MB).

When you reopen a paper that has a saved narration, instead of the normal
"Narrate" button you get:

```
[▶ Resume 1–11]  [+]  [x]
```

- **Resume** instantly plays the saved audio (no LLM/TTS calls at all).
- **+** opens the range picker to generate a fresh narration (overwrites the
  saved one once it completes).
- **x** discards the saved narration.

This avoids the annoying case of leaving a paper mid-read and having to
regenerate the whole narration from scratch just to pick up where you left
off.

## Trade-offs of chunking

- **More requests**: an 11-page range now makes 11 LLM calls instead of 1.
  Slower overall, but each call is fast since it's small.
- **Coherence across pages**: handled with the "continue from here" hint
  rather than shared context, since each call doesn't see prior pages'
  source text — only a tail of the narration output.
- **Works uniformly**: no per-provider special-casing needed. Ollama,
  Anthropic, OpenAI, and OpenCode are all just "one small call per page."
