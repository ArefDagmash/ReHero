# Explore Tab — Plan

## The idea

A new "Explore" tab in the sidebar (below Books). Instead of manually
searching Google/arXiv and judging relevance yourself, you tell the app what
you're looking for — purpose, topic, genre — and it:

1. Searches arXiv (or another paper source) for a batch of candidate papers
2. Has an LLM classify each candidate against what you actually said you need
3. Shows a ranked list (with stats like citation count where available)
4. Lets you add any of them straight into your library with one click

This is **not** "ask an AI agent to browse the web" (unreliable, per the
original ask) — it's a deterministic search API + a classification pass on
real metadata, which is a much more grounded pipeline.

## How this fits the existing app

- Reuses the exact "add paper" pipeline `HomePage.tsx`'s `handleAddPaper`
  already uses: fetch PDF bytes → `savePdf(id, bytes)` (`pdfStorage.ts`) →
  `addPaper({ id, title, filePath: "idb://"+id, totalPages: 0, lastPage: 1,
  tags: [], lastOpenedAt })`. `addPaper` (`useAppStore.ts`) already dedupes
  by `filePath` and awards XP on its own — Explore gets gamification
  integration for free by going through this same action, no new hook needed.
- Reuses the CORS-proxy pattern already established for LLM providers.
  `llmStream.ts`'s `resolveEndpoint()` branches on
  `"__TAURI_INTERNALS__" in window`: native Tauri hits external APIs
  directly (the webview doesn't enforce CORS), web-dev mode goes through a
  `/api/proxy/*` route in `vite.config.ts`. Same branch needed for arXiv:
  direct fetch in Tauri, a 4th proxy route (`/api/proxy/arxiv` →
  `https://export.arxiv.org`) for web-dev.
- Reuses the streaming-LLM-call pattern every other AI feature already uses:
  `let text = ""; for await (const chunk of streamLlm(...)) text += chunk;`
  — no new LLM plumbing, just a new prompt.
- Reuses the "extract structured JSON out of a free-text LLM response"
  lesson from `docs/graph-mode-json-display-issue.md` (Graph mode's
  `extractJson()` searches for a JSON object with expected keys rather than
  assuming the whole response is clean JSON — LLMs wrap JSON in prose/code
  fences constantly). Classification will need the same defensive parsing.
- Follows the current `Sidebar.tsx`/`App.tsx` nav pattern: `navItems` array
  + `ICON_PATHS` entry in `Sidebar.tsx`, one more `View` union member and
  render-switch line in `App.tsx`.

## Open questions (need a decision before/while building, not decided here)

- **Which LLM does classification?** Reuse the user's globally-configured
  provider/model (simplest, consistent with the rest of the app), or let
  Explore use a separate, cheaper/faster model override since classifying
  20+ abstracts in one call is a different cost profile than a chat
  response? Recommend starting with the global setting (Phase 2) and only
  adding a per-feature override later if it turns out to matter.
- **Genre/category input** — free text only, or a curated dropdown of
  common arXiv categories (`cs.CV`, `cs.CL`, `cs.LG`, `stat.ML`, etc.)?
  Recommend free text for the intent + an optional category dropdown as a
  narrowing filter, not a replacement.
- **Query construction** — Phase 1 ships the simplest possible version:
  the user's raw text goes straight into arXiv's `all:` search field.
  Whether to add an LLM query-rewriting step (natural language → arXiv
  search syntax) is a later, optional refinement — arXiv's own search is
  reasonably tolerant of plain keyword text already.
- **Citation/download stats** — arXiv's API doesn't expose this at all.
  Would need a second API (Semantic Scholar's batch lookup-by-arXiv-ID
  endpoint is the natural fit — free, supports a list of IDs in one call).
  This is Phase 3, not required for the feature to be useful.
- **How many candidates to fetch (N)?** Start with a fixed default
  (~20), make it configurable later. Larger N = more LLM classification
  cost per search.

## Phases

### Phase 0 — Plumbing, no real functionality yet

Goal: prove the nav + network path work before writing any real logic.

- [x] Add `"explore"` to the `View` union in `App.tsx` + one render-switch line
- [x] Add an `explore` entry to `navItems` in `Sidebar.tsx` (+ an icon path
      in `ICON_PATHS`, matching the existing hand-drawn-icon style)
- [x] Create `src/components/ExplorePage.tsx` as a placeholder ("Explore —
      coming soon") wired into `App.tsx`'s render switch
- [x] Add the arXiv proxy route to `vite.config.ts` (4th route, mirroring
      the anthropic/openai/opencode ones already there)
- [x] Create `src/lib/arxiv.ts` with a single function: given a raw query
      string, fetch arXiv's Atom feed (`http://export.arxiv.org/api/query`)
      and parse it into a typed array: `{ id, title, authors, summary,
      published, categories, pdfUrl }`
- [x] Manual smoke test: confirmed live in web-dev mode (20 real, correctly
      parsed results back from arXiv through the proxy route)

### Phase 1 — Real search, no AI classification yet

Goal: ship arXiv search inside the app. This alone is already useful and
is the right place to pause and sanity-check the UX before adding AI cost.

- [x] Build the intent form: textarea ("what are you looking for / what
      should this paper cover?"), optional category filter, submit button
- [x] Wire submit → `arxiv.ts` search (raw text as the query, no LLM
      rewriting yet) → render results
- [x] Result card: title, authors, truncated abstract, published date,
      category, "View on arXiv" link, "Add to Library" button
- [x] "Add to Library" extracted into `src/lib/addPaper.ts`
      (`addPaperFromBytes`), used by both `HomePage.tsx` and
      `ExplorePage.tsx` — verified live: added a real arXiv paper, it
      showed up correctly in the Papers tab with a working thumbnail
- [x] Loading/error states. Empty-results state added
      ("No results. Try describing it differently.")

**Correction found while building:** the plan assumed the PDF host
(`arxiv.org`) would need its own proxy route like the search API
(`export.arxiv.org`) does. It doesn't — `arxiv.org/pdf/...` already
responds with `access-control-allow-origin: *`, so the PDF download works
with a direct `fetch()` in both Tauri and web-dev. Only the search API
needed a proxy route. (Worth re-checking this assumption for any future
external API, e.g. Semantic Scholar in Phase 3 — don't assume a proxy is
needed without checking the response headers first.)

**UX decision resolved:** `addPaper`/`addBook` (`useAppStore.ts`) now take
an optional `{ navigate?: boolean }` (default `true`, so manual upload via
`AddPaperModal` is unaffected). `addPaperFromBytes` threads this through.
Explore calls it with `{ navigate: false }` so "Add to Library" just marks
the card "Added" and stays on the results list — verified live, adding two
papers back-to-back keeps the list and both cards' states intact.

First attempt at this got it wrong: undoing `activePaperPath` with a
second `setState` call right after `addPaperFromBytes` resolved *looked*
like it worked (no Reader flash) but actually caused `ExplorePage` to
unmount and remount — `view` genuinely flips through `"reader"` for one
commit before flipping back, since the two `setState` calls land in
separate microtask continuations (there's an `await` between them), so
React commits the intermediate state. That remount silently wiped all
local state (query, results, added markers) even though the flicker itself
was too fast to see, which is why it needs a real fix at the source
(`addPaper` never setting `activePaperPath` in the first place) rather
than papering over the symptom after the fact.

### Phase 2 — AI classification layer

Goal: turn the raw search results into a ranked, reasoned list.

- [x] Design the classification prompt: user's stated intent + a batch of
      candidate abstracts (labeled by arXiv id) → structured JSON:
      `{ id, fits: boolean, score: 0-100, reason: "one sentence" }` per
      paper. Lives in `src/lib/paperClassifier.ts`.
- [x] Batch size: 15 abstracts per LLM call (`BATCH_SIZE` in
      `paperClassifier.ts`), splitting into multiple sequential calls above that.
- [x] Parse the response defensively via `extractJsonArray()` — tries a
      direct `JSON.parse` first, falls back to scanning for a balanced
      `[...]` block in the raw text (per the `graph-mode-json-display-issue.md`
      lesson). A batch that still fails to parse is skipped, not fatal.
- [x] Sort results by fit score descending; each card shows a colored
      "N% fit" badge plus the one-sentence reason (with a sparkle icon).
- [x] Staged status UI: the Search button itself becomes the status —
      "Searching arXiv..." → "Ranking (1/2)" → "Ranking (2/2)" → back to
      "Search". Verified live against a real local Ollama model
      (qwen2.5:3b): sensible scores/reasons, correct sort order.
- [x] Fallback implemented: any batch/parse failure is caught per-batch
      (skipped, not thrown) and a full classification failure falls back
      to the raw Phase 1 list with a small "Couldn't rank results" note —
      never blocks showing results.

**Added after initial ship — comparative ranking pass:** batched scoring
alone isn't real ranking — a "90" in batch 1 isn't calibrated against a
"90" in batch 2, and nothing forces genuine head-to-head comparison even
within a batch. `rankPapers()` in `paperClassifier.ts` adds a second LLM
call that sees ALL scored candidates together (titles + their step-1
score/reason, not full abstracts, so it stays cheap regardless of N) and
returns one definitive ranked order. Results are re-sorted by that order,
falling back to the raw score-sort if this call fails/doesn't parse.
Verified live: final order genuinely doesn't match the raw score order
(an 80%-scored paper ranked above an 85%-scored one after head-to-head
comparison) — proof it's not just re-deriving the naive sort.

**Also added — model picker in Explore:** the provider/model picker was
extracted out of `SettingsPage.tsx` into a shared `LlmModelPicker.tsx`
(compact variant used at the top of Explore, full variant in Settings) —
both edit the same global LLM settings, so there's one source of truth,
just accessible from either place.

**Two bugs found and fixed while building this:**
1. `llmModel` was a single field shared across all providers — switching
   to OpenCode auto-detected and silently overwrote it (e.g. to
   `minimax-m3`), and switching back to Ollama never restored the
   previous value. Fixed with `llmModelByProvider` in `useAppStore.ts`,
   remembering the last model used per provider.
2. The Ollama and OpenCode "Found N models" detect-status messages were
   both rendered unconditionally regardless of which provider tab was
   selected, so triggering both would stack them on screen simultaneously.
   Fixed by gating each message to only render while its own provider is
   active.

**Also added — rank badge + "Look through more papers":**
- Each card now shows a `#N` badge next to its fit % (only once results
  have actually been scored/ranked — the raw fallback list doesn't show a
  misleading rank).
- `searchArxiv()` now takes a `start` offset for pagination. "Look through
  more papers" fetches the next page (`start: rawPapers.length`), scores
  **only the new batch** (reusing already-computed scores for everything
  already loaded — no re-scoring cost), then re-runs the comparative
  ranking pass over the **full combined set** so the whole list stays
  properly ordered against each other, not just the new batch internally.
  Verified live: 20 → 40 results after one click, new batch correctly
  scored and merged into one globally re-ranked list. Shows "No more
  results for this search" once arXiv returns an empty page.

**Also added — score badge polish + full category taxonomy:**
- Rank/fit badges were bumped from `text-[10px]` to `text-xs` with more
  padding (were unreadably small).
- Fit color went from 3 hardcoded buckets to a 10-step gradient
  (`scoreColor()` in `ExplorePage.tsx`): hue interpolated from red (0°) to
  green (130°) across score deciles, rendered as a solid fill + white text
  so contrast holds in any theme (light/sepia/dark) without per-theme
  tuning. Verified live across a real score spread (85/80 → green, 20/10 →
  orange/red-orange, 5 → red).
- The category filter was a curated 9-item CS/ML subset — replaced with
  arXiv's full taxonomy, ~155 categories across 16 groups (`optgroup`)
  matching how arxiv.org itself organizes its archives (Computer Science,
  Economics, EESS, Mathematics, Physics, Astrophysics, Condensed Matter,
  GR & Quantum Cosmology, High Energy Physics, Mathematical Physics,
  Nonlinear Sciences, Nuclear Physics, Quantum Physics, Quantitative
  Biology, Quantitative Finance, Statistics). Lives in
  `ARXIV_CATEGORY_GROUPS` in `arxiv.ts`. Verified live: 156 total options
  (155 categories + "All categories"), grouped correctly, selection works.

**Also added — General/Detailed category switch:** a two-way toggle next
to the category dropdown. "Detailed" is the full 155-category list above.
"General" (default) offers one option per archive/group instead (16 +
"All categories") — e.g. picking "Physics" searches the whole `physics.*`
wildcard rather than one specific subcategory. Each group's general-mode
value is precomputed in `generalValues` (`arxiv.ts`): a single wildcard
(`cs.*`) when the group is cleanly one dotted prefix, or multiple exact
codes for groups spanning separate top-level archives that don't share a
prefix (`hep-ex`/`hep-lat`/`hep-ph`/`hep-th` for "High Energy Physics",
`nucl-ex`/`nucl-th` for "Nuclear Physics"). `buildCategoryFragment()`
turns either shape into the right arXiv query syntax — `cat:X` for one
value, `(cat:X OR cat:Y OR ...)` for multiple. Both forms were verified
directly against the live arXiv API before building on them (wildcard and
parenthesized OR both confirmed working). Switching modes resets the
selected category, since general/detailed use different value domains.

### Phase 3 — Stats enrichment + polish ✅

- [x] Semantic Scholar batch lookup by arXiv ID → citation count per paper.
      `src/lib/semanticScholar.ts`, `fetchCitationCounts()`. Verified CORS is
      wide open on both the single-paper GET and the batch POST endpoint
      (no proxy needed) — but the unauthenticated tier rate-limits hard
      (hit a 429 on a single plain GET during testing with zero sustained
      load). Strictly best-effort: any failure just means no stat shown for
      those papers, never surfaced as an error. Only queries papers not
      already in the `citationCounts` cache (so "load more" and re-renders
      don't re-fetch known ids). Verified live: real citation counts
      returned and displayed (0 to 1,206 across a 20-result search).
- [x] arXiv rate limiting: `waitForArxivRateLimit()` in `arxiv.ts`, a
      module-level last-request timestamp enforcing >=3s between any two
      calls to `searchArxiv` (initial search, "load more", anything future),
      regardless of caller.
- [x] Sort toggle: Relevance vs. Citations, appears once citation data has
      arrived. Verified live — toggling to Citations re-sorts the exact same
      20 results into genuine descending citation order (confirmed against
      raw DOM values, not just eyeballing the UI).
- [x] State moved out of `ExplorePage.tsx`'s local `useState` into a new
      dedicated `useExploreStore.ts` (in-memory only, not persisted to
      localStorage) — since it's a Zustand store it lives outside React's
      tree, so switching to another sidebar tab and back preserves the
      search, and an in-flight search/classify/rank/citation-fetch keeps
      running in the background even while `ExplorePage` is unmounted.
      Verified live: searched, navigated to Papers, back to Explore — same
      20 results and query text still there.

**Design note:** citation counts and the final rank order are stored
separately (`citationCounts: Map`, `rankedIds: string[] | null`) rather than
baked into one `results` array. The displayed list is a `useMemo` derived
from `rawPapers + scoredEntries + citationCounts + rankedIds + sortMode`.
This matters because citation counts arrive asynchronously, sometimes after
the ranked list is already on screen — deriving the view instead of storing
it directly means they merge in automatically on the next render with no
manual re-merge step, and switching sort mode is a free client-side re-sort
with no re-fetching.

### Phase 4 — Stretch / optional

- [ ] Curated category quick-select chips instead of free-text-only genre
      (mostly superseded by the General/Detailed toggle from Phase 2's
      "also added" work — skipped)
- [x] LLM query rewriting (natural language intent → arXiv search syntax)
      for better recall on vague queries. `src/lib/queryRewriter.ts`,
      `rewriteQuery()`. Verified live and by direct curl that arXiv's `all:`
      field ORs space-separated words together rather than ANDing or
      phrase-matching them (`all:diffusion model` echoes back as
      `all:diffusion OR all:model`) — so the *previous* behavior of wrapping
      a whole free-text sentence in one `all:` clause matched almost
      anything sharing a single common word with the description. Fix:
      extract 2-3 short key phrases, AND them together as separate quoted
      `all:"phrase"` clauses (verified quoted phrases match as exact phrases
      and AND genuinely narrows results). Short inputs (<5 words) skip the
      LLM round trip entirely.
      **Caught in live testing before shipping:** AND-ing multiple *exact*
      phrases is brittle — a small local model (qwen2.5:3b) produced
      3-word compound phrases like "hierarchical object detection" that
      basically never appear verbatim, returning zero results even after
      tightening the prompt to prefer 1-2 word canonical terms and capping
      at 2-3 phrases. Added a safety net in `ExplorePage.tsx`: if the
      phrase-AND search returns 0 results, silently retry with the old raw
      keyword search rather than leaving the user stuck at zero. Both paths
      verified live (a clean rewrite: `"diffusion models" AND "image super
      resolution"` → 20 results, shown to the user via a "Searched arXiv
      for: ..." line; and a bad rewrite → automatic fallback → 20 results
      with no error surfaced).
- [ ] Distinct XP event for "discovered via Explore" vs. manual upload
      (small addition to `awardXP`'s switch in `useAppStore.ts`)
- [x] Save/revisit past Explore searches. `useExploreStore.ts` gained
      `persist` middleware (previously fully in-memory) with a `partialize`
      that saves *only* `searchHistory` — every other Explore field stays
      in-memory-only as before. `recordSearchHistory()`/
      `removeSearchHistoryEntry()` dedup by query+category and cap at 8
      entries. Shown as clickable chips above the results with an
      on-hover remove button. Verified live: searched twice, reloaded the
      page, both entries were still there, and clicking the older chip
      correctly re-ran *that* search — this caught a real staleness bug
      first (clicking a chip called `setState` then `handleSearch()` in the
      same tick, before React re-rendered the component's reactive
      `query`/`categoryMode`/`category` selectors, so `handleSearch` would
      have used the stale previous values) — fixed by having `handleSearch`
      read fresh values via `useExploreStore.getState()` instead of the
      component's selectors, same pattern `handleLoadMore` already used.

## Data source notes

- **arXiv API** (`export.arxiv.org/api/query`): free, no auth, Atom XML
  response. Good coverage for CS/physics/math/stat preprints — matches
  this app's implied audience. No citation/download stats available.
- **Semantic Scholar API**: free, batch-lookup-by-ID endpoint accepts a
  list of arXiv IDs in one call (efficient — avoids N requests for N
  papers), returns `citationCount`, venue, year. Rate-limited on the free
  tier; treat as best-effort enrichment, never a hard dependency.
- Not using in v1, but worth knowing about: **OpenAlex** covers a much
  wider range of sources than just arXiv and already includes
  `cited_by_count` + abstracts in a single API (no second lookup needed).
  If Explore ever needs to go beyond arXiv-only coverage, this is the
  natural next data source to evaluate instead of bolting on more APIs.
