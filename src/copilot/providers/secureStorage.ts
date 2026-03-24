/**
 * Encrypted storage for sensitive data like API keys.
 * Uses AES-GCM via Web Crypto API with a per-session key held only in memory.
 * Encrypted values are persisted to sessionStorage (cleared on tab close).
 *
 * The encryption key is never written to disk or storage — it exists only in
 * the JS heap for the lifetime of the page. After a page reload the key is
 * regenerated and any previously encrypted sessionStorage entries become
 * undecryptable (they are silently removed on the next `get` attempt).
 *
 * @module copilot/providers/secureStorage
 */

const PREFIX = 'openclo-secure-';

// ─── Per-session AES-GCM key (memory-only) ──────────────────────────────────

let sessionKeyPromise: Promise<CryptoKey> | null = null;

function getSessionKey(): Promise<CryptoKey> {
  if (!sessionKeyPromise) {
    sessionKeyPromise = crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt'],
    ).catch((err) => {
      // Reset so the next call can retry (e.g. after navigating to HTTPS)
      sessionKeyPromise = null;
      throw err;
    });
  }
  return sessionKeyPromise;
}

// ─── Encrypt / Decrypt helpers ──────────────────────────────────────────────

async function encryptValue(value: string): Promise<string> {
  const key = await getSessionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  // Concatenate IV (12 bytes) + ciphertext, then base64-encode for storage
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(Array.from(combined, b => String.fromCharCode(b)).join(''));
}

async function decryptValue(stored: string): Promise<string> {
  const key = await getSessionKey();
  const raw = atob(stored);
  const combined = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) combined[i] = raw.charCodeAt(i);

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plainBuf);
}

// ─── In-memory cache (avoids repeated decryption within the same session) ───

const cache = new Map<string, string>();

// ─── Public API ─────────────────────────────────────────────────────────────

export class SecureStorage {
  /**
   * Store a value with AES-GCM encryption.
   * The plaintext is cached in memory and the ciphertext is written to
   * sessionStorage.
   */
  static async set(key: string, value: string): Promise<boolean> {
    try {
      const encrypted = await encryptValue(value);
      sessionStorage.setItem(PREFIX + key, encrypted);
      cache.set(key, value); // only cache after storage succeeds
      return true;
    } catch (err) {
      console.warn('[SecureStorage] Failed to store key:', key, err);
      return false;
    }
  }

  /**
   * Retrieve a stored value. Returns from the in-memory cache when available,
   * otherwise decrypts from sessionStorage.
   *
   * If decryption fails (e.g. stale entry from a previous session), the entry
   * is silently removed and `null` is returned.
   */
  static async get(key: string): Promise<string | null> {
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    try {
      const stored = sessionStorage.getItem(PREFIX + key);
      if (!stored) return null;
      const plaintext = await decryptValue(stored);
      cache.set(key, plaintext);
      return plaintext;
    } catch {
      // Decryption failure — likely a stale entry from a previous page load
      try { sessionStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
      return null;
    }
  }

  /**
   * Remove a stored value from both cache and sessionStorage.
   */
  static remove(key: string): void {
    cache.delete(key);
    try {
      sessionStorage.removeItem(PREFIX + key);
    } catch {
      // Storage removal failure is non-critical
    }
  }

  /**
   * Clear all encrypted storage values.
   */
  static clear(): void {
    cache.clear();
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const storageKey = sessionStorage.key(i);
        if (storageKey && storageKey.startsWith(PREFIX)) {
          keysToRemove.push(storageKey);
        }
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k));
    } catch {
      // Clear failure is non-critical
    }
  }

  /** @internal Reset session key + cache. For tests only. */
  static _resetForTest(): void {
    sessionKeyPromise = null;
    cache.clear();
  }
}
