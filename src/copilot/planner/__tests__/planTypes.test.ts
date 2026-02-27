/**
 * Tests for planTypes
 */

import { describe, it, expect } from 'vitest';
import {
  generatePlanId,
  generateStepId,
  createPlan,
  getNextPendingStep,
  areDependenciesMet,
  calculatePlanProgress,
  getPlanStats,
  type CopilotPlan,
  type PlanStep,
} from '../planTypes';

describe('planTypes', () => {
  describe('generatePlanId', () => {
    it('should generate unique plan IDs', () => {
      const id1 = generatePlanId();
      const id2 = generatePlanId();

      expect(id1).toMatch(/^plan-\d+-\d+$/);
      expect(id2).toMatch(/^plan-\d+-\d+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateStepId', () => {
    it('should generate unique step IDs', () => {
      const id1 = generateStepId();
      const id2 = generateStepId();

      expect(id1).toMatch(/^step-\d+-\d+$/);
      expect(id2).toMatch(/^step-\d+-\d+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createPlan', () => {
    it('should create a plan with steps', () => {
      const plan = createPlan(
        'Test Plan',
        'A test plan',
        'Create something',
        [
          { stepNumber: 1, description: 'Step 1', actions: [], dependsOn: [], optional: false },
          { stepNumber: 2, description: 'Step 2', actions: [], dependsOn: [], optional: true },
        ]
      );

      expect(plan.title).toBe('Test Plan');
      expect(plan.summary).toBe('A test plan');
      expect(plan.userRequest).toBe('Create something');
      expect(plan.steps).toHaveLength(2);
      expect(plan.status).toBe('draft');
      expect(plan.executionMode).toBe('all');
      expect(plan.currentStepIndex).toBe(0);
    });

    it('should assign IDs and status to steps', () => {
      const plan = createPlan('Plan', 'Summary', 'Request', [
        { stepNumber: 1, description: 'Step', actions: [], dependsOn: [], optional: false },
      ]);

      expect(plan.steps[0].id).toBeDefined();
      expect(plan.steps[0].status).toBe('pending');
    });
  });

  describe('getNextPendingStep', () => {
    it('should return the first pending step', () => {
      const plan: CopilotPlan = {
        id: 'plan-1',
        title: 'Test',
        summary: 'Test',
        userRequest: 'Test',
        steps: [
          { id: 's1', stepNumber: 1, description: 'Step 1', actions: [], dependsOn: [], status: 'completed', optional: false },
          { id: 's2', stepNumber: 2, description: 'Step 2', actions: [], dependsOn: [], status: 'pending', optional: false },
          { id: 's3', stepNumber: 3, description: 'Step 3', actions: [], dependsOn: [], status: 'pending', optional: false },
        ],
        status: 'running',
        executionMode: 'all',
        currentStepIndex: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };

      const nextStep = getNextPendingStep(plan);
      expect(nextStep?.id).toBe('s2');
    });

    it('should return null if no pending steps', () => {
      const plan: CopilotPlan = {
        id: 'plan-1',
        title: 'Test',
        summary: 'Test',
        userRequest: 'Test',
        steps: [
          { id: 's1', stepNumber: 1, description: 'Step 1', actions: [], dependsOn: [], status: 'completed', optional: false },
        ],
        status: 'completed',
        executionMode: 'all',
        currentStepIndex: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };

      expect(getNextPendingStep(plan)).toBeNull();
    });
  });

  describe('areDependenciesMet', () => {
    it('should return true if no dependencies', () => {
      const step: PlanStep = {
        id: 's1',
        stepNumber: 1,
        description: 'Step 1',
        actions: [],
        dependsOn: [],
        status: 'pending',
        optional: false,
      };

      const plan: CopilotPlan = {
        id: 'plan-1',
        title: 'Test',
        summary: 'Test',
        userRequest: 'Test',
        steps: [step],
        status: 'draft',
        executionMode: 'all',
        currentStepIndex: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };

      expect(areDependenciesMet(plan, step)).toBe(true);
    });

    it('should return true if all dependencies completed', () => {
      const plan: CopilotPlan = {
        id: 'plan-1',
        title: 'Test',
        summary: 'Test',
        userRequest: 'Test',
        steps: [
          { id: 's1', stepNumber: 1, description: 'Step 1', actions: [], dependsOn: [], status: 'completed', optional: false },
          { id: 's2', stepNumber: 2, description: 'Step 2', actions: [], dependsOn: ['s1'], status: 'pending', optional: false },
        ],
        status: 'running',
        executionMode: 'all',
        currentStepIndex: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };

      expect(areDependenciesMet(plan, plan.steps[1])).toBe(true);
    });

    it('should return true if dependencies skipped', () => {
      const plan: CopilotPlan = {
        id: 'plan-1',
        title: 'Test',
        summary: 'Test',
        userRequest: 'Test',
        steps: [
          { id: 's1', stepNumber: 1, description: 'Step 1', actions: [], dependsOn: [], status: 'skipped', optional: true },
          { id: 's2', stepNumber: 2, description: 'Step 2', actions: [], dependsOn: ['s1'], status: 'pending', optional: false },
        ],
        status: 'running',
        executionMode: 'all',
        currentStepIndex: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };

      expect(areDependenciesMet(plan, plan.steps[1])).toBe(true);
    });

    it('should return false if dependencies not met', () => {
      const plan: CopilotPlan = {
        id: 'plan-1',
        title: 'Test',
        summary: 'Test',
        userRequest: 'Test',
        steps: [
          { id: 's1', stepNumber: 1, description: 'Step 1', actions: [], dependsOn: [], status: 'pending', optional: false },
          { id: 's2', stepNumber: 2, description: 'Step 2', actions: [], dependsOn: ['s1'], status: 'pending', optional: false },
        ],
        status: 'draft',
        executionMode: 'all',
        currentStepIndex: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };

      expect(areDependenciesMet(plan, plan.steps[1])).toBe(false);
    });
  });

  describe('calculatePlanProgress', () => {
    it('should return 0 for empty plan', () => {
      const plan: CopilotPlan = {
        id: 'plan-1',
        title: 'Test',
        summary: 'Test',
        userRequest: 'Test',
        steps: [],
        status: 'draft',
        executionMode: 'all',
        currentStepIndex: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };

      expect(calculatePlanProgress(plan)).toBe(0);
    });

    it('should calculate progress correctly', () => {
      const plan: CopilotPlan = {
        id: 'plan-1',
        title: 'Test',
        summary: 'Test',
        userRequest: 'Test',
        steps: [
          { id: 's1', stepNumber: 1, description: 'Step 1', actions: [], dependsOn: [], status: 'completed', optional: false },
          { id: 's2', stepNumber: 2, description: 'Step 2', actions: [], dependsOn: [], status: 'completed', optional: false },
          { id: 's3', stepNumber: 3, description: 'Step 3', actions: [], dependsOn: [], status: 'pending', optional: false },
          { id: 's4', stepNumber: 4, description: 'Step 4', actions: [], dependsOn: [], status: 'pending', optional: false },
        ],
        status: 'running',
        executionMode: 'all',
        currentStepIndex: 2,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };

      expect(calculatePlanProgress(plan)).toBe(50);
    });

    it('should count skipped as progress', () => {
      const plan: CopilotPlan = {
        id: 'plan-1',
        title: 'Test',
        summary: 'Test',
        userRequest: 'Test',
        steps: [
          { id: 's1', stepNumber: 1, description: 'Step 1', actions: [], dependsOn: [], status: 'completed', optional: false },
          { id: 's2', stepNumber: 2, description: 'Step 2', actions: [], dependsOn: [], status: 'skipped', optional: true },
          { id: 's3', stepNumber: 3, description: 'Step 3', actions: [], dependsOn: [], status: 'pending', optional: false },
        ],
        status: 'running',
        executionMode: 'all',
        currentStepIndex: 2,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };

      expect(calculatePlanProgress(plan)).toBe(67);
    });
  });

  describe('getPlanStats', () => {
    it('should count steps by status', () => {
      const plan: CopilotPlan = {
        id: 'plan-1',
        title: 'Test',
        summary: 'Test',
        userRequest: 'Test',
        steps: [
          { id: 's1', stepNumber: 1, description: 'Step 1', actions: [], dependsOn: [], status: 'completed', optional: false },
          { id: 's2', stepNumber: 2, description: 'Step 2', actions: [], dependsOn: [], status: 'completed', optional: false },
          { id: 's3', stepNumber: 3, description: 'Step 3', actions: [], dependsOn: [], status: 'running', optional: false },
          { id: 's4', stepNumber: 4, description: 'Step 4', actions: [], dependsOn: [], status: 'pending', optional: false },
          { id: 's5', stepNumber: 5, description: 'Step 5', actions: [], dependsOn: [], status: 'skipped', optional: true },
          { id: 's6', stepNumber: 6, description: 'Step 6', actions: [], dependsOn: [], status: 'failed', optional: false },
        ],
        status: 'running',
        executionMode: 'all',
        currentStepIndex: 2,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };

      const stats = getPlanStats(plan);

      expect(stats.total).toBe(6);
      expect(stats.completed).toBe(2);
      expect(stats.running).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });
});
