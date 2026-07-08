# CORS / Proxy Issue — Cloud LLM APIs from Browser

## Symptom

ClarifyPanel shows:
```
CORS blocked — cloud LLM APIs can't be called from browser. Use Tauri, or set up a proxy.
```

Underlying error from browser: `NetworkError when attempting to fetch resource.`

Happens when calling Anthropic, OpenAI, or OpenCode from **web dev mode** (`npm run dev` in a browser). Tauri builds are fine (webview doesn't enforce CORS).

## What We Built

### 1. Vite dev proxy (`vite.config.ts`)
Added proxy routes to forward cloud API calls through the Vite dev server:

```ts
proxy: {
  "/api/proxy/anthropic": {
    target: "https://api.anthropic.com",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/proxy\/anthropic/, ""),
  },
  "/api/proxy/openai": {
    target: "https://api.openai.com",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/proxy\/openai/, ""),
  },
},
```

### 2. URL routing in `src/lib/llmStream.ts`
`resolveEndpoint()` detects Tauri vs web:

```ts
const isTauri = "__TAURI_INTERNALS__" in window;
if (provider === "anthropic") {
  const base = isTauri ? "https://api.anthropic.com" : "/api/proxy/anthropic";
  return { url: `${base}/v1/messages`, apiKey };
}
// Same for OpenAI: /api/proxy/openai/v1/chat/completions
```

### 3. Architecture
```
Browser fetch("/api/proxy/anthropic/v1/messages")
  → Vite dev server (localhost:1420)
  → http-proxy-middleware rewrites to https://api.anthropic.com/v1/messages
  → x-api-key header passes through
  → Response streams back to browser
```

## Why It Might Still Fail

1. **Dev server not restarted** — `vite.config.ts` changes require restarting `npm run dev`.

2. **OpenCode provider selected** — OpenCode endpoints are user-configurable and NOT proxied. The proxy only covers Anthropic and OpenAI. If the user picked OpenCode, they get direct fetch → CORS.

3. **Production static build** — Vite proxy only works in dev mode (`npm run dev`). A `vite build` produces static files with no proxy server. Requests to `/api/proxy/anthropic` 404. For production web: use Tauri build, or deploy behind a real reverse proxy (nginx, Cloudflare Worker).

4. **Incorrect API key format** — If the key was corrupted by the previous encryption bug (`String.fromCharCode(...spread)`), the API returns 401/403, but the network layer should still succeed (not CORS).

## Checklist for Diagnosis

- [ ] Run `npm run dev` (not `vite build`/`vite preview`)
- [ ] Confirm the Vite proxy is active: check terminal for `proxy /api/proxy/anthropic`
- [ ] Check which LLM provider is selected in Settings (OpenCode = no proxy)
- [ ] Open DevTools Network tab → look for requests to `/api/proxy/anthropic` (proxied) vs `https://api.anthropic.com` (direct)
- [ ] If request is to `https://api.anthropic.com` directly → `isTauri` check is failing or using production build
- [ ] Try `curl http://localhost:1420/api/proxy/anthropic/v1/messages -H "x-api-key: sk-ant-..."` to test proxy directly

## Related Files

| File | Role |
|------|------|
| `vite.config.ts:17-29` | Vite dev proxy config |
| `src/lib/llmStream.ts:17-27` | `resolveEndpoint()` — Tauri/web URL routing |
| `src/lib/secureStore.ts` | API key storage + encryption |
| `src/components/ClarifyPanel.tsx:166-175` | Error display + CORS detection |
