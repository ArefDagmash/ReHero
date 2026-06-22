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
| Animations     | framer-motion v11                       |
| Icons          | lucide-react                            |
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

Three-column layout, full viewport height, no shell scrollbars.

```
┌──────────────────────────────────────────────────────────────┐
│ Toolbar (h-12)          [nav] [zoom] [toggles]               │
├──────────┬───────────────────────────────────┬────────────────┤
│ Library  │         Reader (flex-1)           │ AnnotationPanel│
│ w-60     │   PDF canvas, text layer,         │ w-80           │
│ collaps  │   page transitions (framer),      │ collaps        │
│          │   loading skeleton                │                │
└──────────┴───────────────────────────────────┴────────────────┘
```

- Left sidebar: 240px, collapsible
- Center: flex-1, scrollable PDF viewer
- Right sidebar: 300px, collapsible

---

## Features

### PDF Reader (`Reader.tsx`)

- Renders PDFs page-by-page using pdfjs-dist v4
- **Text layer** for native text selection (invisible until selected, `color: transparent`)
- **HiDPI rendering**: canvas internal resolution = CSS size × `devicePixelRatio` for sharp output
- Canvas and text layer share the exact same CSS dimensions for guaranteed alignment at all zoom levels
- **Zoom**: 50%–300% in 25% increments
- **Page transitions**: 150ms opacity fade via framer-motion (only on page change, not zoom)
- **Loading states**: Document-load skeleton (full page placeholder) and page-load skeleton (overlay)
- **30-second timeout**: Shows error if PDF load hangs instead of loading forever
- **Stale load protection**: `activeLoadKeyRef` prevents race conditions when switching papers rapidly
- **Keyboard navigation**: ArrowLeft/ArrowRight keys (ignored when focused in inputs/textareas)
- **Web mode**: Loads PDFs from `blob:` URLs via `fetch()` (browser file input)
- **Tauri mode**: Loads PDFs from disk via `@tauri-apps/plugin-fs`
- Drop shadow on the page canvas for depth

### Text Layer Styling (`.pdf-text-layer`)

- Text layer spans are `color: transparent` — invisible by default
- Selection highlight: light blue background (`rgba(100, 160, 255, 0.25)`)
- `line-height: 1` on spans to keep selection highlights tight to the text
- `overflow: hidden` to clip text beyond page boundaries
- `<br>` elements hidden to prevent extra gaps

### Toolbar (`Toolbar.tsx`)

| Section    | Controls                                            |
| ---------- | --------------------------------------------------- |
| Left       | Hamburger — toggle Library sidebar                  |
| Center     | Page back/forward arrows + page indicator           |
| Right      | Zoom out/in + percentage label                      |
| Far right  | Toggle AnnotationPanel sidebar                      |

All buttons use `ghost` variant, icon size.

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

Floating bubble appears near text selection on `mouseup`. Auto-dismisses when selection is cleared.

| Button      | Action                                                     |
| ----------- | ---------------------------------------------------------- |
| **Add Note**  | Saves selected text as annotation for the current page   |
| **Ask AI**    | Opens a Dialog for AI-powered Q&A about the selection    |

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

## Theme — shadcn/ui (new-york, neutral, dark only)

All colors are CSS custom properties defined via Tailwind v4 `@theme inline`.

Base color: **neutral** (grayscale HSL palette). Dark mode only — background is near-black (`hsl(0 0% 3.9%)`), text near-white (`hsl(0 0% 98%)`). No light mode, no theme toggle.

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
- Book mode vs paper mode toggle
- Cloud sync
- Full-text search
- Tag management
- Light mode / theme toggle
