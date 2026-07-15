![ReHero — the modern paper reader](public/readme-banner.png)

# ReHero

A PDF reader for research papers that adds AI explanations, hand-drawn annotations, and a sketchpad — all running locally on your own machine.

## What it is

Reading a dense paper usually means bouncing between the PDF and a search engine every time you hit a term or idea you don't follow. ReHero puts that help inline: highlight any text and ask an AI to simplify it, explain it, give an example, or turn it into a diagram, without leaving the page. It also lets you mark up papers by hand — underline, strike through, or scribble a note in a rough, sketch-like style — and push any passage straight into a drawing canvas to work it out visually.

It's local-first: your papers, notes, and API keys stay on your machine. You bring your own AI provider (a local Ollama model, or a Claude/OpenAI/OpenCode API key), so there's no account or subscription. It runs as a normal web app or as a desktop app (via Tauri).

## Features

**Ask AI, inline.** Highlight anything and get it simplified, clarified, given a concrete example, recapped in one sentence, or turned into a Mermaid diagram — without leaving the page.

**Hand-drawn annotations.** Underline, strike through, or squiggle text in a rough, sketch-like style, with adjustable color, stroke count, and sloppiness.

**Sketch canvas.** A full Excalidraw board docked to the side. Push any highlight, AI answer, or generated diagram straight onto it to work through an idea visually.

**Audio narration.** Turns a page range into narrated audio through a local Kokoro TTS server, one page at a time, with the model instructed to read formulas and symbols out loud in words rather than raw notation. Narrations are saved per paper, so playback picks up exactly where you left off from the home screen.

**Explore.** Describe what you're looking for in a sentence and it searches arXiv, then scores and ranks every result against what you actually asked for with an AI classifier, followed by a second head-to-head pass to reorder the top matches. Also searches open-access books via DOAB, and pulls in citation counts from Semantic Scholar.

**Scholar XP.** A 7-tier level system (Newcomer through Archivist) and 18 achievements for actual reading behavior — asking questions, annotating, finishing papers, keeping a daily reading streak.

## Requirements

- [Node.js](https://nodejs.org/) 18+
- An AI provider to use the "Ask AI" features: either [Ollama](https://ollama.com/) running locally, or an API key for Anthropic, OpenAI, or OpenCode (entered in Settings — no `.env` file needed)
- To use audio narration: Python 3 and `ffmpeg` on your PATH, then run `./start_kokoro.sh` (sets up its own venv and installs Kokoro TTS on first run — everything else in the app works fine without this)

## Install

```bash
npm install
```

## Usage

Run it as a web app:

```bash
npm run dev
```

Then open `http://localhost:1420`, add a PDF from the home screen, and open it to start reading.

Or run it as a desktop app instead:

```bash
npm run tauri dev
```

Once you're inside a paper, select some text and right-click to bring up the action menu — pin a highlight, sketch it to the canvas, search for related images, or ask AI to simplify/clarify/explain it.

## Other commands

| Command | What it does |
|---|---|
| `npm run build` | Type-check and build for production |
| `npm run tauri build` | Build the desktop app installer |
| `npm run lint` | Run ESLint |

## Configuring AI

Go to **Settings → AI/LLM** to pick a provider and, for cloud providers, paste in an API key. Keys are encrypted before being stored on disk. If you're using Ollama, point it at your Ollama endpoint (default `http://localhost:11434`) and hit "Detect" to pull in your installed models.

## How it works

For architecture, the LLM streaming pipeline, state management, and other implementation details, see [AGENTS.md](./AGENTS.md).
