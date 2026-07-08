# ResearchReader

## Pipeline

**Input:** PDF files (drag-drop or file picker), text selections, AI queries, settings

1. App boots → Zustand store rehydrates papers/annotations/conversations from localStorage
2. User adds a PDF → bytes stored in IndexedDB, metadata in Zustand store
3. User opens a paper → PDF loaded from IndexedDB/filesystem, rendered to HiDPI canvas with invisible text layer
4. User reads pages → doodle overlays drawn (Rough.js), page navigation tracked, XP awarded
5. User selects text → right-click HighlightMenu shows: Pin/Ask AI/Sketch it/Images
6. User asks AI (ClarifyPanel) → surrounding page context extracted, streamLlm() fetches from configured provider, response typewriter-animated
7. AI response saved to localStorage, sparkle marker (✦) placed on PDF page, XP awarded
8. User generates narration → page text extracted → LLM rewrites for speech → Kokoro TTS (Python server) synthesizes MP3 → played in MiniAudioPlayer, saved to IndexedDB

**Output:** Annotated PDF canvas with doodles/sparkles/pins, AI conversation panel with markdown, Excalidraw sketchpad, image search lightbox, narration audio player, exported notes/data

### Key Files
- `src/main.tsx`: React entry point — mounts `<App>` inside `<ErrorBoundary>`
- `src/App.tsx`: View router — derives view from state, renders Reader/Home/Settings with floating panels
- `src/store/useAppStore.ts`: All application state (Zustand + persist middleware)
- `src/components/Reader.tsx`: PDF rendering, doodle overlays, sparkle markers, narration orchestration
- `src/components/ClarifyPanel.tsx`: AI chat panel with markdown rendering, branch windows, typewriter
- `src/components/HighlightMenu.tsx`: Right-click text selection toolbar (Pin/Sketch/Images/Ask AI)
- `src/lib/llmStream.ts`: LLM API pipeline — resolves endpoint, builds headers/payload, streams response
- `src/lib/pdfContext.ts`: Singleton PDF document ref for text extraction
- `src/lib/pdfStorage.ts`: IndexedDB CRUD for PDF binary files
- `src/lib/secretStorage.ts`: AES-GCM 256 encryption for API keys
- `src/lib/narrator.ts`: Kokoro TTS client — synthesize, play, stop
- `src/lib/gamification.ts`: XP/levels/achievements engine
- `kokoro_server.py`: Python HTTP server for Kokoro TTS synthesis
- `src-tauri/src/lib.rs`: Tauri desktop shell — plugins, start_kokoro command
