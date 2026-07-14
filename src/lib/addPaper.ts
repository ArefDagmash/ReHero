import { v4 as uuidv4 } from "uuid";
import { savePdf } from "@/lib/pdfStorage";
import { useAppStore } from "@/store/useAppStore";
import { ensureIndexed } from "@/lib/paperTextIndex";
import type { Paper } from "@/types";

// Shared by the manual "add paper" modal (HomePage.tsx) and Explore's
// "Add to Library" (ExplorePage.tsx) — anything that already has PDF bytes
// in hand, regardless of where they came from, goes through here so both
// paths save/register a paper identically.
export async function addPaperFromBytes(
  bytes: Uint8Array,
  title: string,
  isBook = false,
  opts?: { navigate?: boolean; source?: "manual" | "explore" },
): Promise<Paper> {
  const id = uuidv4();
  await savePdf(id, bytes);
  const paper: Paper = {
    id,
    title,
    filePath: `idb://${id}`,
    totalPages: 0,
    lastPage: 1,
    tags: [],
    lastOpenedAt: new Date().toISOString(),
    source: opts?.source ?? "manual",
  };
  if (isBook) {
    useAppStore.getState().addBook(paper, opts);
  } else {
    useAppStore.getState().addPaper(paper, opts);
  }
  // Fire-and-forget — full-text search picks it up whenever this finishes,
  // never blocks adding the paper itself.
  ensureIndexed(paper).catch(() => {});
  return paper;
}
