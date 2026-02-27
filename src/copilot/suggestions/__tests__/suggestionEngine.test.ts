/**
 * Tests for suggestionEngine
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateSuggestions,
  searchSuggestions,
  getSuggestionsByCategory,
  getQuickActions,
  type SuggestionContext,
} from '../suggestionEngine';
import { resetPreferenceManager } from '../../preferences/userPreferences';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('suggestionEngine', () => {
  beforeEach(() => {
    localStorageMock.clear();
    resetPreferenceManager();
  });

  describe('generateSuggestions', () => {
    it('should suggest templates for empty project', () => {
      const context: SuggestionContext = {
        selectedPieceIds: [],
        pieceCount: 0,
        seamCount: 0,
        isSimulating: false,
        recentActions: [],
        skillLevel: 'intermediate',
        isEmpty: true,
        hasBody: false,
      };

      const suggestions = generateSuggestions(context);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.type === 'template')).toBe(true);
    });

    it('should suggest seam actions when pieces selected', () => {
      const context: SuggestionContext = {
        selectedPieceIds: ['piece-1', 'piece-2'],
        pieceCount: 2,
        seamCount: 0,
        isSimulating: false,
        recentActions: [],
        skillLevel: 'intermediate',
        isEmpty: false,
        hasBody: false,
      };

      const suggestions = generateSuggestions(context);

      expect(suggestions.some(s => s.id === 'auto-seam')).toBe(true);
    });

    it('should suggest simulation when seams exist', () => {
      const context: SuggestionContext = {
        selectedPieceIds: [],
        pieceCount: 2,
        seamCount: 4,
        isSimulating: false,
        recentActions: [],
        skillLevel: 'intermediate',
        isEmpty: false,
        hasBody: false,
      };

      const suggestions = generateSuggestions(context);

      expect(suggestions.some(s => s.id === 'start-sim')).toBe(true);
    });

    it('should include knowledge tips for beginners', () => {
      const context: SuggestionContext = {
        selectedPieceIds: [],
        pieceCount: 0,
        seamCount: 0,
        isSimulating: false,
        recentActions: [],
        skillLevel: 'beginner',
        isEmpty: true,
        hasBody: false,
      };

      const suggestions = generateSuggestions(context, { includeKnowledge: true });

      expect(suggestions.some(s => s.type === 'knowledge')).toBe(true);
    });

    it('should include shortcuts for non-experts', () => {
      const context: SuggestionContext = {
        selectedPieceIds: [],
        pieceCount: 0,
        seamCount: 0,
        isSimulating: false,
        recentActions: [],
        skillLevel: 'intermediate',
        isEmpty: true,
        hasBody: false,
      };

      const suggestions = generateSuggestions(context, { includeShortcuts: true });

      expect(suggestions.some(s => s.type === 'shortcut')).toBe(true);
    });

    it('should filter by query', () => {
      const context: SuggestionContext = {
        selectedPieceIds: [],
        pieceCount: 0,
        seamCount: 0,
        isSimulating: false,
        recentActions: [],
        skillLevel: 'intermediate',
        isEmpty: true,
        hasBody: false,
        query: 'skirt',
      };

      const suggestions = generateSuggestions(context);

      expect(suggestions.every(s =>
        s.keywords.some(k => k.includes('skirt')) ||
        s.title.toLowerCase().includes('skirt') ||
        s.description.toLowerCase().includes('skirt')
      )).toBe(true);
    });

    it('should limit suggestions', () => {
      const context: SuggestionContext = {
        selectedPieceIds: [],
        pieceCount: 0,
        seamCount: 0,
        isSimulating: false,
        recentActions: [],
        skillLevel: 'beginner',
        isEmpty: true,
        hasBody: false,
      };

      const suggestions = generateSuggestions(context, { maxSuggestions: 3 });

      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should filter by confidence threshold', () => {
      const context: SuggestionContext = {
        selectedPieceIds: [],
        pieceCount: 0,
        seamCount: 0,
        isSimulating: false,
        recentActions: [],
        skillLevel: 'intermediate',
        isEmpty: true,
        hasBody: false,
      };

      const suggestions = generateSuggestions(context, { minConfidence: 0.8 });

      expect(suggestions.every(s => s.confidence >= 0.8)).toBe(true);
    });

    it('should sort by priority and confidence', () => {
      const context: SuggestionContext = {
        selectedPieceIds: [],
        pieceCount: 0,
        seamCount: 0,
        isSimulating: false,
        recentActions: [],
        skillLevel: 'intermediate',
        isEmpty: true,
        hasBody: false,
      };

      const suggestions = generateSuggestions(context, { minConfidence: 0 });

      // First suggestion should be high priority
      expect(suggestions[0].priority === 'high' || suggestions[0].confidence > 0.8).toBe(true);
    });
  });

  describe('searchSuggestions', () => {
    it('should find suggestions by keyword', () => {
      const suggestions = searchSuggestions('t-shirt');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.templateId === 'tshirt-basic')).toBe(true);
    });

    it('should find suggestions by partial match', () => {
      const suggestions = searchSuggestions('bod');

      expect(suggestions.some(s =>
        s.title.toLowerCase().includes('bodice') ||
        s.keywords.some(k => k.includes('bod'))
      )).toBe(true);
    });

    it('should return empty for no matches', () => {
      const suggestions = searchSuggestions('xyznonexistent');

      expect(suggestions).toHaveLength(0);
    });

    it('should return empty for empty query', () => {
      const suggestions = searchSuggestions('');

      expect(suggestions).toHaveLength(0);
    });

    it('should boost confidence for matches', () => {
      const suggestions = searchSuggestions('skirt');

      if (suggestions.length > 0) {
        expect(suggestions[0].confidence).toBeGreaterThan(0.5);
      }
    });

    it('should limit results', () => {
      const suggestions = searchSuggestions('create', { maxSuggestions: 2 });

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getSuggestionsByCategory', () => {
    it('should get suggestions by category', () => {
      const suggestions = getSuggestionsByCategory('getting-started');

      expect(suggestions.every(s => s.category === 'getting-started')).toBe(true);
    });

    it('should return empty for unknown category', () => {
      const suggestions = getSuggestionsByCategory('nonexistent');

      expect(suggestions).toHaveLength(0);
    });
  });

  describe('getQuickActions', () => {
    it('should return quick actions', () => {
      const actions = getQuickActions();

      expect(actions.length).toBeGreaterThan(0);
    });

    it('should include workflow actions', () => {
      const actions = getQuickActions();

      expect(actions.some(s => s.type === 'workflow')).toBe(true);
    });

    it('should limit results', () => {
      const actions = getQuickActions(3);

      expect(actions.length).toBeLessThanOrEqual(3);
    });
  });
});
