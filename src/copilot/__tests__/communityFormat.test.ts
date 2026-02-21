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

describe('validateCommunitySkill', () => {
  it('should validate a correct community skill', () => {
    const result = validateCommunitySkill(validCommunitySkill());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing metadata', () => {
    const cs = { ...validCommunitySkill(), metadata: undefined } as unknown as CommunitySkill;
    const result = validateCommunitySkill(cs);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('metadata'))).toBe(true);
  });

  it('should reject missing skill', () => {
    const cs = { ...validCommunitySkill(), skill: undefined } as unknown as CommunitySkill;
    const result = validateCommunitySkill(cs);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('skill'))).toBe(true);
  });

  it('should reject missing schemaVersion', () => {
    const cs = { ...validCommunitySkill(), schemaVersion: '' };
    const result = validateCommunitySkill(cs);
    expect(result.valid).toBe(false);
  });

  it('should warn on different schema version', () => {
    const cs = { ...validCommunitySkill(), schemaVersion: '2.0.0' };
    const result = validateCommunitySkill(cs);
    expect(result.valid).toBe(true); // warning, not error
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should reject metadata with missing fields', () => {
    const cs = validCommunitySkill();
    cs.metadata.id = '';
    cs.metadata.author = '';
    const result = validateCommunitySkill(cs);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('should validate stats if present', () => {
    const cs = validCommunitySkill();
    cs.stats = { rating: 4.5, downloads: 100, reviewCount: 10 };
    const result = validateCommunitySkill(cs);
    expect(result.valid).toBe(true);
  });

  it('should warn on out-of-range rating', () => {
    const cs = validCommunitySkill();
    cs.stats = { rating: 10 };
    const result = validateCommunitySkill(cs);
    expect(result.warnings.some(w => w.includes('rating'))).toBe(true);
  });
});

describe('exportSkill', () => {
  it('should serialize a skill to JSON string', () => {
    const json = exportSkill(validSkill(), validMetadata());
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(COMMUNITY_SKILL_SCHEMA_VERSION);
    expect(parsed.metadata.id).toBe('com.test.bodice-skill');
    expect(parsed.skill.name).toBe('test-bodice');
  });

  it('should include stats if provided', () => {
    const json = exportSkill(validSkill(), validMetadata(), { downloads: 42 });
    const parsed = JSON.parse(json);
    expect(parsed.stats.downloads).toBe(42);
  });

  it('should throw if skill is invalid', () => {
    const badSkill = { ...validSkill(), name: '', triggers: [] };
    expect(() => exportSkill(badSkill, validMetadata())).toThrow();
  });
});

describe('importSkill', () => {
  it('should parse a valid JSON string', () => {
    const json = exportSkill(validSkill(), validMetadata());
    const cs = importSkill(json);
    expect(cs.metadata.id).toBe('com.test.bodice-skill');
    expect(cs.skill.name).toBe('test-bodice');
  });

  it('should throw on invalid JSON', () => {
    expect(() => importSkill('not json')).toThrow('Invalid JSON');
  });

  it('should throw on invalid skill structure', () => {
    expect(() => importSkill('{}')).toThrow('Invalid community skill');
  });
});

describe('communitySkillToJSON / communitySkillFromJSON', () => {
  it('should round-trip a community skill', () => {
    const original = validCommunitySkill();
    const json = communitySkillToJSON(original);
    const restored = communitySkillFromJSON(json);
    expect(restored.metadata.id).toBe(original.metadata.id);
    expect(restored.skill.name).toBe(original.skill.name);
  });

  it('should throw on bad JSON', () => {
    expect(() => communitySkillFromJSON('{')).toThrow();
  });
});
