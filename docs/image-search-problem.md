# Image Search — Problem & Current State

## Goal

User selects text in PDF → clicks "Images" → sees image search results *embedded* in the app (not just a new tab).

## What we've tried

### 1. Iframe (Google / Bing / DuckDuckGo)
All three engines block iframe embedding via `X-Frame-Options: DENY` or `Content-Security-Policy: frame-ancestors 'none'`. Firefox shows "can't open this page" error. Dead end.

### 2. Unsplash Source (`source.unsplash.com`)
The `/featured/?query` and `?sig=` URL patterns are unreliable — often returns the same image or nothing. No longer supported by Unsplash. Dead end.

### 3. CORS Proxy + scrape Google Images
Current approach in `ImageSearchPanel.tsx`: fetches Google Images HTML via `api.allorigins.win` proxy, regex-extracts image URLs, then pre-checks each image loads. Problems:

- **Slow**: proxy round-trip + parsing + sequential image pre-checks = 5–15 seconds
- **Empty results**: Google's HTML structure changes frequently, regex extraction is fragile and often returns zero matches
- **Proxy reliability**: `allorigins.win` goes down or gets rate-limited

## Viable solutions

| Solution | Pros | Cons |
|----------|------|------|
| **Unsplash API** (`api.unsplash.com/search/photos`) | Reliable, fast, returns proper image data | Needs free API key (5 min to register at unsplash.com/developers) |
| **Pexels API** (`api.pexels.com/v1/search`) | Same as above, generous free tier | Needs free API key |
| **Pixabay API** (`pixabay.com/api`) | No domain approval needed | Needs free API key |
| **Vite dev proxy** — proxy `/api/images?q=` → Google Images, server-side parse | No API key, no CORS issues, fast (server-side) | Needs HTML parsing that may break, only works in dev mode |
| **Tauri command** — Rust-side HTTP fetch + parse | Works in production, no CORS, fast | Only works in Tauri mode, not web dev |

## Recommendation

**Unsplash API** is the cleanest path. Steps:

1. Go to https://unsplash.com/developers → register app → get Access Key
2. Add key to `.env`: `VITE_UNSPLASH_KEY=your_key_here`
3. Fetch: `https://api.unsplash.com/search/photos?query=TERM&per_page=20`
4. Response includes `results[].urls.small` — display these directly, no pre-check needed

This would replace the entire scraping/proxy approach with ~10 lines of code and a 200ms response time.
