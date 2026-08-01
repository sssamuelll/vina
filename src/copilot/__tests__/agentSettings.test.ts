/**
 * Tests for AgentSettings logic functions.
 *
 * Tests the pure logic exports from AgentSettings.tsx (language preference
 * persistence) without rendering the React component.
 *
 * @module agentSettings.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadLanguagePreference,
  saveLanguagePreference,
} from '../AgentSettings';

// ─── localStorage mock ──────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] || null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// ─── Language Preference ────────────────────────────────────────────────────

describe('loadLanguagePreference', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should return "auto" when nothing saved', () => {
    expect(loadLanguagePreference()).toBe('auto');
  });

  it('should return "es" when saved', () => {
    localStorageMock.setItem('vina-language-pref', 'es');
    expect(loadLanguagePreference()).toBe('es');
  });

  it('should return "en" when saved', () => {
    localStorageMock.setItem('vina-language-pref', 'en');
    expect(loadLanguagePreference()).toBe('en');
  });

  it('should return "auto" when saved', () => {
    localStorageMock.setItem('vina-language-pref', 'auto');
    expect(loadLanguagePreference()).toBe('auto');
  });

  it('should return "auto" for invalid value', () => {
    localStorageMock.setItem('vina-language-pref', 'fr');
    expect(loadLanguagePreference()).toBe('auto');
  });

  it('should return "auto" for empty string', () => {
    localStorageMock.setItem('vina-language-pref', '');
    expect(loadLanguagePreference()).toBe('auto');
  });
});

describe('saveLanguagePreference', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should save "es"', () => {
    saveLanguagePreference('es');
    expect(localStorageMock.getItem('vina-language-pref')).toBe('es');
  });

  it('should save "en"', () => {
    saveLanguagePreference('en');
    expect(localStorageMock.getItem('vina-language-pref')).toBe('en');
  });

  it('should save "auto"', () => {
    saveLanguagePreference('auto');
    expect(localStorageMock.getItem('vina-language-pref')).toBe('auto');
  });

  it('should round-trip correctly', () => {
    saveLanguagePreference('es');
    expect(loadLanguagePreference()).toBe('es');

    saveLanguagePreference('en');
    expect(loadLanguagePreference()).toBe('en');

    saveLanguagePreference('auto');
    expect(loadLanguagePreference()).toBe('auto');
  });
});
