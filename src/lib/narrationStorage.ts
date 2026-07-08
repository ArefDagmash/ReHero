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

// Kept in a separate, tiny store so we can persist playback position on every
// few seconds of playback without rewriting the (multi-MB) audio blob each time.
export async function savePlaybackPosition(paperPath: string, positionSeconds: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROGRESS_STORE_NAME, "readwrite");
    tx.objectStore(PROGRESS_STORE_NAME).put(positionSeconds, paperPath);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPlaybackPosition(paperPath: string): Promise<number | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROGRESS_STORE_NAME, "readonly");
    const req = tx.objectStore(PROGRESS_STORE_NAME).get(paperPath);
    req.onsuccess = () => resolve(typeof req.result === "number" ? req.result : null);
    req.onerror = () => reject(req.error);
  });
}
