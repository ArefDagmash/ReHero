import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { TextItem } from "pdfjs-dist";
import { loadPdf } from "@/lib/pdfStorage";
import { useAppStore } from "@/store/useAppStore";
import { log } from "@/lib/logger";
import type { Paper } from "@/types";

// Same worker setup as PdfThumbnail.tsx — reassigning the same value from
// two modules is harmless, both just need it set before getDocument() runs.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const DB_NAME = "research-reader-text-index";
const STORE_NAME = "paper-text";
const DB_VERSION = 1;

// Extraction is real work (loads the full PDF, walks every page) — cap so a
// pathological page count can't hang the background indexer indefinitely.
const MAX_INDEXED_PAGES = 500;

// Per-page (not one joined blob) so a search hit can jump straight to the
// right page, same as annotation/conversation results already do.
type IndexedText = {
  filePath: string;
  pages: string[];
  indexedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getPersistedPages(filePath: string): Promise<string[] | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(filePath);
    req.onsuccess = () => resolve((req.result as IndexedText | undefined)?.pages ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function setPersistedPages(filePath: string, pages: string[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ filePath, pages, indexedAt: Date.now() } satisfies IndexedText, filePath);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function extractPageTexts(filePath: string): Promise<string[]> {
  if (!filePath.startsWith("idb://")) return [];
  const bytes = await loadPdf(filePath.slice(6));
  if (!bytes) return [];

  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  try {
    const pageCount = Math.min(doc.numPages, MAX_INDEXED_PAGES);
    const pages: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .filter((it): it is TextItem => "str" in it)
        .map((it) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push(text);
    }
    return pages;
  } finally {
    doc.destroy();
  }
}

// In-memory cache backing synchronous lookups from SearchPanel's useMemo —
// IndexedDB reads are async and search needs to stay a plain synchronous
// filter over already-loaded state, same as it already does for annotations
// and conversations.
const textCache = new Map<string, string[]>();

export function getCachedPagesSync(filePath: string): string[] | null {
  return textCache.get(filePath) ?? null;
}

// Best-effort, single-paper: checks the in-memory cache, then the
// IndexedDB cache, then extracts fresh from the PDF as a last resort.
// Any failure just means that paper isn't full-text searchable yet —
// never surfaced as an error, matching the rest of this app's background
// enrichment (citation counts, query rewriting, etc).
export async function ensureIndexed(paper: Pick<Paper, "filePath">): Promise<void> {
  const { filePath } = paper;
  if (textCache.has(filePath)) return;

  try {
    const persisted = await getPersistedPages(filePath);
    if (persisted !== null) {
      textCache.set(filePath, persisted);
      useAppStore.setState((s) => ({ paperTextIndexVersion: s.paperTextIndexVersion + 1 }));
      return;
    }

    const pages = await extractPageTexts(filePath);
    textCache.set(filePath, pages);
    if (pages.length > 0) await setPersistedPages(filePath, pages);
    useAppStore.setState((s) => ({ paperTextIndexVersion: s.paperTextIndexVersion + 1 }));
  } catch (e) {
    log.store.error("paper text indexing failed", { filePath, error: e });
  }
}

let backgroundIndexRunning = false;

// Walks the whole library indexing anything not yet cached, a little at a
// time so it never competes hard with the main thread — used both as a
// one-time catch-up scan (for papers added before this feature existed) and
// after adding a new paper. Overlapping calls are fine: each just skips
// whatever the other has already covered via the in-memory cache.
export async function indexLibraryInBackground(papers: Pick<Paper, "filePath">[]): Promise<void> {
  if (backgroundIndexRunning) return;
  backgroundIndexRunning = true;
  try {
    for (const paper of papers) {
      if (textCache.has(paper.filePath)) continue;
      await ensureIndexed(paper);
      // Yield between papers so a large library doesn't jank the UI while
      // catching up in the background.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  } finally {
    backgroundIndexRunning = false;
  }
}
