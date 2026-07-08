// CORS is wide open on this API (verified: access-control-allow-origin: *
// on both the single-paper GET and the batch POST endpoint) — no proxy
// needed in web-dev mode, unlike export.arxiv.org.
//
// The unauthenticated tier rate-limits aggressively (observed a 429 on a
// single plain GET during testing, with no sustained load at all). This is
// explicitly best-effort enrichment per docs/explore-tab-plan.md — any
// failure (429, network error, malformed response) should just mean "no
// citation stat for this paper", never surface an error or block results.
const S2_BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch";

// Semantic Scholar's arXiv ids don't carry the version suffix (v1, v2, ...)
// that arXiv's own ids do.
function stripVersion(arxivId: string): string {
  return arxivId.replace(/v\d+$/, "");
}

export async function fetchCitationCounts(arxivIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (arxivIds.length === 0) return result;

  const ids = arxivIds.map((id) => `ARXIV:${stripVersion(id)}`);

  try {
    const res = await fetch(`${S2_BATCH_URL}?fields=citationCount`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return result;

    const data = await res.json();
    if (!Array.isArray(data)) return result;

    // Response is positionally aligned with the request ids, `null` for any
    // id it couldn't resolve (verified against the real API).
    data.forEach((entry: any, i: number) => {
      if (entry && typeof entry.citationCount === "number") {
        result.set(arxivIds[i], entry.citationCount);
      }
    });
  } catch {
    // best-effort — swallow network errors too
  }
  return result;
}
