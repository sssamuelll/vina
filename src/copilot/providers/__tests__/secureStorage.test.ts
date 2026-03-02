import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock sessionStorage
const store: Record<string, string> = {};
const sessionStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
};
vi.stubGlobal('sessionStorage', sessionStorageMock);

import { SecureStorage } from '../secureStorage';

describe('SecureStorage', () => {
  beforeEach(() => {
    sessionStorageMock.clear();
    vi.clearAllMocks();
  });

  it('stores and retrieves a value', () => {
    SecureStorage.set('test-key', 'secret-value');
    expect(SecureStorage.get('test-key')).toBe('secret-value');
  });

  it('returns null for missing key', () => {
    expect(SecureStorage.get('nonexistent')).toBeNull();
  });

  it('removes a value', () => {
    SecureStorage.set('test-key', 'secret-value');
    SecureStorage.remove('test-key');
    expect(SecureStorage.get('test-key')).toBeNull();
  });

  it('clears all secure values', () => {
    SecureStorage.set('key1', 'value1');
    SecureStorage.set('key2', 'value2');
    SecureStorage.clear();
    expect(SecureStorage.get('key1')).toBeNull();
    expect(SecureStorage.get('key2')).toBeNull();
  });

  it('does not affect non-prefixed sessionStorage items', () => {
    sessionStorage.setItem('other-key', 'other-value');
    SecureStorage.set('secure-key', 'secure-value');
    SecureStorage.clear();
    expect(sessionStorage.getItem('other-key')).toBe('other-value');
  });
});
