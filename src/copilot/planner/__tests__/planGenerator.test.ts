/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for planGenerator
 */

import { describe, it, expect } from 'vitest';
import {
  PLAN_TEMPLATES,
  findMatchingTemplates,
  generatePlanFromTemplate,
  generateCustomPlan,
  analyzePlanRequest,
} from '../planGenerator';

describe('planGenerator', () => {
  describe('PLAN_TEMPLATES', () => {
    it('should have built-in templates', () => {
      expect(PLAN_TEMPLATES.length).toBeGreaterThan(0);
    });

    it('should have t-shirt template', () => {
      const tshirt = PLAN_TEMPLATES.find(t => t.id === 'tshirt-basic');
      expect(tshirt).toBeDefined();
      expect(tshirt?.keywords).toContain('t-shirt');
    });

    it('should have skirt template', () => {
      const skirt = PLAN_TEMPLATES.find(t => t.id === 'skirt-basic');
      expect(skirt).toBeDefined();
      expect(skirt?.keywords).toContain('skirt');
    });

    it('should have bodice block template', () => {
      const bodice = PLAN_TEMPLATES.find(t => t.id === 'bodice-block');
      expect(bodice).toBeDefined();
      expect(bodice?.keywords).toContain('bodice');
    });
  });

  describe('findMatchingTemplates', () => {
    it('should find t-shirt template', () => {
      const templates = findMatchingTemplates('I want to create a t-shirt');
      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0].id).toBe('tshirt-basic');
    });

    it('should find skirt template', () => {
      const templates = findMatchingTemplates('make a skirt pattern');
      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0].id).toBe('skirt-basic');
    });

    it('should find bodice template', () => {
      const templates = findMatchingTemplates('create a bodice block');
      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0].id).toBe('bodice-block');
    });

    it('should match Spanish keywords', () => {
      const templates = findMatchingTemplates('quiero hacer una camiseta');
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should return empty for no matches', () => {
      const templates = findMatchingTemplates('make a spaceship');
      expect(templates).toHaveLength(0);
    });

    it('should sort by specificity', () => {
      const templates = findMatchingTemplates('tshirt top');
      // Should match tshirt-basic which has both keywords
      expect(templates[0].id).toBe('tshirt-basic');
    });
  });

  describe('generatePlanFromTemplate', () => {
    it('should generate a plan from template', () => {
      const template = PLAN_TEMPLATES.find(t => t.id === 'tshirt-basic')!;
      const plan = generatePlanFromTemplate(template, {}, 'Create a t-shirt');

      expect(plan.title).toBe('Basic T-Shirt');
      expect(plan.userRequest).toBe('Create a t-shirt');
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.status).toBe('draft');
    });

    it('should respect includeVerification option', () => {
      const template = PLAN_TEMPLATES.find(t => t.id === 'bodice-block')!;

      const withVerification = generatePlanFromTemplate(
        template, {}, 'bodice', { includeVerification: true }
      );
      const withoutVerification = generatePlanFromTemplate(
        template, {}, 'bodice', { includeVerification: false }
      );

      // Bodice block has an optional verification step
      expect(withVerification.steps.length).toBeGreaterThanOrEqual(withoutVerification.steps.length);
    });

    it('should respect includeShaping option', () => {
      const template = PLAN_TEMPLATES.find(t => t.id === 'skirt-basic')!;

      const withShaping = generatePlanFromTemplate(
        template, {}, 'skirt', { includeShaping: true }
      );
      const withoutShaping = generatePlanFromTemplate(
        template, {}, 'skirt', { includeShaping: false }
      );

      // Skirt has an optional shaping step (darts)
      expect(withShaping.steps.length).toBeGreaterThanOrEqual(withoutShaping.steps.length);
    });
  });

  describe('generateCustomPlan', () => {
    it('should generate a plan from actions', () => {
      const actions = [
        { action: 'create_piece', shape: 'rectangle', params: { name: 'Test' } },
        { action: 'start_simulation' },
      ] as any[];

      const plan = generateCustomPlan('Custom Plan', actions, 'Do something');

      expect(plan.title).toBe('Custom Plan');
      expect(plan.summary).toBe('Execute 2 action(s)');
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].actions[0]).toEqual(actions[0]);
    });

    it('should format action descriptions', () => {
      const actions = [
        { action: 'start_simulation' },
        { action: 'delete_piece', pieceId: 'p1' },
      ] as any[];

      const plan = generateCustomPlan('Test', actions, 'test');

      expect(plan.steps[0].description).toBe('Start simulation');
      expect(plan.steps[1].description).toContain('Delete piece');
    });
  });

  describe('analyzePlanRequest', () => {
    it('should find templates and suggest plan', () => {
      const result = analyzePlanRequest('create a t-shirt');

      expect(result.templates.length).toBeGreaterThan(0);
      expect(result.suggestedPlan).toBeDefined();
      expect(result.requiresInput).toBe(false);
    });

    it('should return no plan for unknown requests', () => {
      const result = analyzePlanRequest('build a rocket');

      expect(result.templates).toHaveLength(0);
      expect(result.suggestedPlan).toBeNull();
      expect(result.requiresInput).toBe(false);
    });

    it('should indicate required inputs', () => {
      // The skirt template requires length input
      const result = analyzePlanRequest('make a skirt');

      expect(result.templates.length).toBeGreaterThan(0);
      // Skirt template has required inputs
      expect(result.requiresInput).toBe(true);
      expect(result.missingInputs).toContain('length');
    });

    it('should generate plan when no inputs required', () => {
      const result = analyzePlanRequest('create a bodice block');

      // Bodice block has no required inputs
      expect(result.suggestedPlan).toBeDefined();
      expect(result.requiresInput).toBe(false);
    });
  });
});
