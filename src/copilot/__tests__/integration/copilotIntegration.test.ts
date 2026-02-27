/**
 * Copilot Integration Tests
 *
 * These tests verify that all copilot modules work together correctly.
 * They catch:
 * - Missing module imports
 * - Incompatible interfaces between modules
 * - State shape mismatches
 * - Missing exports
 *
 * @module copilotIntegration.test
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================================
// Module Imports - All copilot modules must be importable
// ============================================================================

// Phase 6 modules
import * as actions from '../../actions';
import * as planner from '../../planner';
import * as knowledge from '../../knowledge';
import * as preferences from '../../preferences';
import * as suggestions from '../../suggestions';

// Action types needed for cross-module verification
import type { CopilotAction } from '../../actions/actionTypes';
import type { PlanStep } from '../../planner/planTypes';

// ============================================================================
// Test 1: Module Import Validation
// ============================================================================

describe('Module Import Validation', () => {
  describe('actions module', () => {
    it('exports CopilotActionExecutor class', () => {
      expect(actions.CopilotActionExecutor).toBeDefined();
      expect(typeof actions.CopilotActionExecutor).toBe('function');
    });

    it('exports createActionExecutor factory', () => {
      expect(actions.createActionExecutor).toBeDefined();
      expect(typeof actions.createActionExecutor).toBe('function');
    });
  });

  describe('planner module', () => {
    it('exports PlanExecutor class', () => {
      expect(planner.PlanExecutor).toBeDefined();
      expect(typeof planner.PlanExecutor).toBe('function');
    });

    it('exports createPlanExecutor factory', () => {
      expect(planner.createPlanExecutor).toBeDefined();
      expect(typeof planner.createPlanExecutor).toBe('function');
    });

    it('exports plan creation helpers', () => {
      expect(planner.createPlan).toBeDefined();
      expect(planner.generatePlanId).toBeDefined();
      expect(planner.generateStepId).toBeDefined();
    });

    it('exports plan analysis functions', () => {
      expect(planner.getNextPendingStep).toBeDefined();
      expect(planner.areDependenciesMet).toBeDefined();
      expect(planner.calculatePlanProgress).toBeDefined();
      expect(planner.getPlanStats).toBeDefined();
    });

    it('exports template functions', () => {
      expect(planner.PLAN_TEMPLATES).toBeDefined();
      expect(planner.templates).toBeDefined();
      expect(planner.findMatchingTemplates).toBeDefined();
      expect(planner.generatePlanFromTemplate).toBeDefined();
      expect(planner.generateCustomPlan).toBeDefined();
      expect(planner.analyzePlanRequest).toBeDefined();
    });
  });

  describe('knowledge module', () => {
    it('exports ease standards', () => {
      expect(knowledge.EASE_STANDARDS).toBeDefined();
      expect(knowledge.getRecommendedEase).toBeDefined();
    });

    it('exports seam allowances', () => {
      expect(knowledge.SEAM_ALLOWANCES).toBeDefined();
      expect(knowledge.getRecommendedSeamAllowance).toBeDefined();
    });

    it('exports grading rules', () => {
      expect(knowledge.GRADING_RULES).toBeDefined();
      expect(knowledge.calculateGradedMeasurement).toBeDefined();
    });

    it('exports fabric properties', () => {
      expect(knowledge.FABRIC_PROPERTIES).toBeDefined();
      expect(knowledge.getFabricEaseAdjustment).toBeDefined();
    });

    it('exports construction techniques', () => {
      expect(knowledge.CONSTRUCTION_TECHNIQUES).toBeDefined();
    });

    it('exports industry standards', () => {
      expect(knowledge.INDUSTRY_STANDARDS).toBeDefined();
    });

    it('exports queryKnowledge function', () => {
      expect(knowledge.queryKnowledge).toBeDefined();
      expect(typeof knowledge.queryKnowledge).toBe('function');
    });
  });

  describe('preferences module', () => {
    it('exports PreferenceManager class', () => {
      expect(preferences.PreferenceManager).toBeDefined();
      expect(typeof preferences.PreferenceManager).toBe('function');
    });

    it('exports getPreferenceManager singleton', () => {
      expect(preferences.getPreferenceManager).toBeDefined();
      expect(typeof preferences.getPreferenceManager).toBe('function');
    });

    it('exports default preferences', () => {
      expect(preferences.DEFAULT_PATTERN_PREFERENCES).toBeDefined();
      expect(preferences.DEFAULT_UI_PREFERENCES).toBeDefined();
      expect(preferences.DEFAULT_USAGE_STATS).toBeDefined();
      expect(preferences.createDefaultPreferences).toBeDefined();
    });

    it('exports usePreferences hook', () => {
      expect(preferences.usePreferences).toBeDefined();
      expect(typeof preferences.usePreferences).toBe('function');
    });
  });

  describe('suggestions module', () => {
    it('exports buildSuggestionContext function', () => {
      expect(suggestions.buildSuggestionContext).toBeDefined();
      expect(typeof suggestions.buildSuggestionContext).toBe('function');
    });

    it('exports generateSuggestions function', () => {
      expect(suggestions.generateSuggestions).toBeDefined();
      expect(typeof suggestions.generateSuggestions).toBe('function');
    });

    it('exports search and filter functions', () => {
      expect(suggestions.searchSuggestions).toBeDefined();
      expect(suggestions.getSuggestionsByCategory).toBeDefined();
      expect(suggestions.getQuickActions).toBeDefined();
    });
  });
});

// ============================================================================
// Test 2: Cross-Module Compatibility
// ============================================================================

describe('Cross-Module Compatibility', () => {
  describe('planner uses actions module', () => {
    it('PlanStep can contain CopilotAction array', () => {
      // Create a mock action
      const action: CopilotAction = {
        action: 'create_piece',
        shape: 'rectangle',
        params: {
          width: 100,
          height: 50,
        },
      };

      // Create a plan step with the action
      const step: Omit<PlanStep, 'id' | 'status'> = {
        stepNumber: 1,
        description: 'Create a piece',
        actions: [action],
        dependsOn: [],
        optional: false,
      };

      // Verify the action is correctly typed
      expect(step.actions).toHaveLength(1);
      expect(step.actions[0].action).toBe('create_piece');
    });

    it('createPlan generates valid plan with actions', () => {
      const action: CopilotAction = {
        action: 'select_piece',
        pieceId: 'test-piece-1',
      };

      const plan = planner.createPlan(
        'Test Plan',
        'A test plan for integration',
        'Create something',
        [
          {
            stepNumber: 1,
            description: 'Select a piece',
            actions: [action],
            dependsOn: [],
            optional: false,
          },
        ]
      );

      expect(plan.id).toMatch(/^plan-/);
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].actions[0]).toEqual(action);
      expect(plan.status).toBe('draft');
    });
  });

  describe('suggestions uses preferences module', () => {
    beforeEach(() => {
      // Reset preference manager before each test
      preferences.resetPreferenceManager();
    });

    it('PreferenceManager can be accessed from suggestions context', () => {
      const prefManager = preferences.getPreferenceManager();
      expect(prefManager).toBeDefined();
      expect(prefManager.getPreferences).toBeDefined();
    });

    it('preference skill level matches suggestion context type', () => {
      const prefManager = preferences.getPreferenceManager();
      const prefs = prefManager.getPreferences();

      // The skill level from preferences should be compatible with SuggestionContext
      const validSkillLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
      expect(validSkillLevels).toContain(prefs.skillLevel);
    });
  });

  describe('suggestions uses planner templates', () => {
    it('PLAN_TEMPLATES is accessible', () => {
      const templates = planner.PLAN_TEMPLATES;
      expect(templates).toBeDefined();
      expect(Array.isArray(templates)).toBe(true);
    });

    it('templates have required fields for suggestions', () => {
      const templates = planner.PLAN_TEMPLATES;

      for (const template of templates) {
        expect(template.id).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.keywords).toBeDefined();
        expect(Array.isArray(template.keywords)).toBe(true);
      }
    });
  });

  describe('knowledge module is standalone', () => {
    it('can query knowledge without other modules', () => {
      const result = knowledge.queryKnowledge({
        topic: 'ease',
        garmentType: 'shirt',
      });

      expect(result).toBeDefined();
    });

    it('can get ease recommendations', () => {
      const ease = knowledge.getRecommendedEase('bust', 'standard');
      expect(ease).toBeDefined();
      expect(typeof ease).toBe('number');
    });

    it('can get seam allowance recommendations', () => {
      const allowance = knowledge.getRecommendedSeamAllowance('general');
      expect(allowance).toBeDefined();
      expect(typeof allowance).toBe('number');
    });
  });
});

// ============================================================================
// Test 3: Store State Shape Compatibility
// ============================================================================

describe('Store State Shape Compatibility', () => {
  /**
   * Mock RootState that matches the actual store structure.
   * This ensures suggestion engine accesses correct paths.
   */
  const createMockState = () => ({
    project: {
      pieces: [],
      seams: [],
      measurements: {},
      internalLines: [],
      name: 'Test Project',
      grainlines: [],
      notches: [],
    },
    editor: {
      selectedPieceIds: [],
      activeTool: 'select',
      viewMode: '2d',
    },
    simulation: {
      simulationState: 'idle' as const,
      bodyCollision: false,
      windEnabled: false,
    },
    plugins: {
      plugins: [],
      loadedPlugins: [],
    },
    layout: {
      panelSizes: {},
    },
    marker: {
      markers: [],
    },
    avatar: {},
    avatarTape: {},
    tools: {},
    parametric: {},
    construction: {},
    blueprints: {
      blueprints: [],
    },
  });

  it('buildSuggestionContext accesses correct state paths', () => {
    const mockState = createMockState();

    // This should NOT throw - it verifies state paths are correct
    const context = suggestions.buildSuggestionContext(mockState as never);

    expect(context).toBeDefined();
    expect(context.selectedPieceIds).toEqual([]);
    expect(context.pieceCount).toBe(0);
    expect(context.seamCount).toBe(0);
    expect(context.isSimulating).toBe(false);
    expect(context.currentTool).toBe('select');
    expect(context.isEmpty).toBe(true);
    expect(context.hasBody).toBe(false);
  });

  it('buildSuggestionContext handles pieces and seams', () => {
    // Create a fresh state with pieces and seams
    const mockState = {
      ...createMockState(),
      project: {
        ...createMockState().project,
        pieces: [{ id: 'piece-1' }, { id: 'piece-2' }],
        seams: [{ id: 'seam-1' }],
      },
      editor: {
        ...createMockState().editor,
        selectedPieceIds: ['piece-1'],
      },
    };

    const context = suggestions.buildSuggestionContext(mockState as never);

    expect(context.pieceCount).toBe(2);
    expect(context.seamCount).toBe(1);
    expect(context.selectedPieceIds).toEqual(['piece-1']);
    expect(context.isEmpty).toBe(false);
  });

  it('buildSuggestionContext handles simulation state', () => {
    // Create a fresh state with simulation running
    const mockState = {
      ...createMockState(),
      simulation: {
        simulationState: 'running' as const,
        bodyCollision: true,
        windEnabled: false,
      },
    };

    const context = suggestions.buildSuggestionContext(mockState as never);

    expect(context.isSimulating).toBe(true);
    expect(context.hasBody).toBe(true);
  });

  it('buildSuggestionContext handles missing optional state', () => {
    // Minimal state - should not throw
    const minimalState = {
      project: null,
      editor: null,
      simulation: null,
    };

    const context = suggestions.buildSuggestionContext(minimalState as never);

    expect(context).toBeDefined();
    expect(context.selectedPieceIds).toEqual([]);
    expect(context.pieceCount).toBe(0);
    expect(context.isSimulating).toBe(false);
  });
});

// ============================================================================
// Test 4: Plan Helper Functions
// ============================================================================

describe('Plan Helper Functions', () => {
  it('createPlan generates unique IDs', () => {
    const plan1 = planner.createPlan('Plan 1', 'Summary', 'Request', []);
    const plan2 = planner.createPlan('Plan 2', 'Summary', 'Request', []);

    expect(plan1.id).not.toBe(plan2.id);
  });

  it('getNextPendingStep finds pending steps', () => {
    const plan = planner.createPlan('Test', 'Summary', 'Request', [
      { stepNumber: 1, description: 'Step 1', actions: [], dependsOn: [], optional: false },
      { stepNumber: 2, description: 'Step 2', actions: [], dependsOn: [], optional: false },
    ]);

    const next = planner.getNextPendingStep(plan);
    expect(next).toBeDefined();
    expect(next?.stepNumber).toBe(1);
  });

  it('calculatePlanProgress returns correct percentage', () => {
    const plan = planner.createPlan('Test', 'Summary', 'Request', [
      { stepNumber: 1, description: 'Step 1', actions: [], dependsOn: [], optional: false },
      { stepNumber: 2, description: 'Step 2', actions: [], dependsOn: [], optional: false },
    ]);

    // All pending = 0%
    expect(planner.calculatePlanProgress(plan)).toBe(0);

    // Mark one complete
    plan.steps[0].status = 'completed';
    expect(planner.calculatePlanProgress(plan)).toBe(50);

    // Mark both complete
    plan.steps[1].status = 'completed';
    expect(planner.calculatePlanProgress(plan)).toBe(100);
  });

  it('getPlanStats returns correct counts', () => {
    const plan = planner.createPlan('Test', 'Summary', 'Request', [
      { stepNumber: 1, description: 'Step 1', actions: [], dependsOn: [], optional: false },
      { stepNumber: 2, description: 'Step 2', actions: [], dependsOn: [], optional: false },
      { stepNumber: 3, description: 'Step 3', actions: [], dependsOn: [], optional: false },
    ]);

    plan.steps[0].status = 'completed';
    plan.steps[1].status = 'running';
    // step 2 remains pending

    const stats = planner.getPlanStats(plan);

    expect(stats.total).toBe(3);
    expect(stats.completed).toBe(1);
    expect(stats.running).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.failed).toBe(0);
    expect(stats.skipped).toBe(0);
  });

  it('areDependenciesMet checks dependencies correctly', () => {
    const plan = planner.createPlan('Test', 'Summary', 'Request', [
      { stepNumber: 1, description: 'Step 1', actions: [], dependsOn: [], optional: false },
      { stepNumber: 2, description: 'Step 2', actions: [], dependsOn: [], optional: false },
    ]);

    // Add dependency: step 2 depends on step 1
    plan.steps[1].dependsOn = [plan.steps[0].id];

    // Step 1 pending - step 2 should not be ready
    expect(planner.areDependenciesMet(plan, plan.steps[1])).toBe(false);

    // Complete step 1 - step 2 should be ready
    plan.steps[0].status = 'completed';
    expect(planner.areDependenciesMet(plan, plan.steps[1])).toBe(true);
  });
});

// ============================================================================
// Test 5: Suggestion Generation
// ============================================================================

describe('Suggestion Generation', () => {
  beforeEach(() => {
    preferences.resetPreferenceManager();
  });

  it('generateSuggestions returns array', () => {
    const context: suggestions.SuggestionContext = {
      selectedPieceIds: [],
      pieceCount: 0,
      seamCount: 0,
      isSimulating: false,
      currentTool: 'select',
      recentActions: [],
      skillLevel: 'beginner',
      isEmpty: true,
      hasBody: false,
    };

    const result = suggestions.generateSuggestions(context);

    expect(Array.isArray(result)).toBe(true);
  });

  it('getQuickActions returns quick action suggestions', () => {
    // getQuickActions takes an optional limit parameter (default 10)
    const quickActions = suggestions.getQuickActions(5);

    expect(Array.isArray(quickActions)).toBe(true);
    expect(quickActions.length).toBeLessThanOrEqual(5);
  });

  it('searchSuggestions filters by query', () => {
    // searchSuggestions takes a query string and optional options
    const filtered = suggestions.searchSuggestions('create');

    expect(Array.isArray(filtered)).toBe(true);
    // All filtered results should have 'create' in title, description, or keywords
    for (const s of filtered) {
      const matchesTitle = s.title.toLowerCase().includes('create');
      const matchesDesc = s.description.toLowerCase().includes('create');
      const matchesKeywords = s.keywords.some(k => k.toLowerCase().includes('create'));
      expect(matchesTitle || matchesDesc || matchesKeywords).toBe(true);
    }
  });
});

// ============================================================================
// Test 6: Action Executor
// ============================================================================

describe('Action Executor', () => {
  it('can instantiate CopilotActionExecutor', () => {
    const mockDispatch = () => {};
    const mockGetState = () => ({
      project: { pieces: [] },
    });

    const executor = new actions.CopilotActionExecutor(
      mockDispatch as never,
      mockGetState as never
    );

    expect(executor).toBeDefined();
  });

  it('createActionExecutor returns executor instance', () => {
    const mockDispatch = () => {};
    const mockGetState = () => ({
      project: { pieces: [] },
    });

    const executor = actions.createActionExecutor(
      mockDispatch as never,
      mockGetState as never
    );

    expect(executor).toBeInstanceOf(actions.CopilotActionExecutor);
  });

  it('executor can execute actions', async () => {
    const mockDispatch = () => {};
    const mockGetState = () => ({
      project: { pieces: [{ id: 'piece-1' }] },
    });

    const executor = actions.createActionExecutor(
      mockDispatch as never,
      mockGetState as never
    );

    const result = await executor.execute({
      action: 'select_piece',
      pieceId: 'piece-1',
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('executor handles unknown actions gracefully', async () => {
    const mockDispatch = () => {};
    const mockGetState = () => ({});

    const executor = actions.createActionExecutor(
      mockDispatch as never,
      mockGetState as never
    );

    const result = await executor.execute({
      action: 'unknown_action' as never,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not implemented');
  });

  it('executor can execute multiple actions', async () => {
    const mockDispatch = () => {};
    const mockGetState = () => ({
      project: { pieces: [], seams: [] },
      editor: { selectedPieceIds: [] },
    });

    const executor = actions.createActionExecutor(
      mockDispatch as never,
      mockGetState as never
    );

    const results = await executor.executeBatch([
      { action: 'clear_selection' },
      { action: 'start_simulation' },
    ]);

    expect(results.results).toHaveLength(2);
    expect(results.succeeded).toBe(2);
    expect(results.failed).toBe(0);
  });
});

// ============================================================================
// Test 7: Knowledge Query System
// ============================================================================

describe('Knowledge Query System', () => {
  it('can query ease standards', () => {
    const result = knowledge.queryKnowledge({
      topic: 'ease',
    });

    expect(result).toBeDefined();
  });

  it('can query fabric properties', () => {
    const result = knowledge.queryKnowledge({
      topic: 'fabric',
      fabricType: 'cotton',
    });

    expect(result).toBeDefined();
  });

  it('EASE_STANDARDS has expected structure', () => {
    expect(knowledge.EASE_STANDARDS).toBeDefined();
    expect(typeof knowledge.EASE_STANDARDS).toBe('object');
  });

  it('FABRIC_PROPERTIES has expected structure', () => {
    expect(knowledge.FABRIC_PROPERTIES).toBeDefined();
    expect(typeof knowledge.FABRIC_PROPERTIES).toBe('object');
  });

  it('GRADING_RULES has expected structure', () => {
    expect(knowledge.GRADING_RULES).toBeDefined();
    expect(typeof knowledge.GRADING_RULES).toBe('object');
  });
});
