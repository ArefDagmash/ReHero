// ponytail: AES-GCM encryption at rest, Tauri .keys.json for desktop, sessionStorage for web
import { encrypt, decrypt } from "@/lib/secretStorage";

let _store: any = null;

async function getStore() {
  if (_store) return _store;
  if ("__TAURI_INTERNALS__" in window) {
    const { Store } = await import("@tauri-apps/plugin-store");
    _store = await Store.load(".keys.json");
  }
  return _store;
}

function sessionGet(key: string): string | null {
  try { return sessionStorage.getItem(`rr_${key}`); } catch { return null; }
}
function sessionSet(key: string, val: string) {
  try { sessionStorage.setItem(`rr_${key}`, val); } catch {}
}
function sessionDel(key: string) {
  try { sessionStorage.removeItem(`rr_${key}`); } catch {}
}

export async function getKey(provider: string): Promise<string | null> {
  try {
    const store = await getStore();
    const raw = store ? (await store.get(`api_key_${provider}`)) ?? null : sessionGet(`${provider}_key`);
    if (!raw) return null;
    return (await decrypt(raw)).replace(/[^\x20-\x7E]/g, "");
  } catch {
    return null;
  }
}

export async function setKey(provider: string, key: string): Promise<void> {
  const clean = key.trim().replace(/[^\x20-\x7E]/g, ""); // ASCII printable only (fetch headers require ByteString)
  if (!clean) return;
  const encrypted = await encrypt(clean);
  const store = await getStore();
  if (store) {
    await store.set(`api_key_${provider}`, encrypted);
    await store.save();
  } else {
    sessionSet(`${provider}_key`, encrypted);
  }
}

export async function deleteKey(provider: string): Promise<void> {
  const store = await getStore();
  if (store) {
    await store.delete(`api_key_${provider}`);
    await store.save();
  } else {
    sessionDel(`${provider}_key`);
  }
}
