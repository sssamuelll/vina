import { describe, it, expect, beforeEach } from 'vitest';

// ─── sessionStorage mock ────────────────────────────────────────────────────
const store: Record<string, string> = {};
const sessionStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
};
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, writable: true });

import { SecureStorage } from '../secureStorage';

describe('SecureStorage (AES-GCM)', () => {
  beforeEach(() => {
    sessionStorageMock.clear();
    SecureStorage._resetForTest();
  });

  it('stores and retrieves a value', async () => {
    await SecureStorage.set('test-key', 'secret-value');
    expect(await SecureStorage.get('test-key')).toBe('secret-value');
  });

  it('returns null for missing key', async () => {
    expect(await SecureStorage.get('nonexistent')).toBeNull();
  });

  it('removes a value', async () => {
    await SecureStorage.set('test-key', 'secret-value');
    SecureStorage.remove('test-key');
    expect(await SecureStorage.get('test-key')).toBeNull();
  });

  it('clears all secure values', async () => {
    await SecureStorage.set('key1', 'value1');
    await SecureStorage.set('key2', 'value2');
    SecureStorage.clear();
    expect(await SecureStorage.get('key1')).toBeNull();
    expect(await SecureStorage.get('key2')).toBeNull();
  });

  it('does not affect non-prefixed sessionStorage items', async () => {
    sessionStorage.setItem('other-key', 'other-value');
    await SecureStorage.set('secure-key', 'secure-value');
    SecureStorage.clear();
    expect(sessionStorage.getItem('other-key')).toBe('other-value');
  });

  it('stores encrypted data in sessionStorage (not plaintext)', async () => {
    await SecureStorage.set('api-key', 'sk-ant-secret-12345');
    const raw = sessionStorage.getItem('vina-secure-api-key');
    expect(raw).not.toBeNull();
    // The raw value must NOT be the plaintext or simple base64 of the plaintext
    expect(raw).not.toBe('sk-ant-secret-12345');
    expect(raw).not.toBe(btoa('sk-ant-secret-12345'));
  });

  it('returns null and removes stale entries from a previous session key', async () => {
    // Store a value, then reset the key (simulating page reload)
    await SecureStorage.set('stale', 'old-value');
    SecureStorage._resetForTest();
    // get() should fail decryption and return null
    expect(await SecureStorage.get('stale')).toBeNull();
    // Stale entry should have been removed
    expect(sessionStorage.getItem('vina-secure-stale')).toBeNull();
  });

  it('uses in-memory cache for repeated reads', async () => {
    await SecureStorage.set('cached', 'fast-value');
    // First get populates cache, second reads from cache
    expect(await SecureStorage.get('cached')).toBe('fast-value');
    expect(await SecureStorage.get('cached')).toBe('fast-value');
  });
});
