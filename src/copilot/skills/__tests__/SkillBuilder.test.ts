/**
 * Tests for SkillBuilder class.
 */
import { describe, it, expect } from 'vitest';
import { SkillBuilder } from '../SkillBuilder';
import type { ConstructionState } from '../../../types/construction';

const MOCK_CONSTRUCTION: ConstructionState = {
  points: [
    {
      id: 'p1',
      label: 'A',
      x: 0,
      y: 0,
      definition: { type: 'absolute', x: 0, y: 0 },
      visible: true,
    },
    {
      id: 'p2',
      label: 'B',
      x: 100,
      y: 0,
      definition: { type: 'endLine', basePoint: 'p1', angle: 0, length: 100 },
      visible: true,
    },
    {
      id: 'p3',
      label: 'C',
      x: 100,
      y: 100,
      definition: { type: 'alongLine', from: 'p1', to: 'p2', length: 50 },
      visible: true,
    },
  ],
  lines: [
    { id: 'l1', label: 'AB', from: 'p1', to: 'p2', style: 'solid', visible: true },
  ],
  curves: [
    {
      id: 'c1',
      label: 'curve1',
      definition: { type: 'spline', from: 'p1', to: 'p3', angle1: 45, angle2: 135, length1: 20, length2: 20 },
      visible: true,
    },
  ],
  pieces: [
    {
      id: 'piece1',
      name: 'Front',
      nodes: [
        { pointId: 'p1', connection: 'line' },
        { pointId: 'p2', connection: 'line' },
        { pointId: 'p3', connection: 'line' },
      ],
      seamAllowance: 10,
      closed: true,
    },
  ],
  variables: { ease: 2, chest_quarter: 'chest/4' },
  selectedEntity: null,
  showConstruction: true,
  pieceIdentityMap: {},
};

describe('SkillBuilder', () => {
  describe('fromConstruction', () => {
    it('extracts points from construction state', () => {
      const builder = new SkillBuilder().fromConstruction(MOCK_CONSTRUCTION);
      const preview = builder.getPreview();

      expect(preview.stepCount).toBe(5); // 3 points + 1 line + 1 curve
      expect(preview.pieceCount).toBe(1);
    });

    it('extracts formulas from variables', () => {
      const builder = new SkillBuilder().fromConstruction(MOCK_CONSTRUCTION);
      const preview = builder.getPreview();

      expect(preview.formulaCount).toBeGreaterThan(0);
    });
  });

  describe('withMetadata', () => {
    it('sets skill metadata', () => {
      const builder = new SkillBuilder()
        .fromConstruction(MOCK_CONSTRUCTION)
        .withMetadata({ name: 'Test Skill', author: 'Tester' });

      const skill = builder.build();

      expect(skill.metadata.name).toBe('Test Skill');
      expect(skill.metadata.author).toBe('Tester');
    });

    it('merges metadata incrementally', () => {
      const builder = new SkillBuilder()
        .fromConstruction(MOCK_CONSTRUCTION)
        .withMetadata({ name: 'Test Skill' })
        .withMetadata({ author: 'Tester' });

      const skill = builder.build();

      expect(skill.metadata.name).toBe('Test Skill');
      expect(skill.metadata.author).toBe('Tester');
    });
  });

  describe('build', () => {
    it('auto-generates triggers from name if not set', () => {
      const builder = new SkillBuilder()
        .fromConstruction(MOCK_CONSTRUCTION)
        .withMetadata({ name: 'Bodice Block', author: 'Test' });

      const skill = builder.build();

      expect(skill.skill.triggers).toContain('bodice block');
    });

    it('returns valid CommunitySkill', () => {
      const builder = new SkillBuilder()
        .fromConstruction(MOCK_CONSTRUCTION)
        .withMetadata({
          name: 'Test Skill',
          author: 'Tester',
          description: 'A test skill',
        });

      const skill = builder.build();

      expect(skill.schemaVersion).toBe('1.0.0');
      expect(skill.skill.constructionSteps.length).toBeGreaterThan(0);
      expect(skill.metadata.id).toBe('local:test-skill');
    });

    it('generates NL instructions for points', () => {
      const builder = new SkillBuilder()
        .fromConstruction(MOCK_CONSTRUCTION)
        .withMetadata({ name: 'Test', author: 'Tester' });

      const skill = builder.build();
      const instructions = skill.skill.constructionSteps.map(s => s.instruction);

      expect(instructions[0]).toContain('Mark point A');
      expect(instructions[1]).toContain('From point');
      expect(instructions[1]).toContain('create point B');
    });
  });

  describe('getPreview', () => {
    it('returns correct counts', () => {
      const builder = new SkillBuilder().fromConstruction(MOCK_CONSTRUCTION);
      const preview = builder.getPreview();

      expect(preview.stepCount).toBe(5);
      expect(preview.pieceCount).toBe(1);
      expect(preview.formulaCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('validate', () => {
    it('returns error if name is missing', () => {
      const builder = new SkillBuilder()
        .fromConstruction(MOCK_CONSTRUCTION)
        .withMetadata({ author: 'Test' });

      const validation = builder.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Name is required');
    });

    it('returns error if author is missing', () => {
      const builder = new SkillBuilder()
        .fromConstruction(MOCK_CONSTRUCTION)
        .withMetadata({ name: 'Test' });

      const validation = builder.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Author is required');
    });

    it('returns valid for complete builder', () => {
      const builder = new SkillBuilder()
        .fromConstruction(MOCK_CONSTRUCTION)
        .withMetadata({ name: 'Test', author: 'Tester' });

      const validation = builder.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('generateTriggers', () => {
    it('generates bilingual triggers', () => {
      const builder = new SkillBuilder()
        .fromConstruction(MOCK_CONSTRUCTION)
        .withMetadata({ name: 'Bodice Block', author: 'Test' })
        .generateTriggers('bodice block');

      const skill = builder.build();

      expect(skill.skill.triggers).toContain('bodice block');
      expect(skill.skill.triggers.some(t => t.includes('corpiño'))).toBe(true);
    });
  });
});
