/**
 * Secure storage for sensitive data like API keys.
 * Uses sessionStorage (cleared on tab close) with base64 obfuscation.
 *
 * @module copilot/providers/secureStorage
 */

export class SecureStorage {
  private static PREFIX = 'openclo-secure-';

  /**
   * Store a value securely.
   */
  static set(key: string, value: string): void {
    try {
      sessionStorage.setItem(this.PREFIX + key, btoa(value));
    } catch {
      // Ignore storage errors (e.g., private browsing)
    }
  }

  /**
   * Retrieve a stored value.
   */
  static get(key: string): string | null {
    try {
      const val = sessionStorage.getItem(this.PREFIX + key);
      return val ? atob(val) : null;
    } catch {
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
      // Ignore
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
      // Ignore
    }
  }
}
