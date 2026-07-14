const DB_NAME = "research-reader-narrations";
const STORE_NAME = "narrations";
const PROGRESS_STORE_NAME = "narration-progress";
const DB_VERSION = 2;

export type NarrationPageBoundary = { page: number; startFrac: number };

export type SavedNarration = {
  paperPath: string;
  from: number;
  to: number;
  audioBlob: Blob;
  pageBoundaries: NarrationPageBoundary[];
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains(PROGRESS_STORE_NAME)) db.createObjectStore(PROGRESS_STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// One saved narration per paper — generating a new one overwrites the last
// (and resets any saved playback position, since it may cover a different range).
export async function saveNarration(rec: SavedNarration): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, PROGRESS_STORE_NAME], "readwrite");
    tx.objectStore(STORE_NAME).put(rec, rec.paperPath);
    tx.objectStore(PROGRESS_STORE_NAME).delete(rec.paperPath);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadNarration(paperPath: string): Promise<SavedNarration | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(paperPath);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteNarration(paperPath: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, PROGRESS_STORE_NAME], "readwrite");
    tx.objectStore(STORE_NAME).delete(paperPath);
    tx.objectStore(PROGRESS_STORE_NAME).delete(paperPath);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export type PlaybackProgress = { positionSeconds: number; page: number | null };

// Kept in a separate, tiny store so we can persist playback position on every
// few seconds of playback without rewriting the (multi-MB) audio blob each
// time. `page` is whatever Reader.tsx's updateReadingPage() already computed
// for that instant (page boundaries are approximated from character
// position within the narration text, same approximation the live
// "Page N" indicator during playback already relies on) — stored so
// "Continue Listening" can jump straight to it without needing the audio's
// duration (which isn't known until the file is loaded) to redo that math.
export async function savePlaybackPosition(paperPath: string, positionSeconds: number, page: number | null): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROGRESS_STORE_NAME, "readwrite");
    tx.objectStore(PROGRESS_STORE_NAME).put({ positionSeconds, page } satisfies PlaybackProgress, paperPath);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPlaybackPosition(paperPath: string): Promise<PlaybackProgress | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROGRESS_STORE_NAME, "readonly");
    const req = tx.objectStore(PROGRESS_STORE_NAME).get(paperPath);
    req.onsuccess = () => {
      const result = req.result;
      // Old records (before `page` was tracked) were a plain number.
      if (typeof result === "number") return resolve({ positionSeconds: result, page: null });
      resolve(result ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export type NarrationSummary = {
  paperPath: string;
  from: number;
  to: number;
  createdAt: number;
  playbackPositionSeconds: number | null;
  lastKnownPage: number | null;
};

// Metadata for every saved narration across the whole library (no audioBlob
// — that's the point, this is for a "Continue Listening" list on Home,
// which needs to cheaply show many papers at once, not play any of them).
export async function listNarrationSummaries(): Promise<NarrationSummary[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, PROGRESS_STORE_NAME], "readonly");
    const narrationsReq = tx.objectStore(STORE_NAME).getAll();
    const posKeysReq = tx.objectStore(PROGRESS_STORE_NAME).getAllKeys();
    const posValsReq = tx.objectStore(PROGRESS_STORE_NAME).getAll();

    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      const narrations = (narrationsReq.result ?? []) as SavedNarration[];
      const posKeys = (posKeysReq.result ?? []) as string[];
      const posVals = (posValsReq.result ?? []) as (PlaybackProgress | number)[];
      const posMap = new Map(posKeys.map((k, i) => [k, posVals[i]]));
      resolve(
        narrations.map((n) => {
          const raw = posMap.get(n.paperPath);
          const progress: PlaybackProgress | null =
            raw === undefined ? null : typeof raw === "number" ? { positionSeconds: raw, page: null } : raw;
          return {
            paperPath: n.paperPath,
            from: n.from,
            to: n.to,
            createdAt: n.createdAt,
            playbackPositionSeconds: progress?.positionSeconds ?? null,
            lastKnownPage: progress?.page ?? null,
          };
        }),
      );
    };
  });
}
