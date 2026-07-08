# ReHero

A local-first PDF research assistant with AI-powered annotation, diagram generation, and sketchpad. Built as a desktop/web hybrid app.

**Stack**: React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui + Zustand + Tauri v2

---

## Quick Start

```bash
npm install
npm run dev          # Web dev server on :1420
npm run tauri dev    # Tauri desktop dev
```

---

## Architecture

Single-page React app — no router. View state is derived from persisted Zustand store.

```
App.tsx
├── Sidebar          (Home / Papers / Books / Settings)
├── Content Area     (Reader, SettingsPage, HomePage)
├── HighlightMenu    (right-click text selection actions)
├── ImageSearchPanel (draggable/dockable)
├── DrawingPanel     (Excalidraw, draggable/dockable)
└── ClarifyPanel     (AI responses, draggable/dockable, per-conversation isolation)
```

**View derivation**: `view = activePaperPath ? "reader" : sidebarTab`

---

## LLM Integration

### Providers
Ollama (local), Anthropic (Claude), OpenAI (GPT), OpenCode (open-source API).

### Pipeline (`src/lib/llmStream.ts`)
```
resolveEndpoint(provider) → URL + API key
buildHeaders(provider, key) → HTTP headers
buildPayload(provider, ...) → request JSON
streamLlm(messages, config) → async generator yielding text chunks
```

### Streaming formats
- **Ollama**: newline-delimited JSON
- **Anthropic/OpenAI/OpenCode**: SSE (`data:` lines)
- **Graph mode**: non-streaming (avoids reasoning tokens bleeding into diagram output)

### API Keys (`src/lib/secureStore.ts` + `src/lib/secretStorage.ts`)
- AES-GCM 256-bit encryption at rest with `enc:` prefix
- Master key auto-generated in `localStorage` (backed up to Tauri `.keys.json`)
- Per-provider keys encrypted before storage
- Desktop: Tauri Store (`.keys.json`) | Web: `sessionStorage`
- ASCII-only sanitization (fetch headers require ByteString)
- Threat model: file exfiltration protection, not process compromise

### Vite Dev Proxy (`vite.config.ts`)
Cloud providers are proxied through Vite in web mode to bypass CORS:
```
/api/proxy/anthropic → https://api.anthropic.com
/api/proxy/openai    → https://api.openai.com
/api/proxy/opencode  → https://opencode.ai
```

Tauri mode uses direct URLs (no CORS in webview).

---

## Key Features

### 1. PDF Reader (`src/components/Reader.tsx`)
- pdfjs-dist v4, page-by-page rendering (HiDPI)
- Text layer for native selection (color: transparent, selection hidden)
- Theme support: light / sepia / dark
- Zoom 50%-300%, keyboard arrows for page nav
- 30-second load timeout, stale load protection
- **Right-click highlight menu**: select text, right-click to open action toolbar

### 2. Doodle Annotations
- Rough.js hand-drawn lines (underline, strikethrough, squiggly)
- Configurable: color, style, stroke count, sloppiness (clean/medium/sloppy)
- "Pin" persists doodle to page; shows pin marker + inline note editor
- Settings in reader toolbar + SettingsPage

### 3. Highlight Menu (`src/components/HighlightMenu.tsx`)
Floating toolbar on **right-click** after text selection:
- **Pin** — persist underline on page
- **Sketch it** — push text into Excalidraw
- **Images** — open image search panel
- **Ask AI** — opens sub-menu with 5 AI modes

### 4. AI Modes (ClarifyPanel)
| Mode | What it does |
|------|-------------|
| Simplify | Rewrites text in plain language |
| Clarify | Explains what highlighted text means |
| Example | Gives real-world concrete example |
| Recap | One-sentence summary |
| Graph | Generates Mermaid.js diagram code |

**Context**: sends paper title + current page ± 2 pages of surrounding text as context.

**Output**: markdown-rendered (bold, italic, code blocks with Copy/Sketch buttons), typewriter animation (3 chars / 8ms).

**Graph mode**: non-streaming (avoids reasoning tokens), extracts Mermaid code from LLM response, prepends declaration line if missing, wraps in ` ```mermaid ` code blocks. "Sketch" button pushes code to Excalidraw.

### 5. Persistent AI Conversation History (`research-reader-conversations` localStorage)
Every AI response is saved and keyed by paper file path. When reopening the panel on the same paper:
- Previous sessions appear above a `— new session —` divider at 55% opacity
- **Trash button** in panel header clears all history + all sparkle markers + closes panel
- **✕ on hover** deletes a single history entry + its matching sparkle marker

### 6. Sparkle Markers on PDF Page
After any AI interaction, a `✦` sparkle icon (indigo) appears to the right of the highlighted text:
- **Zoom-aware**, persisted across sessions
- **Clickable**: opens an **isolated single-entry panel** showing just that conversation
- Each sparkle has its own panel — conversations are **not grouped together**
- The panel shows `[Mode · p.N]` in the header with a delete button
- Deleting from the isolated panel removes both the entry and its sparkle

### 7. Drawing Panel (Excalidraw)
- Draggable/resizable/dockable floating panel
- Receives text pushes from HighlightMenu or ClarifyPanel
- Push text as center-screen element, staggered if multiple
- Monospace code font (fontFamily: 5), no bounding box

### 8. Image Search
- Wikimedia Commons API (no key needed)
- YouTube/Google search buttons open browser
- Lightbox with zoom and drag-to-pan

### 9. Export Notes as Markdown
Settings → Data → "Export notes (.md)" generates `research-notes.md`:
- Combines all papers with annotations or AI conversations
- Paper title → page-grouped annotations with quoted highlights → AI conversations (mode, page, question, answer)
- Compatible with Obsidian, VS Code, etc.

---

## Settings Categories

| Category | Options |
|----------|---------|
| **General** | Theme: light / sepia / dark |
| **Reading** | Default zoom: 75%–150% |
| **Doodles** | Color, style, strokes, roughness |
| **AI / LLM** | Provider selector, Ollama endpoint + Detect, Model dropdown, Max tokens, API key |
| **Shortcuts** | Reference table |
| **Data** | Clear annotations, export JSON, export Markdown |

### Ollama Detection
1. `GET /api/tags` (native) → parse `models[].name`
2. Fallback: `GET /v1/models` (OpenAI-compat) → parse `data[].id`

### OpenCode Detection
- `GET /v1/models` on provider switch → parse `data[].id`
- Auto-selects first model if current not in list

---

## State Management

**Zustand with persist middleware** — localStorage key `"research-reader-papers"`

### Persisted State
`papers`, `activePaperPath`, `currentPage`, `zoom`, `bgTheme`, `pinnedDoodles`, `aiMarkers`, `llmProvider`, `llmModel`, `ollamaEndpoint`, `opencodeEndpoint`, `llmTemperature`, `llmMaxTokens`, `sidebarTab`

### Non-persisted
`annotations` (separate localStorage key), `conversations` (separate localStorage key), menu/panel visibility flags, `pendingSketchText`, dock widths, `clarifyScrollToEntryId`

### localStorage keys
| Key | What |
|-----|------|
| `research-reader-papers` | Main Zustand store (papers, settings, doodles, markers, etc.) |
| `research-reader-annotations` | Per-paper per-page text notes |
| `research-reader-conversations` | Per-paper AI conversation history |

---

## Project Structure

```
src/
├── main.tsx                     # Entry, ErrorBoundary wrapper
├── App.tsx                      # View router, panel orchestration
├── index.css                    # Tailwind v4 + themes + markdown styles + Excalifont
├── store/
│   └── useAppStore.ts           # Zustand store (persist middleware)
├── lib/
│   ├── llmStream.ts             # LLM pipeline (resolve, headers, payload, stream)
│   ├── secureStore.ts           # API key get/set/delete (Tauri + sessionStorage)
│   ├── secretStorage.ts         # AES-GCM encryption for API keys
│   ├── pdfContext.ts            # Singleton PDF doc ref for text extraction
│   ├── excalidrawApi.ts         # pushTextToCanvas helper
│   ├── useDragMove.ts           # Drag, resize, edge-snap docking hooks
│   ├── logger.ts                # Color-coded named loggers
│   └── pdfStorage.ts            # IndexedDB PDF storage
├── components/
│   ├── Reader.tsx               # PDF rendering, text layer, doodles, sparkle markers
│   ├── ClarifyPanel.tsx         # AI response panel (markdown, typewriter, history, single-entry view)
│   ├── HighlightMenu.tsx        # Right-click text selection toolbar
│   ├── DrawingPanel.tsx         # Excalidraw sketchpad
│   ├── ImageSearchPanel.tsx     # Wikimedia image search
│   ├── SettingsPage.tsx         # Categorized settings + export
│   ├── Sidebar.tsx              # Navigation sidebar (ReHero branding)
│   ├── HomePage.tsx             # Paper library + file picker
│   ├── ErrorBoundary.tsx        # React error boundary with stack trace
│   └── ui/                      # shadcn/ui components
├── types/
│   └── index.ts                 # Paper, Annotation, ChatMessage, StoredEntry, AiMarker
└── docs/
    ├── session-2026-07-03.md    # Today's session: history, export, sparkles, isolated panels
    ├── design-system.md         # Odysseus design system reference
    ├── ollama-connection.md     # Ollama detection & connection guide
    └── cors-proxy-issue.md      # CORS diagnosis
```

---

## Drag & Dock System (`src/lib/useDragMove.ts`)

### `useDragMove`
- Tracks floating panel position `{ x, y }`
- Edge snap: within 60px of window edge shows hint, mouseup snaps to docked
- Undock guard: prevents re-dock on close button click

### `useDragResize`
- Floating: east/south/southeast edge resize
- Docked: drag inner edge strip to resize (min 280px)
- Dock widths propagated to store for content push-back

---

## Branding

- **Name**: ReHero (Excalifont — the hand-drawn font from Excalidraw)
- **Logo**: `public/ReHero-Logo.png` (full), `public/favicon-32.png` (tab icon)
- **Product**: `com.rehero.desktop`

---

## Edge Cases

1. **CORS**: Cloud providers blocked in browser. Tauri bypasses. Vite proxy handles dev mode.
2. **Text-to-canvas push retry**: Excalidraw API may not be ready on mount — polls every 100ms, up to 10 retries.
3. **Graph mode reasoning**: Deep-thinking models output in `reasoning_content` not `content`. Stream parser captures both. Graph mode uses non-streaming to avoid interference. Fallback: regex-heuristic extraction from reasoning text (Mermaid keyword/arrow/node patterns).
4. **Paper deduplication**: Same filePath detected, just sets active.
5. **Token limits**: Default 8192 max tokens. Graph mode recommended 8192+. Adjust in Settings.
6. **Markdown escaping**: Code blocks extracted before HTML escaping to prevent `>`→`&gt;` corruption.
7. **Sidebar persistence**: `sidebarTab` in Zustand persist — survives refresh on same page.
8. **Empty LLM response**: Shows diagnostic (reasoning length, text prefix) instead of blank panel.
9. **Zustand infinite re-render**: `|| []` fallback in selectors creates new array refs every render → `Object.is` sees change. Use `?? null` for stable fallback.
10. **TDZ crash**: Effects referencing state must come after state declarations, not before.

---

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server on :1420 |
| `npm run build` | TypeCheck + production build |
| `npm run tauri dev` | Tauri desktop dev |
| `npm run tauri build` | Production Tauri build |
