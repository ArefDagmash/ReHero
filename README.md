# ResearchReader

A desktop research paper reader built with **Tauri v2** + **React 19** + **Vite** + **TypeScript** + **shadcn/ui** + **Tailwind CSS v4**.

Development is web-first (Vite dev server at `localhost:1420`). Tauri integration exists for file dialogs and filesystem access when running as a desktop app.

---

## Quick Start

```bash
npm install
npm run dev            # Web dev server on :1420
npm run tauri dev      # Tauri desktop dev mode
npm run tauri build    # Production binary + deb/rpm bundles
```

---

## Tech Stack

| Layer          | Technology                              |
| -------------- | --------------------------------------- |
| Desktop shell  | Tauri v2 (Rust)                         |
| Frontend       | React 19 + Vite + TypeScript            |
| Styling        | Tailwind CSS v4 + shadcn/ui (new-york)  |
| State          | Zustand v5 (persist middleware)         |
| PDF rendering  | pdfjs-dist v4                           |
| Rough lines    | roughjs v4                               |
| Animations     | framer-motion v11                       |
| Icons          | lucide-react                            |
| Images         | Wikimedia Commons API (no key needed)    |
| Logging        | Custom timestamped console logger       |
| Utils          | clsx, tailwind-merge, class-variance-authority, uuid |

---

## Project Structure

```
ResearchReader/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   ├── build.rs
│   └── src/
│       ├── main.rs
│       └── lib.rs
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css                  # Tailwind v4 + shadcn theme + text-layer styles
│   ├── lib/
│   │   ├── utils.ts               # cn() class merge utility
│   │   └── logger.ts              # Timestamped, color-coded named loggers
│   ├── types/
│   │   └── index.ts               # Paper, Annotation, ChatMessage
│   ├── store/
│   │   └── useAppStore.ts         # Zustand store with persist
│   └── components/
│       ├── Toolbar.tsx            # Page nav, zoom, sidebar toggles
│       ├── Library.tsx            # Left sidebar — paper list + Open PDF + delete
│       ├── Reader.tsx             # Center — PDF.js page-by-page (HiDPI)
│       ├── AnnotationPanel.tsx    # Right sidebar — notes/annotations
│       ├── HighlightMenu.tsx      # Floating bubble + AI chat dialog
│       └── ui/
│           ├── button.tsx         # 6 variants, 4 sizes
│           ├── card.tsx           # Card, CardHeader, CardTitle, CardContent
│           ├── dialog.tsx         # Radix-based modal dialog
│           ├── badge.tsx          # 4 variants
│           ├── textarea.tsx       # Styled textarea
│           ├── scroll-area.tsx    # Radix-based custom scrollbar
│           ├── separator.tsx      # Radix-based horizontal/vertical
│           └── skeleton.tsx       # Loading placeholder
```

---

## UI Layout

Minimal full-viewport reader. No toolbar — controls float over the PDF.

```
┌──────────────────────────────────────────────────────────────┐
│ [🎨 theme]                          [− 100% +]  zoom        │
│                                                              │
│ ◀                                                    ▶      │
│                                                              │
│ Library  │         Reader (flex-1)                          │
│ w-72     │   PDF canvas, text layer,                        │
│ toggl'd  │   page transitions (framer),                     │
│          │   doodly selection overlay                       │
│                                                              │
│                      [clean|medium|sloppy]  sloppiness       │
│  ☰ library                                                 │
└──────────────────────────────────────────────────────────────┘
```

- Left sidebar: 288px, toggled via floating button (bottom-left)
- Center: flex-1, scrollable PDF viewer
- Floating controls: page arrows (left/right edges), zoom (top-right), theme picker (top-left)
- Sloppiness picker: fixed bottom-center (visible when a paper is open)
- Keyboard: ArrowLeft/ArrowRight for page navigation

---

## Features

### PDF Reader (`Reader.tsx`)

- Renders PDFs page-by-page using pdfjs-dist v4
- **Text layer** for native text selection (invisible, `color: transparent`)
- **Doodly selection**: Rough.js hand-drawn red underlines appear under selected text in real-time via `selectionchange` event
- **Sloppiness control**: 3-level toggle (clean / medium / sloppy) adjusts Rough.js roughness and bowing
- Selection underlines draw live as you drag; rects merged per visual line to avoid stacking
- **HiDPI rendering**: canvas internal resolution = CSS size × `devicePixelRatio` for sharp output
- Canvas and text layer share the exact same CSS dimensions for guaranteed alignment at all zoom levels
- **Zoom**: 50%–300% in 25% increments (floating +/- controls, top-right)
- **Page transitions**: 200ms opacity crossfade via framer-motion `AnimatePresence mode="sync"`
- **Loading states**: Document-load skeleton (full page placeholder) and page-load skeleton (overlay)
- **30-second timeout**: Shows error if PDF load hangs instead of loading forever
- **Stale load protection**: `activeLoadKeyRef` prevents race conditions when switching papers rapidly
- **Keyboard navigation**: ArrowLeft/ArrowRight keys (ignored when focused in inputs/textareas)
- **Web mode**: Loads PDFs from `blob:` URLs via `fetch()` (browser file input)
- **Tauri mode**: Loads PDFs from disk via `@tauri-apps/plugin-fs`
- Drop shadow on the page canvas for depth

### Text Layer & Selection (`index.css` + `Reader.tsx`)

- Text layer spans are `color: transparent` — invisible by default
- `::selection { background: transparent; color: transparent; }` suppresses browser selection highlighting completely
- Doodly underlines rendered via Rough.js SVG overlay (gets `getClientRects()` per-selection-line, merges overlapping rects, draws rough paths)
- `line-height: 1` on spans to keep selection highlights tight to the text
- `overflow: hidden` to clip text beyond page boundaries
- `<br>` elements hidden to prevent extra gaps

### Floating Controls (in `Reader.tsx`)

| Location     | Controls                                              |
| ------------ | ----------------------------------------------------- |
| Left edge    | ◀ Previous page (disabled at page 1)                  |
| Right edge   | Next page ▶ (disabled at last page)                   |
| Top-right    | − Zoom out / + Zoom in / percentage label             |
| Top-left     | 🎨 Theme picker — click to expand, 3 colored swatches |
| Bottom-left  | ☰ Toggle Library sidebar (in `App.tsx`, fixed)       |
| Bottom-center| clean / medium / sloppy — Rough.js sloppiness toggle  |

All floating controls use `backdrop-blur-sm` translucent backgrounds with border. Theme picker expands with framer-motion animation to show dark/sepia/light color swatches.

### Library (`Library.tsx`)

- **Web mode**: Hidden `<input type="file" accept="application/pdf">` triggered by button click. Selected file is converted to a `blob:` URL via `URL.createObjectURL`.
- **Tauri mode**: Uses `@tauri-apps/plugin-dialog` `open()` with `.pdf` filter.
- **Detection**: Checks `__TAURI_INTERNALS__` in `window` to determine runtime.
- Papers stored with UUID, title (filename without `.pdf`), filePath (blob URL or filesystem path)
- Each paper shown as a clickable **Card** with title and last-read page
- Active paper highlighted with accent border
- **Delete button** (trash icon) appears on hover — removes paper, its annotations, and revokes blob URLs
- **Blob URL management**: Stale URLs revoked when new files are opened; the set is cleaned up on delete
- Empty state: upload icon + "Open a PDF to get started"

### Annotation Panel (`AnnotationPanel.tsx`)

- Annotations stored per filePath in Zustand, persisted to `localStorage` (`"research-reader-annotations"`)
- Grouped by page number, sorted ascending
- Each annotation card shows:
  - Page number badge
  - Quoted highlighted text (italic, muted, left border)
  - Editable note (click to edit → Textarea, autoFocus)
  - Delete button (trash icon)
- **Add blank note** button for freeform notes without highlighting
- Empty state: "No notes yet. Select text or click + to add a note."

### Highlight Menu (`HighlightMenu.tsx`)

Floating bubble appears near text selection on `mouseup`. Four buttons:

| Button      | Action                                                     |
| ----------- | ---------------------------------------------------------- |
| **Pin**       | Persists the doodle underline on the page (no text). Stays across page turns. |
| **Note**      | Opens an inline note popover → type a note → save. Doodle stays + note attached. |
| **Ask AI**    | Opens a Dialog for AI-powered Q&A about the selection    |
| **Images**    | Opens a floating, draggable, resizable window with image search results |

### Pinned Doodles

- Stored in Zustand per paper+page, persisted to localStorage
- Each pin stores: ID, optional note text, zoom level at pin time, and selection rects
- On render, rects are scaled by `currentZoom / pinZoom` to match any zoom level
- The rough.js SVG overlay renders both live selection lines and pinned lines together
- Pin markers appear on the left edge of the canvas (CSS-positioned) — one per annotation anchored to the first rect
- Click a pin marker → inline note editor opens (or toggles close). "Remove" link deletes the pin
- Multi-line highlights show one pin marker for the whole annotation
- Settings (color, style, strokes, sloppiness, background) accessible from homepage and reader top-bar

### Image Search (`ImageSearchPanel.tsx`)

Draggable, resizable floating window (500×600 default). Features:

- **Wikimedia Commons** — embedded image results (no API key, no limits, CORS-enabled)
- **YouTube** / **Google** — single-press buttons open search in browser tab
- Click any image → lightbox overlay with zoom (scroll wheel 50%-500%), drag-to-pan, and original-link button
- Lightbox shows zoom percentage, ↗ opens original URL in new tab

### AI Chat (Ask AI)

- Dialog shows the highlighted text at top
- Textarea for user questions
- `POST http://localhost:11434/api/chat` to Ollama (model: `llama3.2`)
- System prompt: "You are a research assistant. The user has highlighted text from a paper. Answer their question about it concisely."
- **Streaming**: Response renders incrementally, with "Thinking..." pulse during initial load
- Chat history preserved within the dialog session
- Enter submits, Shift+Enter for newlines
- Fetch aborted on dialog close

### Logging (`src/lib/logger.ts`)

Timestamped, color-coded named loggers covering every component boundary:

| Logger           | Covers                                                  |
| ---------------- | ------------------------------------------------------- |
| `log.app`        | Sidebar toggles, app-level events                       |
| `log.library`    | File selection, paper creation, delete                  |
| `log.reader`     | PDF load lifecycle, page renders, state transitions     |
| `log.pdf`        | Byte loading (fetch vs Tauri), canvas dimensions        |
| `log.toolbar`    | Page/zoom changes, keyboard events                     |
| `log.annotations`| Add/edit/delete annotations, localStorage persistence   |
| `log.highlight`  | Text selection, menu show/hide                          |
| `log.ai`         | Ollama requests, streaming, errors                      |
| `log.store`      | Zustand actions, persist/rehydrate                      |

All logs go to the browser console with structured data payloads.

---

## State Management — Zustand Store

### State

| Field                  | Type                            | Persisted | Default    |
| ---------------------- | ------------------------------- | --------- | ---------- |
| `papers`               | `Paper[]`                       | Yes       | `[]`       |
| `activePaperPath`      | `string \| null`                | Yes       | `null`     |
| `currentPage`          | `number`                        | Yes       | `1`        |
| `zoom`                 | `number`                        | Yes       | `1.0`      |
| `bgTheme`              | `"dark" \| "sepia" \| "light"`  | Yes       | `"dark"`   |
| `annotations`          | `Record<string, Annotation[]>`  | No*       | `{}`       |
| `highlightMenuVisible` | `boolean`                       | No        | `false`    |
| `highlightText`        | `string`                        | No        | `""`       |
| `highlightRect`        | `{ x, y } \| null`              | No        | `null`     |

*Annotations persisted separately to `localStorage` key `"research-reader-annotations"`. Papers/bookmarks persisted via zustand `persist` middleware to `"research-reader-papers"`.

### Actions

| Action                  | Signature                                                 | Notes                                    |
| ----------------------- | --------------------------------------------------------- | ---------------------------------------- |
| `addPaper`              | `(paper: Paper) => void`                                  | Deduplicates by filePath                 |
| `removePaper`           | `(id: string) => void`                                    | Also removes annotations, switches active|
| `setActivePaper`        | `(path: string \| null) => void`                          | Resumes at lastPage if available         |
| `setPage`               | `(page: number) => void`                                  |                                          |
| `setZoom`               | `(zoom: number) => void`                                  |                                          |
| `setBgTheme`            | `(theme: "dark" \| "sepia" \| "light") => void`            | Persisted, updates `html[data-theme]`    |
| `updatePaperLastPage`   | `(path: string, lastPage: number) => void`                | Bookmark tracking                        |
| `updatePaperTotalPages` | `(path: string, totalPages: number) => void`              | Set when PDF loads                       |
| `addAnnotation`         | `(filePath: string, annotation: Annotation) => void`      | Saves to localStorage                    |
| `updateAnnotation`      | `(filePath: string, id: string, note: string) => void`    | Saves to localStorage                    |
| `deleteAnnotation`      | `(filePath: string, id: string) => void`                  | Saves to localStorage                    |

---

## Types

```ts
type Paper = {
  id: string;            // UUID v4
  title: string;         // Filename without .pdf extension
  filePath: string;      // blob: URL (web) or absolute filesystem path (Tauri)
  totalPages: number;    // Set when PDF loads
  lastPage: number;      // Last-read page (bookmark)
  tags: string[];        // Reserved for future use
};

type Annotation = {
  id: string;            // UUID v4
  pageNumber: number;
  highlightedText: string;  // Empty for freeform notes
  note: string;             // User's note (editable inline)
  createdAt: string;        // ISO 8601
};

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};
```

---

## Theme

### Theme Presets

Three presets cycled via the top-left palette button. Stored in Zustand (`bgTheme`), applied via `html[data-theme]` CSS custom property overrides.

| Theme | Background             | Text / Chrome        |
| ----- | ---------------------- | -------------------- |
| dark  | `hsl(0 0% 3.9%)`      | Near-white / gray    |
| sepia | `hsl(40 30% 92%)`     | Warm browns          |
| light | `hsl(0 0% 100%)`      | Near-black / light gray |

All colors are CSS custom properties defined via Tailwind v4 `@theme` (not inline — utilities use `var()` references for dynamic theming).

### Typography

- **Sans-serif**: Excalifont (custom woff2 loaded via `@font-face`)
- **Monospace**: Geist Mono
- Font file: `public/fonts/Excalifont-Regular.woff2`

### UI Components — Variants

| Component    | Variants                                         |
| ------------ | ------------------------------------------------ |
| Button       | default, destructive, outline, secondary, ghost, link |
| Button Size  | default, sm, lg, icon                            |
| Badge        | default, secondary, destructive, outline          |
| Card         | No variants (CardHeader, CardTitle, CardContent)  |
| Separator    | horizontal / vertical                             |
| ScrollBar    | vertical / horizontal                             |

### Border Radius Scale

| Token         | Value |
| ------------- | ----- |
| `--radius-sm` | ~4px  |
| `--radius-md` | ~6px  |
| `--radius-lg` | 8px   |
| `--radius-xl` | 12px  |

### Animation

```css
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
--animate-fade-in: fade-in 0.15s ease-out;
```

---

## Tauri Configuration

### Window

| Setting    | Value              |
| ---------- | ------------------ |
| Title      | ResearchReader     |
| Size       | 1280 x 800         |
| Resizable  | Yes                |
| Fullscreen | No                 |
| CSP        | None (null)        |

### Permissions (`capabilities/default.json`)

All assigned to `main` window:

- `core:default` — Core platform APIs
- `dialog:allow-open` — Native file open dialog
- `fs:allow-read` — Read files from disk
- `fs:scope` — Allowed paths: `$DESKTOP/**`, `$HOME/**`, `$DOCUMENT/**`, `$DOWNLOAD/**`

### Rust Plugins

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .run(tauri::generate_context!())
```

---

## Vite Configuration

| Setting         | Value                                 |
| --------------- | ------------------------------------- |
| Plugins         | `@vitejs/plugin-react`, `@tailwindcss/vite` |
| Path alias      | `@` → `./src`                         |
| Dev port        | 1420 (strict)                         |
| HMR port        | 1421 (when `TAURI_DEV_HOST` set)      |
| Watch ignore    | `**/src-tauri/**`                     |
| clearScreen     | false                                 |

---

## Commands

| Command              | Purpose                              |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start Vite dev server on :1420       |
| `npm run build`      | Type-check + Vite production build   |
| `npm run tauri dev`  | Tauri dev mode (builds + opens app)  |
| `npm run tauri build`| Full production build (all bundles)  |
| `npm run lint`       | ESLint                               |

---

## What's Not Built (Yet)

- Google Photos integration
- TTS / voice narration
- Cloud sync
- Full-text search
- Tag management
- Book mode vs paper mode toggle
