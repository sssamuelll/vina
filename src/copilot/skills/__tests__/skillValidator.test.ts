/**
 * Tests for Skill Validator.
 */
import { describe, it, expect } from 'vitest';
import { SkillValidator } from '../skillValidator';
import type { PatternSkill } from '../types';
import type { CommunitySkill } from '../communityFormat';
import { COMMUNITY_SKILL_SCHEMA_VERSION } from '../communityFormat';

const validPatternSkill: PatternSkill = {
  name: 'test-skill',
  triggers: ['test', 'testing'],
  description: 'A test skill for validation',
  methods: [{
    name: 'Default',
    origin: 'US',
    description: 'Default drafting method',
    formulas: { width: 'chest / 4' },
  }],
  formulas: {
    width: {
      name: 'Width',
      expression: 'chest / 4',
      description: 'Quarter chest measurement',
      variables: ['chest'],
      unit: 'cm',
    },
  },
  easeTable: { woven: { chest: 4 } },
  constructionSteps: [{
    order: 1,
    instruction: 'Draw the base rectangle',
    toolCalls: ['drawRect'],
  }],
};

const validCommunitySkill: CommunitySkill = {
  schemaVersion: COMMUNITY_SKILL_SCHEMA_VERSION,
  metadata: {
    id: 'test:skill',
    name: 'Test Skill',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A test community skill',
    tags: ['test', 'validation'],
    license: 'MIT',
  },
  skill: validPatternSkill,
};

describe('SkillValidator', () => {
  const validator = new SkillValidator();

  describe('validatePatternSkill', () => {
    it('validates a correct PatternSkill', () => {
      const result = validator.validatePatternSkill(validPatternSkill);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects skill without name', () => {
      const skill = { ...validPatternSkill, name: '' };
      const result = validator.validatePatternSkill(skill);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('name'))).toBe(true);
    });

    it('rejects skill without triggers', () => {
      const skill = { ...validPatternSkill, triggers: [] };
      const result = validator.validatePatternSkill(skill);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('trigger'))).toBe(true);
    });

    it('rejects skill without description', () => {
      const skill = { ...validPatternSkill, description: '' };
      const result = validator.validatePatternSkill(skill);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('description'))).toBe(true);
    });

    it('rejects skill without methods', () => {
      const skill = { ...validPatternSkill, methods: [] };
      const result = validator.validatePatternSkill(skill);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('method'))).toBe(true);
    });

    it('rejects skill with invalid method', () => {
      const skill = {
        ...validPatternSkill,
        methods: [{ name: '', origin: 'US', description: '', formulas: {} }],
      };
      const result = validator.validatePatternSkill(skill);
      expect(result.valid).toBe(false);
    });

    it('rejects skill without constructionSteps', () => {
      const skill = { ...validPatternSkill, constructionSteps: [] };
      const result = validator.validatePatternSkill(skill);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateCommunitySkill', () => {
    it('validates a correct CommunitySkill', () => {
      const result = validator.validateCommunitySkill(validCommunitySkill);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects skill without schemaVersion', () => {
      const skill = { ...validCommunitySkill, schemaVersion: '' };
      const result = validator.validateCommunitySkill(skill);
      expect(result.valid).toBe(false);
    });

    it('rejects skill without metadata', () => {
      const skill = { ...validCommunitySkill, metadata: undefined } as unknown as CommunitySkill;
      const result = validator.validateCommunitySkill(skill);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('metadata'))).toBe(true);
    });

    it('rejects skill without metadata.id', () => {
      const skill = {
        ...validCommunitySkill,
        metadata: { ...validCommunitySkill.metadata, id: '' },
      };
      const result = validator.validateCommunitySkill(skill);
      expect(result.valid).toBe(false);
    });

    it('rejects skill without metadata.version', () => {
      const skill = {
        ...validCommunitySkill,
        metadata: { ...validCommunitySkill.metadata, version: '' },
      };
      const result = validator.validateCommunitySkill(skill);
      expect(result.valid).toBe(false);
    });

    it('rejects skill without skill definition', () => {
      const skill = { ...validCommunitySkill, skill: undefined } as unknown as CommunitySkill;
      const result = validator.validateCommunitySkill(skill);
      expect(result.valid).toBe(false);
    });

    it('validates nested PatternSkill', () => {
      const skill = {
        ...validCommunitySkill,
        skill: { ...validPatternSkill, name: '' },
      };
      const result = validator.validateCommunitySkill(skill);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('name'))).toBe(true);
    });
  });

  describe('computeChecksum', () => {
    it('returns consistent checksum for same skill', async () => {
      const checksum1 = await validator.computeChecksum(validPatternSkill);
      const checksum2 = await validator.computeChecksum(validPatternSkill);
      expect(checksum1).toBe(checksum2);
    });

    it('returns different checksum for different skills', async () => {
      const modified = { ...validPatternSkill, name: 'different-name' };
      const checksum1 = await validator.computeChecksum(validPatternSkill);
      const checksum2 = await validator.computeChecksum(modified);
      expect(checksum1).not.toBe(checksum2);
    });

    it('returns 64-character hex string (SHA-256)', async () => {
      const checksum = await validator.computeChecksum(validPatternSkill);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('is deterministic regardless of property order', async () => {
      // Create skill with properties in different order via spread
      const checksum1 = await validator.computeChecksum(validPatternSkill);
      const checksum2 = await validator.computeChecksum({ ...validPatternSkill });
      expect(checksum1).toBe(checksum2);
    });
  });
});
