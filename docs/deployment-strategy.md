# ReHero Deployment Strategy

_Session: 2026-07-04_

---

## What ReHero Is

A local-first Tauri v2 desktop app (React 19 + TypeScript + Rust). No backend, no database, no external services. All data stored locally via `tauri-plugin-store`. AI via Ollama (local) or cloud API keys (Anthropic, OpenAI, OpenCode).

---

## Decision: Ship as a Desktop App

**Not** a web app + VPS. Reasons:

- Already 90% done — no backend rewrite needed
- Local-first is a feature for researchers (privacy, offline, no account)
- Zotero, Papers, LM Studio, Jan.ai — all successful desktop-only tools in this space
- VPS route requires: full backend rewrite, auth, database, file storage, ops burden, monthly cost
- **That's v2, not v1** — build it if users ask for sync/web access

---

## Distribution Channels

### Mac
| Channel | Cost | Notes |
|---|---|---|
| GitHub Releases (`.dmg`) | Free | Start here |
| Direct download (own site) | Free | After landing page exists |
| Mac App Store | $99/year Apple Dev account | Hard — sandboxing breaks sidecar binaries |
| Homebrew Cask | Free | Good for dev/researcher audience |

### Windows
| Channel | Cost | Notes |
|---|---|---|
| GitHub Releases (`.msi`) | Free | Start here |
| Microsoft Store | $19 one-time | Later, for discoverability |
| Winget | Free | Submit to winget-pkgs repo |

### Linux
| Channel | Cost | Notes |
|---|---|---|
| GitHub Releases (`.AppImage`, `.deb`) | Free | Covered by Tauri's default build |

**Mac App Store is not viable** for this app — App Store sandboxing blocks connections to `localhost` services outside the app's sandbox, so even if the user has Ollama installed, the app can't reach it. Direct `.dmg` distribution has none of these restrictions. This is why Jan.ai, LM Studio, GPT4All all distribute directly. Normal for this category.

---

## Local Model Strategy

### The Problem
Requiring users to install Ollama separately and configure `localhost:11434` is too much friction for general users.

### The Solution: Detect Ollama, Guide User to Install It
No need to bundle anything. On first launch, check if Ollama is running at `localhost:11434`. If not, show a setup screen with a download link. Once installed, the app pulls a model directly via `ollama pull`.

```
First launch (Ollama not installed):
┌─────────────────────────────────────────┐
│  ReHero needs Ollama to run AI locally  │
│  [ Download Ollama ]  ← opens ollama.com│
│  Already installed? [ Check again ]     │
└─────────────────────────────────────────┘

After Ollama is installed:
→ App detects it at localhost:11434 ✓
→ User picks a model, app runs `ollama pull phi3`
→ Progress shown in-app, done
```

No model bundled in the installer — keeps the download small.

### Recommended Default Model: Phi-3 Mini 3.8B
| Model | Size (Q4) | Why |
|---|---|---|
| **Phi-3 Mini 3.8B** | ~2.2 GB | Best size/quality ratio for research Q&A |
| Gemma 2 2B | ~1.5 GB | Faster, less capable |
| Qwen2.5 7B | ~4.4 GB | Best quality, needs 8GB+ RAM |
| Llama 3.2 3B | ~2.0 GB | Good balance |

### Why Mac is the Best Platform for This
Apple Silicon (M1/M2/M3/M4) runs 7B models at 40–60 tok/s via Metal GPU acceleration — faster than cloud APIs feel in practice. The target user (researcher with a MacBook Pro) is holding a local AI powerhouse.

### Alternative: llamafile
Mozilla's project — model + runtime in a single executable. Even simpler to bundle, but installer is 2–4 GB upfront. Viable if Ollama sidecar proves complex.

---

## Cloud API Keys: Keep as Optional

The existing cloud API key UI (Anthropic, OpenAI, OpenCode) stays exactly as-is — moved to Settings as a power user option.

```
Default:   local Ollama sidecar → works out of the box
Optional:  Settings → "Use your own API key" → cloud providers
```

No code removed. Just changes what happens on first launch.

---

## What Needs to Be Built

| Task | Effort | Notes |
|---|---|---|
| GitHub Actions release pipeline | Low | Cross-platform builds on tag push |
| Apple Developer account + notarization | Low (setup) | $99/year, required to avoid Gatekeeper warning |
| Ollama sidecar integration in Tauri | Medium | `tauri-plugin-shell` sidecar config + auto-start logic |
| First-launch model download UI | Medium | Progress bar, stored flag so it runs once |
| Update default provider to local Ollama | Low | Change initial store state |

---

## Cost to Operate

| Item | Cost |
|---|---|
| Hetzner / hosting | $0 (no server) |
| Apple Developer account | $99/year |
| Windows code signing (optional) | $200–500/year — skip for now |
| GitHub Actions | Free (public repo) |
| **Total to ship v1** | **$99/year** |

---

## Announcement Channels

- **Product Hunt** — launch day
- **Hacker News** (Show HN) — researchers and devs, perfect audience
- **Reddit:** r/MacApps, r/academia, r/PhD, r/gradadmissions
- **Twitter/X** — #buildinpublic

---

## If Users Later Ask for Sync / Web Access (v2)

That's when the VPS route makes sense:

- **Backend:** Node.js + Express + Postgres (matches existing TS stack)
- **VPS:** Hetzner CX22 (~€4/month)
- **Serving:** Docker Compose + Nginx + Let's Encrypt
- **Data:** annotations, AI chats, reading progress, uploaded PDFs
- **Key work:** replace `tauri-plugin-store` / `tauri-plugin-fs` with REST API calls

Don't build this until there's user demand for it.
