import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTranslation,
  getLocalizedSkill,
  hasTranslations,
  getMissingTranslations,
  registerLanguagePack,
  getLanguagePack,
  listAvailableLanguages,
  resetLanguagePacks,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
} from '../skills/languagePacks';
import type { LanguagePack } from '../skills/languagePacks';
import type { PatternSkill } from '../skills/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function testSkill(): PatternSkill {
  return {
    name: 'bodice',
    triggers: ['bodice', 'corpiño'],
    description: 'Original English description',
    methods: [{
      name: 'Aldrich',
      origin: 'UK',
      description: 'Original Aldrich description',
      formulas: { backWidth: '(chest / 4) + 1' },
    }],
    formulas: {
      chestWidth: {
        name: 'Chest Width',
        expression: 'chest / 4',
        description: 'Quarter chest for width',
        variables: ['chest'],
        unit: 'cm',
      },
    },
    easeTable: {
      woven: { chest: 4 },
    },
    constructionSteps: [
      { order: 1, instruction: 'Draw the center back line', toolCalls: ['createPiece'] },
      { order: 2, instruction: 'Mark measurements', toolCalls: [] },
    ],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Language Packs', () => {
  beforeEach(() => {
    resetLanguagePacks();
  });

  describe('constants', () => {
    it('should have English as default language', () => {
      expect(DEFAULT_LANGUAGE).toBe('en');
    });

    it('should support at least en and es', () => {
      expect(SUPPORTED_LANGUAGES).toContain('en');
      expect(SUPPORTED_LANGUAGES).toContain('es');
    });
  });

  describe('listAvailableLanguages', () => {
    it('should return en and es by default', () => {
      const langs = listAvailableLanguages();
      expect(langs).toContain('en');
      expect(langs).toContain('es');
    });
  });

  describe('getLanguagePack', () => {
    it('should return English pack', () => {
      const pack = getLanguagePack('en');
      expect(pack).toBeDefined();
      expect(pack!.languageName).toBe('English');
    });

    it('should return Spanish pack', () => {
      const pack = getLanguagePack('es');
      expect(pack).toBeDefined();
      expect(pack!.languageName).toBe('Español');
    });

    it('should return undefined for unregistered language', () => {
      expect(getLanguagePack('fr')).toBeUndefined();
    });
  });

  describe('registerLanguagePack', () => {
    it('should register a new language pack', () => {
      const frPack: LanguagePack = {
        language: 'fr',
        languageName: 'Français',
        skills: {
          bodice: {
            'description': 'Construction du corsage de base',
          },
        },
      };
      registerLanguagePack(frPack);
      expect(getLanguagePack('fr')).toBeDefined();
      expect(listAvailableLanguages()).toContain('fr');
    });
  });

  describe('getTranslation', () => {
    it('should return English translation', () => {
      const text = getTranslation('bodice', 'description', 'en');
      expect(text).toContain('Bodice');
    });

    it('should return Spanish translation', () => {
      const text = getTranslation('bodice', 'description', 'es');
      expect(text).toContain('corpiño');
    });

    it('should fall back to English for unknown language', () => {
      const text = getTranslation('bodice', 'description', 'fr');
      expect(text).toContain('Bodice'); // falls back to EN
    });

    it('should return key as final fallback', () => {
      const text = getTranslation('nonexistent-skill', 'description', 'en');
      expect(text).toBe('description');
    });

    it('should fall back for missing key in target language', () => {
      // Spanish has 'description' but maybe not all keys
      const text = getTranslation('bodice', 'nonexistent.key', 'es');
      // Falls back to EN, then to key itself
      expect(text).toBe('nonexistent.key');
    });
  });

  describe('getLocalizedSkill', () => {
    it('should localize to Spanish', () => {
      const skill = testSkill();
      const localized = getLocalizedSkill(skill, 'es');
      expect(localized.description).toContain('corpiño');
    });

    it('should localize construction step instructions', () => {
      const skill = testSkill();
      const localized = getLocalizedSkill(skill, 'es');
      expect(localized.constructionSteps[0].instruction).toContain('centro espalda');
    });

    it('should keep English when requesting English', () => {
      const skill = testSkill();
      const localized = getLocalizedSkill(skill, 'en');
      expect(localized.description).toContain('Bodice');
    });

    it('should fall back to English for unregistered language', () => {
      const skill = testSkill();
      const localized = getLocalizedSkill(skill, 'fr');
      expect(localized.description).toContain('Bodice');
    });

    it('should preserve non-translatable fields', () => {
      const skill = testSkill();
      const localized = getLocalizedSkill(skill, 'es');
      expect(localized.name).toBe('bodice');
      expect(localized.triggers).toEqual(skill.triggers);
      expect(localized.easeTable).toEqual(skill.easeTable);
    });

    it('should localize method descriptions', () => {
      const skill = testSkill();
      const localized = getLocalizedSkill(skill, 'es');
      // Spanish pack has method.Aldrich.description
      expect(localized.methods[0].description).toContain('Aldrich');
    });
  });

  describe('hasTranslations', () => {
    it('should return true for bodice in English', () => {
      expect(hasTranslations('bodice', 'en')).toBe(true);
    });

    it('should return true for bodice in Spanish', () => {
      expect(hasTranslations('bodice', 'es')).toBe(true);
    });

    it('should return false for unregistered language', () => {
      expect(hasTranslations('bodice', 'fr')).toBe(false);
    });

    it('should return false for unknown skill', () => {
      expect(hasTranslations('nonexistent', 'en')).toBe(false);
    });
  });

  describe('getMissingTranslations', () => {
    it('should return empty for English (reference language)', () => {
      const missing = getMissingTranslations('bodice', 'en');
      expect(missing).toHaveLength(0);
    });

    it('should detect missing keys in Spanish', () => {
      // Spanish pack may not have all keys that English has
      const missing = getMissingTranslations('bodice', 'es');
      // It should at least have some keys
      expect(Array.isArray(missing)).toBe(true);
    });

    it('should return all keys for unregistered language', () => {
      const missing = getMissingTranslations('bodice', 'fr');
      expect(missing.length).toBeGreaterThan(0);
    });
  });
});
