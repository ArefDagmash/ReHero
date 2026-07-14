import { log } from "@/lib/logger";

// DOAB (Directory of Open Access Books) — a DSpace-based index of
// open-access academic books. Verified live before writing this (see
// docs/explore-books-plan.md): `/rest/search?expand=metadata` returns full
// Dublin Core metadata inline per result (no N+1 per-item lookup needed),
// same as arXiv's single-request search. No CORS header — needs the
// /api/proxy/doab route in web-dev mode, same as arxiv.ts.
//
// Unlike arXiv, DOAB doesn't reliably expose a directly-downloadable PDF
// (see the plan doc for why — most links either go to an external
// publisher page in an inconsistent format, or to OAPEN's own file host,
// which runs an anti-bot JS challenge that blocks any programmatic fetch).
// Decided: don't attempt a PDF fetch at all — DoabBook only carries a link
// to the DOAB page itself, for a human to open and download from there.

export type DoabBook = {
  id: string; // DOAB item uuid
  title: string;
  authors: string[];
  summary: string; // abstract
  published: string; // dc.date.issued, usually just a year
  categories: string[]; // dc.subject.other[] (free-text keywords)
  publisher: string;
  doabUrl: string;
};

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function doabApiBase(): string {
  return isTauri() ? "https://directory.doabooks.org/rest" : "/api/proxy/doab/rest";
}

// No confirmed hard rate limit on DOAB (unlike arXiv, which explicitly
// documents one) — this is precautionary, same "be a good API citizen"
// habit as arxiv.ts's throttle, just a little less conservative given
// there's no documented requirement.
const DOAB_MIN_INTERVAL_MS = 1000;
let lastDoabRequestAt = 0;

async function waitForDoabRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastDoabRequestAt;
  if (elapsed < DOAB_MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, DOAB_MIN_INTERVAL_MS - elapsed));
  }
  lastDoabRequestAt = Date.now();
}

type DoabMetadataField = { key: string; value: string; schema: string; element: string; qualifier: string | null };

type DoabSearchItem = {
  uuid: string;
  name: string;
  handle: string;
  metadata?: DoabMetadataField[] | null;
};

function getMeta(fields: DoabMetadataField[], schema: string, element: string, qualifier: string | null = null): string[] {
  return fields
    .filter((f) => f.schema === schema && f.element === element && f.qualifier === qualifier)
    .map((f) => f.value);
}

function parseItem(item: DoabSearchItem): DoabBook {
  const fields = item.metadata ?? [];
  const authors = getMeta(fields, "dc", "contributor", "author");
  const abstract = getMeta(fields, "dc", "description", "abstract")[0] ?? "";
  const published = getMeta(fields, "dc", "date", "issued")[0] ?? "";
  const categories = getMeta(fields, "dc", "subject", "other");
  const publisher = getMeta(fields, "publisher", "name")[0] ?? "";

  return {
    id: item.uuid,
    title: item.name,
    authors,
    summary: abstract,
    published,
    categories,
    publisher,
    doabUrl: `https://directory.doabooks.org/handle/${item.handle}`,
  };
}

export async function searchDoab(
  query: string,
  opts: { maxResults?: number; start?: number } = {},
): Promise<DoabBook[]> {
  const { maxResults = 20, start = 0 } = opts;
  const params = new URLSearchParams({
    query,
    limit: String(maxResults),
    offset: String(start),
    expand: "metadata",
  });

  await waitForDoabRateLimit();
  const res = await fetch(`${doabApiBase()}/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`DOAB returned ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    log.explore.error("DOAB search: unexpected response shape", { preview: JSON.stringify(data).slice(0, 200) });
    return [];
  }

  return (data as DoabSearchItem[]).map(parseItem);
}
