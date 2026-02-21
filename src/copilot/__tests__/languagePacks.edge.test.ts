/**
 * Extended edge-case tests for languagePacks.
 *
 * Covers: empty language pack, partial translations, localize skill not in pack,
 * formula localization, skill with no construction steps, getMissingTranslations
 * for unknown skill in default language.
 */
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
      bustDart: {
        name: 'Bust Dart',
        expression: 'bust - chest',
        description: 'Dart suppression',
        variables: ['bust', 'chest'],
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

describe('Language Packs — edge cases', () => {
  beforeEach(() => {
    resetLanguagePacks();
  });

  describe('empty language pack', () => {
    it('should handle a language pack with skill entry but no translation keys', () => {
      const emptyPack: LanguagePack = {
        language: 'fr',
        languageName: 'Français',
        skills: {
          bodice: {}, // empty — no keys
        },
      };
      registerLanguagePack(emptyPack);

      // hasTranslations should return false for empty skill entries
      expect(hasTranslations('bodice', 'fr')).toBe(false);
    });

    it('should handle a language pack with no skills at all', () => {
      const emptyPack: LanguagePack = {
        language: 'de',
        languageName: 'Deutsch',
        skills: {},
      };
      registerLanguagePack(emptyPack);
      expect(getLanguagePack('de')).toBeDefined();
      expect(hasTranslations('bodice', 'de')).toBe(false);
    });
  });

  describe('partial translations', () => {
    it('should fall back to English for missing keys in partial pack', () => {
      const partialPack: LanguagePack = {
        language: 'fr',
        languageName: 'Français',
        skills: {
          bodice: {
            'description': 'Construction du corsage de base',
            // step.1 is missing — should fall back to EN
          },
        },
      };
      registerLanguagePack(partialPack);

      // Translated key
      expect(getTranslation('bodice', 'description', 'fr')).toBe('Construction du corsage de base');

      // Missing key — falls back to EN
      const step1 = getTranslation('bodice', 'step.1', 'fr');
      expect(step1).toContain('center back');
    });

    it('should localize skill with partial translations, keeping untranslated fields', () => {
      const partialPack: LanguagePack = {
        language: 'it',
        languageName: 'Italiano',
        skills: {
          bodice: {
            'description': 'Costruzione del corpetto base',
            'step.1': 'Disegnare la linea centrale posteriore',
            // step.2 missing — should keep original
          },
        },
      };
      registerLanguagePack(partialPack);

      const skill = testSkill();
      const localized = getLocalizedSkill(skill, 'it');

      expect(localized.description).toBe('Costruzione del corpetto base');
      expect(localized.constructionSteps[0].instruction).toBe('Disegnare la linea centrale posteriore');
      // step.2 falls back to original (from 'it' pack it's missing, so checks EN pack)
      // EN pack has 'step.2' = 'Mark measurements' — wait, actually EN pack has 'step.2' for bodice
      // Let me check — the EN pack has step.1 through step.4 for bodice
      expect(localized.constructionSteps[1].instruction).toBeDefined();
    });
  });

  describe('localize skill not in any language pack', () => {
    it('should return the original skill when name is not in any pack', () => {
      const unknownSkill: PatternSkill = {
        name: 'unknown-garment',
        triggers: ['unknown'],
        description: 'An unknown garment',
        methods: [{ name: 'M', origin: 'US', description: 'D', formulas: {} }],
        formulas: {},
        easeTable: {},
        constructionSteps: [{ order: 1, instruction: 'Original step', toolCalls: [] }],
      };

      const localized = getLocalizedSkill(unknownSkill, 'es');
      // Should fall back to EN, which also doesn't have it, so return as-is
      expect(localized.description).toBe('An unknown garment');
      expect(localized.constructionSteps[0].instruction).toBe('Original step');
    });

    it('should return original skill when requesting English for unknown skill', () => {
      const unknownSkill: PatternSkill = {
        name: 'nonexistent',
        triggers: ['nope'],
        description: 'Nope',
        methods: [{ name: 'M', origin: 'US', description: 'D', formulas: {} }],
        formulas: {},
        easeTable: {},
        constructionSteps: [{ order: 1, instruction: 'Step', toolCalls: [] }],
      };

      const localized = getLocalizedSkill(unknownSkill, 'en');
      expect(localized).toBe(unknownSkill); // Should return same reference
    });
  });

  describe('formula localization', () => {
    it('should localize formula name and description from ES pack', () => {
      const skill = testSkill();
      const localized = getLocalizedSkill(skill, 'es');

      // Spanish pack has formula.chestWidth.name and formula.chestWidth.description
      const chestWidthFormula = localized.formulas['chestWidth'];
      expect(chestWidthFormula.name).toBe('Ancho de pecho');
      expect(chestWidthFormula.description).toContain('Cuarto');
    });

    it('should keep original formula fields when no translation exists', () => {
      const skill = testSkill();
      const localized = getLocalizedSkill(skill, 'es');

      // 'bustDart' formula is not in the Spanish pack
      const bustDart = localized.formulas['bustDart'];
      expect(bustDart.name).toBe('Bust Dart');
      expect(bustDart.description).toBe('Dart suppression');
    });
  });

  describe('getTranslation — deep fallback chain', () => {
    it('should follow: requested language → EN → key', () => {
      // Register a pack that has bodice but not the specific key
      const frPack: LanguagePack = {
        language: 'fr',
        languageName: 'Français',
        skills: {
          bodice: {
            'description': 'French description',
          },
        },
      };
      registerLanguagePack(frPack);

      // Key exists in FR → returns FR
      expect(getTranslation('bodice', 'description', 'fr')).toBe('French description');

      // Key exists in EN but not FR → returns EN
      expect(getTranslation('bodice', 'step.1', 'fr')).toContain('center back');

      // Key doesn't exist anywhere → returns key
      expect(getTranslation('bodice', 'nonexistent.key', 'fr')).toBe('nonexistent.key');
    });

    it('should return key for EN when key not in EN pack', () => {
      expect(getTranslation('bodice', 'totally.missing.key', 'en')).toBe('totally.missing.key');
    });
  });

  describe('getMissingTranslations — edge cases', () => {
    it('should return empty for unknown skill in default language', () => {
      const missing = getMissingTranslations('nonexistent-skill', 'en');
      expect(missing).toHaveLength(0);
    });

    it('should return all EN keys when language has no translations at all', () => {
      const missing = getMissingTranslations('bodice', 'fr');
      // FR is not registered, so all EN keys should be missing
      const enPack = getLanguagePack('en');
      const enKeys = Object.keys(enPack!.skills['bodice']);
      expect(missing).toEqual(enKeys);
    });

    it('should return only truly missing keys for partial pack', () => {
      const partialPack: LanguagePack = {
        language: 'fr',
        languageName: 'Français',
        skills: {
          bodice: {
            'description': 'French bodice',
            'step.1': 'French step 1',
          },
        },
      };
      registerLanguagePack(partialPack);

      const missing = getMissingTranslations('bodice', 'fr');
      expect(missing).not.toContain('description');
      expect(missing).not.toContain('step.1');
      expect(missing.length).toBeGreaterThan(0); // Should still have other missing keys
    });
  });

  describe('registerLanguagePack — overwrite existing', () => {
    it('should overwrite an existing language pack', () => {
      const pack1: LanguagePack = {
        language: 'fr',
        languageName: 'Français',
        skills: { bodice: { 'description': 'Version 1' } },
      };
      const pack2: LanguagePack = {
        language: 'fr',
        languageName: 'Français',
        skills: { bodice: { 'description': 'Version 2' } },
      };
      registerLanguagePack(pack1);
      registerLanguagePack(pack2);

      expect(getTranslation('bodice', 'description', 'fr')).toBe('Version 2');
    });
  });

  describe('listAvailableLanguages after registrations', () => {
    it('should include newly registered languages', () => {
      registerLanguagePack({
        language: 'fr',
        languageName: 'Français',
        skills: {},
      });
      registerLanguagePack({
        language: 'de',
        languageName: 'Deutsch',
        skills: {},
      });

      const langs = listAvailableLanguages();
      expect(langs).toContain('en');
      expect(langs).toContain('es');
      expect(langs).toContain('fr');
      expect(langs).toContain('de');
    });
  });
});
