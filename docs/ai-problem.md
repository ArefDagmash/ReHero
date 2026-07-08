# AI Integration Problem

## What we want

A user highlights text in a PDF, clicks "Ask AI", types a question, and gets a response from an AI model.

## The goal

This should work for **web browser users** (not just Tauri desktop) without requiring them to:
- Install anything locally (Ollama)
- Paste an API key (privacy/trust concern)
- Sign up for anything

## The reality

| Option | Requires | Works in browser? |
|--------|----------|-------------------|
| Ollama (local) | User installs & runs `ollama serve` | Only on `localhost` dev; blocked on deployed HTTPS |
| API key | User pastes `sk-ant...` key into app | Works, but users don't trust pasting keys |
| Consumer OAuth ("Sign in with...") | Nothing from user | **Doesn't exist** — neither Anthropic nor OpenAI offer consumer OAuth for third-party apps |
| Chrome built-in AI | Chrome 129+ | Works, but Chrome-only, experimental |

## The blocker

**Neither Anthropic nor OpenAI has a consumer "Sign in with..." OAuth flow.**
Their "Workload Identity Federation" is for cloud servers (Kubernetes, AWS), not end users. There is no equivalent of "Sign in with Google" for AI APIs. Every AI-powered web tool (Replit AI, Poe, Perplexity API) ultimately falls back to either API keys, a backend proxy, or their own billing system.
