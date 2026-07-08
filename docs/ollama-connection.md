# Ollama Model Detection & Connection

## Overview

Odysseus detects a running Ollama instance and lists its models through several mechanisms:

1. **Startup detection** — reads `OLLAMA_BASE_URL`/`OLLAMA_URL` env vars, falls back to `http://127.0.0.1:11434/v1`
2. **Model discovery** — scans `http://<host>:11434/v1/models` (OpenAI-compat) + `/api/tags` (native) across all reachable hosts
3. **Ping/health check** — probes `/api/version` and `/api/tags` for native Ollama endpoints
4. **Provider classification** — detects whether a URL is native Ollama (`/api/chat`) vs OpenAI-compatible (`/v1`)

## Files Involved

| File | Role |
|------|------|
| `app.py:831-839` | Startup: reads env vars, constructs default Ollama URL |
| `src/model_discovery.py` | Scans hosts for running Ollama, hits `/v1/models` on port 11434 |
| `routes/model_routes.py:700-767` | `/api/tags` fallback probe when `/v1/models` fails |
| `routes/model_routes.py:770-830` | Ping/health check: probes `/api/version`, `/api/tags` |
| `src/llm_core.py:263-303` | URL classification: `_is_ollama_native_url`, `_normalize_ollama_url` |
| `src/llm_core.py:343-379` | `_build_ollama_payload`: builds request for `/api/chat` |

## How It Works

### 1. Startup — Default URL (`app.py:831-839`)

```python
ollama_url = (
    os.getenv("OLLAMA_BASE_URL")
    or os.getenv("OLLAMA_URL")
    or ("http://host.docker.internal:11434/v1" if in_docker else "http://127.0.0.1:11434/v1")
)
```

Priority: env var `OLLAMA_BASE_URL` > `OLLAMA_URL` > Docker host fallback > localhost fallback.

### 2. Model Discovery — Scanning (`src/model_discovery.py:190-224`)

`ModelDiscovery.discover_models()` scans every known host on a list of well-known ports:

```python
ports = list(range(8000, 8021)) + [1234, 11434, 11435]
```

For each `(host, port)`, it hits `http://<host>:<port>/v1/models` with a 3s timeout:

```python
def _check_port(self, host, port):
    base = f"http://{host}:{port}/v1"
    r = httpx.get(f"{base}/models", timeout=3)
    data = r.json()
    ids = [m.get("id") for m in (data.get("data") or []) if m.get("id")]
    return {"host": host, "port": port, "url": f"http://{host}:{port}{self.openai_compat_path}", "models": ids}
```

Ollama's OpenAI-compatible endpoint (`/v1/models`) returns `{"object":"list","data":[{"id":"llama3.2:3b"},...]}` — the standard OpenAI format. This is the primary detection path.

### 3. `/api/tags` Fallback (`routes/model_routes.py:747-767`)

If `/v1/models` fails (older Ollama builds), it falls back to Ollama's native API:

```python
parsed = urlparse(base)
if parsed.port == 11434 or "ollama" in (parsed.hostname or "").lower():
    root = base[:-3].rstrip("/") if base.endswith("/v1") else base
    r = httpx.get(root + "/api/tags", timeout=timeout)
    data = r.json()
    models = [m.get("name") for m in (data.get("models") or [])]
```

Ollama's `/api/tags` returns `{"models":[{"name":"llama3.2:3b","modified_at":"...","size":...}]}`.

### 4. Ping / Health Check (`routes/model_routes.py:770-830`)

When checking if an endpoint is reachable, it detects Ollama by port/hostname and probes native paths:

```python
looks_like_ollama = (
    parsed_base.port == 11434
    or "ollama" in (parsed_base.hostname or "").lower()
)
if looks_like_ollama:
    for path in ("/api/version", "/api/tags"):
        r = httpx.get(root + path, timeout=timeout)
```

### 5. URL Classification (`src/llm_core.py:263-276`)

`_is_ollama_native_url()` decides if a URL uses Ollama's native API (vs OpenAI-compatible `/v1`):

```python
def _is_ollama_native_url(url):
    parsed = urlparse(url)
    host = parsed.hostname or ""
    path = (parsed.path or "").rstrip("/")
    if _host_match(url, "ollama.com"):
        return True
    if path.startswith("/v1"):
        return False  # OpenAI-compatible, not native
    local_ollama_host = host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"} or parsed.port == 11434
    return local_ollama_host and (path == "" or path == "/api" or path.startswith("/api/"))
```

**Rule of thumb:** if the URL has port 11434 AND the path starts with `/api` (not `/v1`), it's native Ollama.

### 6. Sending a Chat Request (`src/llm_core.py:343-379`)

```python
payload = {
    "model": model,
    "messages": messages,
    "stream": stream,
    "options": {"temperature": temperature, "num_predict": max_tokens, "num_ctx": context_length}
}
httpx.post("http://127.0.0.1:11434/api/chat", json=payload, timeout=...)
```

---

## Quick Start: Connect Your Own Website to Ollama

Odysseus uses Ollama's OpenAI-compatible `/v1` surface, which is the simplest path. Here's the minimal code:

### JavaScript (browser)

```js
// Check if Ollama is running and list models
async function getOllamaModels(baseUrl = 'http://127.0.0.1:11434') {
  try {
    const r = await fetch(`${baseUrl}/v1/models`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    // data.data = [{id: "llama3.2:3b", object: "model", ...}, ...]
    return data.data.map(m => m.id);
  } catch {
    // Fallback: try native /api/tags
    try {
      const r = await fetch(`${baseUrl}/api/tags`);
      const data = await r.json();
      // data.models = [{name: "llama3.2:3b", ...}, ...]
      return (data.models || []).map(m => m.name);
    } catch {
      return [];
    }
  }
}

// Send a chat message
async function chatOllama(model, messages, baseUrl = 'http://127.0.0.1:11434') {
  const r = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      stream: false,
    }),
  });
  const data = await r.json();
  // data.choices[0].message.content
  return data.choices[0].message.content;
}
```

### Python

```python
import httpx

def get_ollama_models(base_url="http://127.0.0.1:11434"):
    try:
        r = httpx.get(f"{base_url}/v1/models", timeout=3)
        r.raise_for_status()
        return [m["id"] for m in r.json()["data"]]
    except Exception:
        # Fallback: native /api/tags
        try:
            r = httpx.get(f"{base_url}/api/tags", timeout=3)
            r.raise_for_status()
            return [m["name"] for m in r.json()["models"]]
        except Exception:
            return []

def chat_ollama(model, messages, base_url="http://127.0.0.1:11434"):
    r = httpx.post(
        f"{base_url}/v1/chat/completions",
        json={"model": model, "messages": messages, "temperature": 0.7},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]
```

### How It Punches Through CORS

Ollama doesn't send CORS headers by default. You have two options:

1. **Start Ollama with CORS**: `OLLAMA_ORIGINS="*" ollama serve`
2. **Proxy through your backend** (what Odysseus does — the Python server proxies requests to Ollama so the browser never hits it directly)

### Key Ollama URLs

| URL | Purpose |
|-----|---------|
| `http://127.0.0.1:11434/v1/models` | List models (OpenAI-compat) |
| `http://127.0.0.1:11434/api/tags` | List models (native) |
| `http://127.0.0.1:11434/api/version` | Health check (native) |
| `http://127.0.0.1:11434/v1/chat/completions` | Chat endpoint (OpenAI-compat) |
| `http://127.0.0.1:11434/api/chat` | Chat endpoint (native) |
