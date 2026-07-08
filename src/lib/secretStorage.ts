// ponytail: AES-GCM encryption for API keys at rest.
// Pattern from odysseus: Fernet encrypt → stored with "enc:" prefix.
// Web Crypto API (SubtleCrypto) — available in both browser and Tauri webview.
// Threat model: protects against file exfiltration, not process compromise.

let _masterKey: CryptoKey | null = null;
const MK_STORE_KEY = "rr_mk";

// Safe base64 encode/decode without spread operator (avoids arg count limits)
function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    parts.push(String.fromCharCode(bytes[i]));
  }
  return btoa(parts.join(""));
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getMasterKey(): Promise<CryptoKey> {
  if (_masterKey) return _masterKey;

  const stored = localStorage.getItem(MK_STORE_KEY);
  if (stored) {
    try {
      const raw = base64ToBytes(stored);
      _masterKey = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
      return _masterKey;
    } catch {}
  }

  _masterKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const exported = new Uint8Array(await crypto.subtle.exportKey("raw", _masterKey));
  localStorage.setItem(MK_STORE_KEY, bytesToBase64(exported));

  try {
    if ("__TAURI_INTERNALS__" in window) {
      const { Store } = await import("@tauri-apps/plugin-store");
      const tauriStore = await Store.load(".keys.json");
      await tauriStore.set(MK_STORE_KEY, bytesToBase64(exported));
      await tauriStore.save();
    }
  } catch {}

  return _masterKey;
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return `enc:${bytesToBase64(combined)}`;
}

export async function decrypt(stored: string): Promise<string> {
  if (!stored || !stored.startsWith("enc:")) return stored;
  const combined = base64ToBytes(stored.slice(4));
  const key = await getMasterKey();
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(decrypted);
}
