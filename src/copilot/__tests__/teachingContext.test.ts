import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTeachingSnippet,
  formatTeachingSnippet,
  isTeachingModeEnabled,
  setTeachingMode,
} from '../teachingContext';

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  get length() { return Object.keys(store).length; },
  key: (index: number) => Object.keys(store)[index] ?? null,
  clear: () => { for (const key of Object.keys(store)) delete store[key]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('teachingContext', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('isTeachingModeEnabled', () => {
    it('should default to true', () => {
      expect(isTeachingModeEnabled()).toBe(true);
    });

    it('should return false when explicitly disabled', () => {
      setTeachingMode(false);
      expect(isTeachingModeEnabled()).toBe(false);
    });

    it('should return true when enabled', () => {
      setTeachingMode(false);
      setTeachingMode(true);
      expect(isTeachingModeEnabled()).toBe(true);
    });
  });

  describe('getTeachingSnippet', () => {
    it('should return Spanish snippet for createPiece', () => {
      const snippet = getTeachingSnippet('createPiece', 'es');
      expect(snippet).not.toBeNull();
      expect(snippet!.title).toBe('Creación de pieza');
      expect(snippet!.explanation).toContain('pieza de patrón');
    });

    it('should return English snippet for createPiece', () => {
      const snippet = getTeachingSnippet('createPiece', 'en');
      expect(snippet).not.toBeNull();
      expect(snippet!.title).toBe('Piece Creation');
      expect(snippet!.explanation).toContain('pattern piece');
    });

    it('should return snippet for addDart', () => {
      const snippet = getTeachingSnippet('addDart', 'es');
      expect(snippet).not.toBeNull();
      expect(snippet!.title).toBe('Pinzas');
    });

    it('should return null for unknown tool', () => {
      expect(getTeachingSnippet('nonexistentTool', 'en')).toBeNull();
    });

    it('should return null when teaching mode is disabled', () => {
      setTeachingMode(false);
      expect(getTeachingSnippet('createPiece', 'en')).toBeNull();
    });

    it('should return snippet for setSeamAllowance', () => {
      const snippet = getTeachingSnippet('setSeamAllowance', 'en');
      expect(snippet).not.toBeNull();
      expect(snippet!.title).toBe('Seam Allowance');
    });
  });

  describe('formatTeachingSnippet', () => {
    it('should format a snippet with title and explanation', () => {
      const formatted = formatTeachingSnippet({
        title: 'Test Title',
        explanation: 'Test explanation text.',
      });
      expect(formatted).toContain('📚');
      expect(formatted).toContain('Test Title');
      expect(formatted).toContain('Test explanation text.');
    });

    it('should include tip when present', () => {
      const formatted = formatTeachingSnippet({
        title: 'Title',
        explanation: 'Explanation.',
        tip: 'A helpful tip.',
      });
      expect(formatted).toContain('💡');
      expect(formatted).toContain('A helpful tip.');
    });

    it('should not include tip line when absent', () => {
      const formatted = formatTeachingSnippet({
        title: 'Title',
        explanation: 'Explanation.',
      });
      expect(formatted).not.toContain('💡');
    });
  });
});
