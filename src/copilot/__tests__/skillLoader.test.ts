import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { loadSkill, getRelevantSkills, buildSkillContext } from '../skills/skillLoader';
import { resetSkillRegistry, getDefaultSkillRegistry } from '../skills/skillRegistry';

describe('skillLoader', () => {
  beforeEach(async () => {
    await resetSkillRegistry();
    const registry = getDefaultSkillRegistry();
    await registry.initialize();
  });

  afterEach(async () => {
    await resetSkillRegistry();
  });

  describe('loadSkill', () => {
    it('should load bodice skill by name', () => {
      const skill = loadSkill('bodice');
      expect(skill).toBeDefined();
      expect(skill!.name).toBe('bodice');
    });

    it('should load sleeve skill by name', () => {
      const skill = loadSkill('sleeve');
      expect(skill).toBeDefined();
      expect(skill!.name).toBe('sleeve');
    });

    it('should load skirt skill by name', () => {
      const skill = loadSkill('skirt');
      expect(skill).toBeDefined();
      expect(skill!.name).toBe('skirt');
    });

    it('should load collar skill by name', () => {
      const skill = loadSkill('collar');
      expect(skill).toBeDefined();
      expect(skill!.name).toBe('collar');
    });

    it('should load grading skill by name', () => {
      const skill = loadSkill('grading');
      expect(skill).toBeDefined();
      expect(skill!.name).toBe('grading');
    });

    it('should return undefined for unknown skill', () => {
      const skill = loadSkill('unknown');
      expect(skill).toBeUndefined();
    });
  });

  describe('getRelevantSkills', () => {
    it('should match bodice skill from English message', () => {
      const skills = getRelevantSkills('Create a bodice block for me');
      expect(skills.length).toBeGreaterThanOrEqual(1);
      expect(skills[0].name).toBe('bodice');
    });

    it('should match bodice skill from Spanish message', () => {
      const skills = getRelevantSkills('Hazme un corpiño base talla 40');
      expect(skills.length).toBeGreaterThanOrEqual(1);
      expect(skills[0].name).toBe('bodice');
    });

    it('should match sleeve skill', () => {
      const skills = getRelevantSkills('Draft a set-in sleeve for the bodice');
      expect(skills.some(s => s.name === 'sleeve')).toBe(true);
    });

    it('should match skirt skill from Spanish', () => {
      const skills = getRelevantSkills('Necesito una falda recta');
      expect(skills.some(s => s.name === 'skirt')).toBe(true);
    });

    it('should match grading skill', () => {
      const skills = getRelevantSkills('Grade this pattern to all sizes');
      expect(skills.some(s => s.name === 'grading')).toBe(true);
    });

    it('should match collar skill from Spanish', () => {
      const skills = getRelevantSkills('Agrega un cuello camisero');
      expect(skills.some(s => s.name === 'collar')).toBe(true);
    });

    it('should match multiple skills when message mentions several', () => {
      const skills = getRelevantSkills('Create a bodice with collar and sleeve');
      expect(skills.length).toBeGreaterThanOrEqual(2);
      const names = skills.map(s => s.name);
      expect(names).toContain('bodice');
      expect(names).toContain('collar');
      expect(names).toContain('sleeve');
    });

    it('should return empty array for unrelated messages', () => {
      const skills = getRelevantSkills('Hello, how are you?');
      expect(skills).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const skills = getRelevantSkills('BODICE BLOCK');
      expect(skills.some(s => s.name === 'bodice')).toBe(true);
    });

    it('should match circle skirt trigger', () => {
      const skills = getRelevantSkills('Make a circle skirt');
      expect(skills.some(s => s.name === 'skirt')).toBe(true);
    });

    it('should match gradación trigger in Spanish', () => {
      const skills = getRelevantSkills('Necesito hacer la gradación de este patrón');
      expect(skills.some(s => s.name === 'grading')).toBe(true);
    });
  });

  describe('buildSkillContext', () => {
    it('should return empty string for no skills', () => {
      const context = buildSkillContext([]);
      expect(context).toBe('');
    });

    it('should include skill name in context', () => {
      const skill = loadSkill('bodice');
      expect(skill).toBeDefined();
      const context = buildSkillContext([skill!]);
      expect(context).toContain('BODICE');
    });

    it('should include formulas in context', () => {
      const skill = loadSkill('bodice');
      const context = buildSkillContext([skill!]);
      expect(context).toContain('backWidth');
      expect(context).toContain('frontWidth');
      expect(context).toContain('chest');
    });

    it('should include construction steps', () => {
      const skill = loadSkill('bodice');
      const context = buildSkillContext([skill!]);
      expect(context).toContain('Construction steps');
      expect(context).toContain('1.');
    });

    it('should include ease table', () => {
      const skill = loadSkill('bodice');
      const context = buildSkillContext([skill!]);
      expect(context).toContain('woven');
      expect(context).toContain('stretch');
    });

    it('should include method info', () => {
      const skill = loadSkill('bodice');
      const context = buildSkillContext([skill!]);
      expect(context).toContain('Aldrich');
      expect(context).toContain('Müller');
    });

    it('should handle multiple skills', () => {
      const bodice = loadSkill('bodice');
      const sleeve = loadSkill('sleeve');
      const context = buildSkillContext([bodice!, sleeve!]);
      expect(context).toContain('BODICE');
      expect(context).toContain('SLEEVE');
    });

    it('should include grade rules mention', () => {
      const skill = loadSkill('bodice');
      const context = buildSkillContext([skill!]);
      expect(context).toContain('Grade rules');
    });
  });
});
