/**
 * Secure storage for sensitive data like API keys.
 * Uses sessionStorage (cleared on tab close) with base64 encoding.
 * Note: base64 is NOT encryption — it only prevents accidental visual
 * exposure of keys in devtools. It does not protect against XSS.
 *
 * @module copilot/providers/secureStorage
 */

export class SecureStorage {
  private static PREFIX = 'openclo-secure-';

  /**
   * Store a value securely. Returns true on success, false if storage is unavailable.
   */
  static set(key: string, value: string): boolean {
    try {
      sessionStorage.setItem(this.PREFIX + key, btoa(value));
      return true;
    } catch (err) {
      console.warn('[SecureStorage] Failed to store key — sessionStorage may be unavailable:', key, err);
      return false;
    }
  }

  /**
   * Retrieve a stored value.
   */
  static get(key: string): string | null {
    try {
      const val = sessionStorage.getItem(this.PREFIX + key);
      return val ? atob(val) : null;
    } catch (err) {
      console.warn('[SecureStorage] Failed to read key:', key, err);
      return null;
    }
  }

  /**
   * Remove a stored value.
   */
  static remove(key: string): void {
    try {
      sessionStorage.removeItem(this.PREFIX + key);
    } catch {
      // Storage removal failure is non-critical
    }
  }

  /**
   * Clear all secure storage values.
   */
  static clear(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(this.PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k));
    } catch {
      // Clear failure is non-critical
    }
  }
}
