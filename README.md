# ReHero

A PDF reader for research papers that adds AI explanations, hand-drawn annotations, and a sketchpad — all running locally on your own machine.

## What it is

Reading a dense paper usually means bouncing between the PDF and a search engine every time you hit a term or idea you don't follow. ReHero puts that help inline: highlight any text and ask an AI to simplify it, explain it, give an example, or turn it into a diagram, without leaving the page. It also lets you mark up papers by hand — underline, strike through, or scribble a note in a rough, sketch-like style — and push any passage straight into a drawing canvas to work it out visually.

It's local-first: your papers, notes, and API keys stay on your machine. You bring your own AI provider (a local Ollama model, or a Claude/OpenAI/OpenCode API key), so there's no account or subscription. It runs as a normal web app or as a desktop app (via Tauri).

## Requirements

- [Node.js](https://nodejs.org/) 18+
- An AI provider to use the "Ask AI" features: either [Ollama](https://ollama.com/) running locally, or an API key for Anthropic, OpenAI, or OpenCode (entered in Settings — no `.env` file needed)

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
