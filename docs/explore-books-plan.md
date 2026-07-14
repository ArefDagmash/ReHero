# Explore Tab — Books (DOAB) — Plan

Companion to `docs/explore-tab-plan.md`. Same idea, same spirit, extended to
books: a Papers/Books toggle in the Explore tab, so instead of only
discovering arXiv preprints you can also discover open-access academic
books, with the same "describe what you want → AI ranks candidates" flow.

**Read this before starting implementation** — the research below found one
real, load-bearing difference between arXiv and DOAB that changes what
"Add to Library" can mean for books. It's not a minor detail; it's the
reason Phase 1 below has a different primary action than the Papers side.

## Data source research (verified via curl before writing any plan, same
policy as the original arXiv research)

- **DOAB** (`directory.doabooks.org`) is a DSpace-based repository — a
  *directory/index* of open-access academic books, not a file host in its
  own right for most entries.
  - Search: `GET /rest/search?query=<text>&limit=<n>&offset=<n>` → JSON
    array of `{uuid, name, handle, link, ...}`. Verified live: a real query
    (`"neural networks"`) returns genuinely relevant titles, not just
    recent items; `limit`/`offset` verified to return different pages.
  - Item detail: `GET /rest/items/{uuid}?expand=metadata,bitstreams` →
    Dublin Core metadata (`dc.title`, `dc.contributor.author[]`,
    `dc.description.abstract`, `dc.subject.other[]`, `dc.date.issued`,
    `dc.type` = always `"book"`, `oapen.identifier.doi`, publisher info)
    plus a `bitstreams[]` array.
  - **No CORS header** on any of the above (`access-control-allow-origin`
    absent, verified via `curl -I`) — same situation as arXiv, needs a
    `/api/proxy/doab` route in `vite.config.ts` for web-dev mode; Tauri
    hits it directly as usual (webview doesn't enforce CORS).
  - No discoverable facets/category-taxonomy endpoint (`/rest/discover/
    facets*` → 404). Subjects exist only as free-text metadata per item
    (`dc.subject.other`, plus a "thema" classification string). There's no
    arXiv-`cat:`-equivalent to build a clean dropdown from via this API —
    a General/Detailed category toggle like Papers has isn't a v1 goal
    here (see Phase 4).

- **The PDF itself is the hard part.** `bitstreams[]` on a DOAB item is
  almost never the actual book — it's a thumbnail image and metadata
  export files (`.marc.xml`, `.onix_3.0.xml`, `.ris`, `.tsv`). The real
  download link lives in one of two places, and neither behaves like
  arXiv's always-there, always-fetchable PDF:
  1. **An external publisher's own site** (e.g. a Frontiers "research
     topic" page) — format varies per publisher, sometimes not even a
     direct PDF link, just an HTML landing page.
  2. **`library.oapen.org/bitstream/...`** — OAPEN's own file host, which
     DOES serve a direct PDF... except this domain runs **Anubis**, a
     JavaScript proof-of-work anti-bot challenge. Verified live: every
     `library.oapen.org` bitstream URL tested returned `403` with a
     "Making sure you're not a bot!" challenge page, consistently, from
     both a bare `curl` and one with a realistic browser User-Agent.
     Anubis challenges require a full page load that executes JS to solve
     a proof-of-work puzzle and set a cookie — a background `fetch()` call
     (from either web-dev or the Tauri webview) receives the same
     challenge HTML instead of the PDF and can't execute it, because
     `fetch()` doesn't run scripts in the response. **This isn't something
     to work around** — it's a deliberate anti-scraping measure, and
     building anything that tries to solve it programmatically would be
     circumventing an explicit protection, not a bug to patch around.

  **Consequence**: unlike arXiv, there's no reliable way to silently fetch
  a book's PDF bytes for a one-click "Add to Library." Phase 1's book
  cards get an **"Open Book"** action (opens the DOAB page in a real
  browser tab, where a human — and Anubis, if it comes up — can actually
  load the page) instead of an auto-download button. This is an honest
  product difference, not a missing feature to backfill later.

  A real alternative source was checked too — **Internet Archive**
  (`archive.org`) does host genuinely direct, unprotected PDF downloads
  for at least some open books (verified live: fetched a real 814 KB PDF
  with a plain `curl`, no anti-bot block). Decided against pulling it in:
  IA's catalog mixes scans, dissertations, and copyright-restricted
  lending-only items in with genuinely open books, so using it reliably
  would mean filtering on license/restriction metadata and cross-matching
  against DOAB's cleaner subject metadata — real added complexity for a
  secondary source. Landed on: DOAB only, link out, keep it simple. Worth
  revisiting later if "Open Book" turns out to be too much friction in
  practice, but not a v1 concern.

- Not tested but worth knowing: DOAB metadata includes a DOI
  (`oapen.identifier.doi`) for most entries. Semantic Scholar's API
  generally accepts DOIs, not just arXiv IDs — if a citation-count-style
  stat is wanted in Phase 3, that's the thing to verify first (same
  best-effort, never-block pattern as `semanticScholar.ts` already uses).

## How this fits the existing Explore architecture

- `useExploreStore.ts` already isolates all Explore state from the main
  app store — the Papers/Books toggle and DOAB-specific fields belong
  there, not in `useAppStore.ts`.
- `paperClassifier.ts`'s `classifyPapers`/`rankPapers` operate on
  `{id, title, summary}`-shaped input — generalizing their type signature
  (rather than duplicating them for books) is the right move, since the
  actual classification logic doesn't care whether the "paper" is an arXiv
  preprint or a DOAB book.
- A shared discriminated type (e.g. `DiscoveredItem = { kind: "paper" |
  "book" } & ...`) lets the results list, score badges, sort toggle, and
  search-history UI stay mode-agnostic — only the source fetch (`arxiv.ts`
  vs a new `doab.ts`) and the primary action (Add to Library vs Open Book)
  actually differ per mode.
- Same rate-limit-defensively habit as `arxiv.ts`'s `waitForArxivRateLimit`
  — no confirmed hard limit found on DOAB during research, but applying a
  similar conservative throttle by default costs nothing and matches this
  app's existing "be a good API citizen" pattern.

---

### Phase 0 — Plumbing (toggle, no real Books search yet)

- [ ] Papers/Books mode toggle at the top of `ExplorePage.tsx` (same visual
      language as the General/Detailed category toggle from Papers Phase 2)
- [ ] `src/lib/doab.ts`: `searchDoab(query, opts)` — metadata-only search
      hitting `/rest/search`, mapped into the shared `DiscoveredItem` shape
- [ ] `/api/proxy/doab` route in `vite.config.ts`
- [ ] Add Books-mode fields to `useExploreStore.ts` (raw results, mode
      itself, etc.) — reuse the Papers fields' *shape* via the shared type
      rather than duplicating parallel state for everything
- [ ] Manual smoke test: switch to Books, search something, confirm real
      DOAB titles come back — no classification, no download attempt yet

### Phase 1 — Real DOAB search + "Open Book"

- [ ] Wire the existing intent textarea to `searchDoab()` when in Books mode
- [ ] Result card: title, authors, truncated abstract, publisher, year,
      **"Open Book"** button (opens the DOAB handle page in a new tab) —
      no "Add to Library" attempt by default, per the research above
- [ ] Pagination via `limit`/`offset` ("Look through more books", same UX
      as Papers' load-more)
- [ ] Loading/error/empty states matching Papers' existing patterns
- [ ] **Decided**: no PDF-fetch attempt of any kind, opportunistic or
      otherwise — "Open Book" (link out) is the permanent primary action
      for Books mode, not a placeholder pending a better solution

### Phase 2 — AI classification layer

- [ ] Generalize `classifyPapers`/`rankPapers` in `paperClassifier.ts` to
      accept the shared `DiscoveredItem` shape instead of `ArxivPaper`
      specifically (title + abstract is all the prompt actually needs)
- [ ] Reuse the exact same batching, defensive JSON parsing, score badge,
      and colored fit gradient from Papers mode — no reason for this to
      differ
- [ ] Reuse the comparative ranking pass (batch score → global rank) as-is

### Phase 3 — Stats enrichment + polish

- [ ] Investigate whether Semantic Scholar's API accepts DOIs (DOAB
      metadata has one for most entries) for a citation-style stat —
      verify via curl before writing code, same as arXiv's `all:` OR
      behavior was verified earlier. Best-effort, never blocks results if
      it doesn't pan out.
- [ ] Sort toggle: relevance vs. whatever stat Phase 3 actually lands on
      (citations if the DOI lookup works, otherwise publication year as a
      reasonable substitute)
- [ ] Extend `searchHistory` (`useExploreStore.ts`) to record which mode a
      saved search was in, so clicking an old entry restores Papers vs.
      Books correctly, not just the query text
- [ ] Rate limiting for `doab.ts`'s requests, mirroring `arxiv.ts`'s
      `waitForArxivRateLimit` (precautionary — no confirmed hard limit
      found, but cheap insurance)

### Phase 4 — Stretch / optional

- [ ] Coarse subject-category filter built from a hardcoded "thema"
      top-level taxonomy (since DOAB has no clean facet API to source one
      from live) — lower priority than it was for Papers, since DOAB's
      per-item subject metadata is free-text, not a clean queryable field
- [ ] Distinct XP/achievement flavor for book discoveries vs. paper
      discoveries (parallels the still-not-done Papers-side equivalent in
      `docs/explore-tab-plan.md` Phase 4)
