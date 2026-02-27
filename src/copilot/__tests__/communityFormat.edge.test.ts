/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Extended edge-case tests for communityFormat.
 *
 * Covers: export/import round-trip fidelity, import with missing required fields,
 * schema version mismatch, very large skills, validatePatternSkill edge cases.
 */
import { describe, it, expect } from 'vitest';
import {
  exportSkill,
  importSkill,
  validateCommunitySkill,
  communitySkillToJSON,
  communitySkillFromJSON,
  COMMUNITY_SKILL_SCHEMA_VERSION,
} from '../skills/communityFormat';
import type { CommunitySkill, CommunitySkillMetadata } from '../skills/communityFormat';
import type { PatternSkill } from '../skills/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function validSkill(): PatternSkill {
  return {
    name: 'test-bodice',
    triggers: ['test-bodice', 'test bodice'],
    description: 'A test bodice skill',
    methods: [{
      name: 'TestMethod',
      origin: 'US',
      description: 'A test drafting method',
      formulas: { width: 'chest / 4' },
    }],
    formulas: {
      width: {
        name: 'Width',
        expression: 'chest / 4',
        description: 'Quarter chest',
        variables: ['chest'],
        unit: 'cm',
      },
    },
    easeTable: {
      woven: { chest: 4, waist: 2 },
    },
    constructionSteps: [
      { order: 1, instruction: 'Draw the center line', toolCalls: ['createPiece'] },
      { order: 2, instruction: 'Mark measurements', toolCalls: [] },
    ],
  };
}

function validMetadata(): CommunitySkillMetadata {
  return {
    id: 'com.test.bodice-skill',
    name: 'Test Bodice',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A community bodice skill',
    tags: ['bodice', 'basic', 'test'],
    license: 'MIT',
  };
}

function validCommunitySkill(): CommunitySkill {
  return {
    schemaVersion: COMMUNITY_SKILL_SCHEMA_VERSION,
    metadata: validMetadata(),
    skill: validSkill(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('communityFormat — edge cases', () => {
  describe('export/import round-trip fidelity', () => {
    it('should preserve all fields through export and import', () => {
      const original = validCommunitySkill();
      const json = exportSkill(original.skill, original.metadata, { downloads: 100, rating: 4.5, reviewCount: 20 });
      const imported = importSkill(json);

      // Metadata fidelity
      expect(imported.metadata.id).toBe(original.metadata.id);
      expect(imported.metadata.name).toBe(original.metadata.name);
      expect(imported.metadata.version).toBe(original.metadata.version);
      expect(imported.metadata.author).toBe(original.metadata.author);
      expect(imported.metadata.description).toBe(original.metadata.description);
      expect(imported.metadata.tags).toEqual(original.metadata.tags);
      expect(imported.metadata.license).toBe(original.metadata.license);

      // Skill fidelity
      expect(imported.skill.name).toBe(original.skill.name);
      expect(imported.skill.triggers).toEqual(original.skill.triggers);
      expect(imported.skill.description).toBe(original.skill.description);
      expect(imported.skill.methods).toEqual(original.skill.methods);
      expect(imported.skill.formulas).toEqual(original.skill.formulas);
      expect(imported.skill.easeTable).toEqual(original.skill.easeTable);
      expect(imported.skill.constructionSteps).toEqual(original.skill.constructionSteps);

      // Stats fidelity
      expect(imported.stats?.downloads).toBe(100);
      expect(imported.stats?.rating).toBe(4.5);
      expect(imported.stats?.reviewCount).toBe(20);

      // Schema version
      expect(imported.schemaVersion).toBe(COMMUNITY_SKILL_SCHEMA_VERSION);
    });

    it('should preserve round-trip through communitySkillToJSON/communitySkillFromJSON', () => {
      const original = validCommunitySkill();
      const json = communitySkillToJSON(original);
      const restored = communitySkillFromJSON(json);

      expect(restored).toEqual(original);
    });
  });

  describe('import valid JSON with missing required fields', () => {
    it('should reject JSON missing metadata fields', () => {
      const partial = {
        schemaVersion: COMMUNITY_SKILL_SCHEMA_VERSION,
        metadata: { id: 'x' }, // missing name, version, author, etc.
        skill: validSkill(),
      };
      expect(() => importSkill(JSON.stringify(partial))).toThrow('Invalid community skill');
    });

    it('should reject JSON missing skill fields', () => {
      const partial = {
        schemaVersion: COMMUNITY_SKILL_SCHEMA_VERSION,
        metadata: validMetadata(),
        skill: { name: 'x' }, // missing triggers, methods, etc.
      };
      expect(() => importSkill(JSON.stringify(partial))).toThrow('Invalid community skill');
    });

    it('should reject JSON with empty metadata.tags (not an array)', () => {
      const bad = {
        schemaVersion: COMMUNITY_SKILL_SCHEMA_VERSION,
        metadata: { ...validMetadata(), tags: 'not-array' },
        skill: validSkill(),
      };
      expect(() => importSkill(JSON.stringify(bad))).toThrow('Invalid community skill');
    });
  });

  describe('validateCommunitySkill — additional edge cases', () => {
    it('should reject skill with empty methods array', () => {
      const cs = validCommunitySkill();
      cs.skill.methods = [];
      const result = validateCommunitySkill(cs);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least one drafting method'))).toBe(true);
    });

    it('should reject skill with empty constructionSteps', () => {
      const cs = validCommunitySkill();
      cs.skill.constructionSteps = [];
      const result = validateCommunitySkill(cs);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('constructionSteps'))).toBe(true);
    });

    it('should reject method without required fields', () => {
      const cs = validCommunitySkill();
      cs.skill.methods = [{ name: '', origin: '', description: '', formulas: {} }];
      const result = validateCommunitySkill(cs);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Method'))).toBe(true);
    });

    it('should reject construction step without order', () => {
      const cs = validCommunitySkill();
      cs.skill.constructionSteps = [
        { order: undefined as unknown as number, instruction: 'step', toolCalls: [] },
      ];
      const result = validateCommunitySkill(cs);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('ConstructionStep'))).toBe(true);
    });

    it('should reject construction step without instruction', () => {
      const cs = validCommunitySkill();
      cs.skill.constructionSteps = [
        { order: 1, instruction: '', toolCalls: [] },
      ];
      const result = validateCommunitySkill(cs);
      expect(result.valid).toBe(false);
    });

    it('should reject skill with non-object formulas', () => {
      const cs = validCommunitySkill();
      cs.skill.formulas = null as unknown as Record<string, any>;
      const result = validateCommunitySkill(cs);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('formulas'))).toBe(true);
    });

    it('should reject skill with non-object easeTable', () => {
      const cs = validCommunitySkill();
      cs.skill.easeTable = null as unknown as Record<string, any>;
      const result = validateCommunitySkill(cs);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('easeTable'))).toBe(true);
    });

    it('should warn on negative stats rating', () => {
      const cs = validCommunitySkill();
      cs.stats = { rating: -1 };
      const result = validateCommunitySkill(cs);
      expect(result.warnings.some(w => w.includes('rating'))).toBe(true);
    });

    it('should accept stats with only downloads', () => {
      const cs = validCommunitySkill();
      cs.stats = { downloads: 1000 };
      const result = validateCommunitySkill(cs);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('very large skill', () => {
    it('should handle a skill with many formulas and steps', () => {
      const largeSkill = validSkill();

      // Add 50 formulas
      for (let i = 0; i < 50; i++) {
        largeSkill.formulas[`formula_${i}`] = {
          name: `Formula ${i}`,
          expression: `chest / ${i + 1}`,
          description: `Formula number ${i}`,
          variables: ['chest'],
          unit: 'cm',
        };
      }

      // Add 100 construction steps
      largeSkill.constructionSteps = [];
      for (let i = 1; i <= 100; i++) {
        largeSkill.constructionSteps.push({
          order: i,
          instruction: `Step ${i}: Perform action ${i}`,
          toolCalls: ['createPiece'],
        });
      }

      const json = exportSkill(largeSkill, validMetadata());
      const imported = importSkill(json);
      expect(Object.keys(imported.skill.formulas).length).toBe(50 + 1); // 50 + original 'width'
      expect(imported.skill.constructionSteps.length).toBe(100);
    });
  });

  describe('importSkill — malformed JSON variations', () => {
    it('should throw on empty string', () => {
      expect(() => importSkill('')).toThrow('Invalid JSON');
    });

    it('should throw on array JSON', () => {
      expect(() => importSkill('[]')).toThrow('Invalid community skill');
    });

    it('should throw on number JSON', () => {
      expect(() => importSkill('42')).toThrow('Invalid community skill');
    });

    it('should throw on string JSON', () => {
      expect(() => importSkill('"hello"')).toThrow('Invalid community skill');
    });
  });

  describe('exportSkill — validation', () => {
    it('should throw when metadata is invalid', () => {
      const badMeta = { ...validMetadata(), id: '' };
      expect(() => exportSkill(validSkill(), badMeta)).toThrow();
    });

    it('should throw when skill has no triggers', () => {
      const badSkill = { ...validSkill(), triggers: [] };
      expect(() => exportSkill(badSkill, validMetadata())).toThrow();
    });

    it('should include stats in export when provided', () => {
      const json = exportSkill(validSkill(), validMetadata(), { downloads: 10 });
      const parsed = JSON.parse(json);
      expect(parsed.stats.downloads).toBe(10);
    });
  });
});
