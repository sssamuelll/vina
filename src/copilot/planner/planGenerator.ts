/**
 * Plan Generator — Creates execution plans from user requests.
 *
 * Analyzes user intent and generates appropriate multi-step plans
 * using templates and pattern knowledge.
 *
 * @module planGenerator
 */

import type { CopilotAction } from '../actions/actionTypes';
import {
  type CopilotPlan,
  type PlanStep,
  type PlanTemplate,
  createPlan,
  generateStepId,
} from './planTypes';

// ============================================================================
// Built-in Plan Templates
// ============================================================================

/**
 * Templates for common garment creation tasks.
 */
export const PLAN_TEMPLATES: PlanTemplate[] = [
  // === T-Shirt / Basic Top ===
  {
    id: 'tshirt-basic',
    name: 'Basic T-Shirt',
    description: 'Create a basic t-shirt pattern with front, back, and sleeves',
    keywords: ['t-shirt', 'tshirt', 'tee', 'top', 'camiseta', 'playera'],
    category: 'tops',
    complexity: 'moderate',
    requiredInputs: [],
    steps: [
      {
        stepNumber: 1,
        description: 'Create front bodice',
        details: 'Generate front bodice piece using measurements',
        actions: [
          { action: 'create_piece', shape: 'from_blueprint', params: { blueprintId: 'aldrich-bodice-front' } } as CopilotAction,
        ],
        dependsOn: [],
        optional: false,
        category: 'creation',
      },
      {
        stepNumber: 2,
        description: 'Create back bodice',
        details: 'Generate back bodice piece using measurements',
        actions: [
          { action: 'create_piece', shape: 'from_blueprint', params: { blueprintId: 'aldrich-bodice-back' } } as CopilotAction,
        ],
        dependsOn: [],
        optional: false,
        category: 'creation',
      },
      {
        stepNumber: 3,
        description: 'Create sleeve',
        details: 'Generate sleeve piece calculated from armhole',
        actions: [
          { action: 'create_piece', shape: 'from_blueprint', params: { blueprintId: 'aldrich-sleeve' } } as CopilotAction,
        ],
        dependsOn: [],
        optional: false,
        category: 'creation',
      },
      {
        stepNumber: 4,
        description: 'Add shoulder seams',
        details: 'Connect front and back at shoulder',
        actions: [
          { action: 'auto_detect_seams', pieceIds: ['front-bodice', 'back-bodice'] } as CopilotAction,
        ],
        dependsOn: [],
        optional: false,
        category: 'assembly',
      },
      {
        stepNumber: 5,
        description: 'Add side seams',
        details: 'Connect front and back at sides',
        actions: [],
        dependsOn: [],
        optional: false,
        category: 'assembly',
      },
      {
        stepNumber: 6,
        description: 'Add sleeve seams',
        details: 'Connect sleeve to armhole',
        actions: [],
        dependsOn: [],
        optional: false,
        category: 'assembly',
      },
    ],
  },

  // === Skirt ===
  {
    id: 'skirt-basic',
    name: 'Basic Skirt',
    description: 'Create a basic A-line skirt pattern',
    keywords: ['skirt', 'falda', 'a-line'],
    category: 'bottoms',
    complexity: 'simple',
    requiredInputs: [
      { key: 'length', label: 'Skirt Length', type: 'number', required: true, description: 'Length in cm' },
    ],
    steps: [
      {
        stepNumber: 1,
        description: 'Create front skirt panel',
        actions: [
          { action: 'create_piece', shape: 'rectangle', params: { name: 'Front Skirt', width: 300, height: 600 } } as CopilotAction,
        ],
        dependsOn: [],
        optional: false,
        category: 'creation',
      },
      {
        stepNumber: 2,
        description: 'Create back skirt panel',
        actions: [
          { action: 'create_piece', shape: 'rectangle', params: { name: 'Back Skirt', width: 300, height: 600 } } as CopilotAction,
        ],
        dependsOn: [],
        optional: false,
        category: 'creation',
      },
      {
        stepNumber: 3,
        description: 'Add waist darts',
        details: 'Add darts for waist shaping',
        actions: [],
        dependsOn: [],
        optional: true,
        category: 'shaping',
      },
      {
        stepNumber: 4,
        description: 'Add side seams',
        actions: [],
        dependsOn: [],
        optional: false,
        category: 'assembly',
      },
    ],
  },

  // === Bodice Block ===
  {
    id: 'bodice-block',
    name: 'Bodice Block',
    description: 'Create a basic bodice block pattern',
    keywords: ['bodice', 'block', 'sloper', 'base', 'corpiño', 'bloque'],
    category: 'blocks',
    complexity: 'moderate',
    requiredInputs: [],
    steps: [
      {
        stepNumber: 1,
        description: 'Create front bodice block',
        actions: [
          { action: 'create_piece', shape: 'from_blueprint', params: { blueprintId: 'aldrich-bodice-front' } } as CopilotAction,
        ],
        dependsOn: [],
        optional: false,
        category: 'creation',
      },
      {
        stepNumber: 2,
        description: 'Create back bodice block',
        actions: [
          { action: 'create_piece', shape: 'from_blueprint', params: { blueprintId: 'aldrich-bodice-back' } } as CopilotAction,
        ],
        dependsOn: [],
        optional: false,
        category: 'creation',
      },
      {
        stepNumber: 3,
        description: 'Verify fit with simulation',
        details: 'Run simulation to check fit',
        actions: [
          { action: 'start_simulation' } as CopilotAction,
        ],
        dependsOn: [],
        optional: true,
        category: 'verification',
      },
    ],
  },

  // === Collar ===
  {
    id: 'collar-peter-pan',
    name: 'Peter Pan Collar',
    description: 'Create a Peter Pan collar for an existing neckline',
    keywords: ['collar', 'peter pan', 'cuello', 'neckline'],
    category: 'details',
    complexity: 'moderate',
    requiredInputs: [
      { key: 'necklinePieceId', label: 'Neckline Piece', type: 'text', required: true },
    ],
    steps: [
      {
        stepNumber: 1,
        description: 'Measure neckline',
        actions: [
          { action: 'measure_edge', pieceId: '{{necklinePieceId}}', edgeIndex: 0 } as unknown as CopilotAction,
        ],
        dependsOn: [],
        optional: false,
        category: 'measurement',
      },
      {
        stepNumber: 2,
        description: 'Create collar stand',
        details: 'Create the collar stand piece',
        actions: [],
        dependsOn: [],
        optional: false,
        category: 'creation',
      },
      {
        stepNumber: 3,
        description: 'Create collar fall',
        details: 'Create the visible collar piece',
        actions: [],
        dependsOn: [],
        optional: false,
        category: 'creation',
      },
      {
        stepNumber: 4,
        description: 'Attach collar to neckline',
        actions: [],
        dependsOn: [],
        optional: false,
        category: 'assembly',
      },
    ],
  },
];

// ============================================================================
// Plan Generator
// ============================================================================

/**
 * Options for plan generation.
 */
export interface PlanGenerationOptions {
  /** Include verification steps (simulation, measurement) */
  includeVerification: boolean;
  /** Include optional shaping steps (darts, ease) */
  includeShaping: boolean;
  /** Auto-detect seams after piece creation */
  autoDetectSeams: boolean;
}

const DEFAULT_OPTIONS: PlanGenerationOptions = {
  includeVerification: true,
  includeShaping: true,
  autoDetectSeams: true,
};

/**
 * Find matching templates for a user request.
 */
export function findMatchingTemplates(userRequest: string): PlanTemplate[] {
  const normalized = userRequest.toLowerCase();

  return PLAN_TEMPLATES.filter(template => {
    // Check keywords
    return template.keywords.some(keyword =>
      normalized.includes(keyword.toLowerCase())
    );
  }).sort((a, b) => {
    // Sort by specificity (more keywords matched = more specific)
    const aMatches = a.keywords.filter(k => normalized.includes(k.toLowerCase())).length;
    const bMatches = b.keywords.filter(k => normalized.includes(k.toLowerCase())).length;
    return bMatches - aMatches;
  });
}

/**
 * Generate a plan from a template.
 */
export function generatePlanFromTemplate(
  template: PlanTemplate,
  inputs: Record<string, unknown>,
  userRequest: string,
  options: Partial<PlanGenerationOptions> = {}
): CopilotPlan {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Filter steps based on options
  let steps = template.steps.filter(step => {
    if (!opts.includeVerification && step.category === 'verification') return false;
    if (!opts.includeShaping && step.category === 'shaping') return false;
    return true;
  });

  // Apply input substitutions to actions
  steps = steps.map(step => ({
    ...step,
    actions: step.actions.map(action =>
      substituteInputs(action, inputs)
    ),
  }));

  return createPlan(
    template.name,
    template.description,
    userRequest,
    steps
  );
}

/**
 * Substitute template inputs into action parameters.
 */
function substituteInputs(
  action: CopilotAction,
  inputs: Record<string, unknown>
): CopilotAction {
  const actionStr = JSON.stringify(action);
  let substituted = actionStr;

  for (const [key, value] of Object.entries(inputs)) {
    const placeholder = `{{${key}}}`;
    substituted = substituted.replace(
      new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'),
      JSON.stringify(value).slice(1, -1) // Remove quotes from string values
    );
  }

  return JSON.parse(substituted);
}

/**
 * Generate a custom plan from a list of actions.
 */
export function generateCustomPlan(
  title: string,
  actions: CopilotAction[],
  userRequest: string
): CopilotPlan {
  const steps: Omit<PlanStep, 'id' | 'status'>[] = actions.map((action, index) => ({
    stepNumber: index + 1,
    description: formatActionDescription(action),
    actions: [action],
    dependsOn: [],
    optional: false,
  }));

  return createPlan(title, `Execute ${actions.length} action(s)`, userRequest, steps);
}

/**
 * Format an action as a human-readable description.
 */
function formatActionDescription(action: CopilotAction): string {
  const actionName = action.action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  switch (action.action) {
    case 'select_piece':
      return `Select piece "${(action as { pieceId: string }).pieceId}"`;
    case 'create_piece':
      return `Create new piece`;
    case 'delete_piece':
      return `Delete piece "${(action as { pieceId: string }).pieceId}"`;
    case 'start_simulation':
      return 'Start simulation';
    case 'stop_simulation':
      return 'Stop simulation';
    case 'auto_detect_seams':
      return 'Auto-detect and create seams';
    default:
      return actionName;
  }
}

/**
 * Analyze a user request and generate an appropriate plan.
 */
export function analyzePlanRequest(
  userRequest: string,
  options: Partial<PlanGenerationOptions> = {}
): {
  templates: PlanTemplate[];
  suggestedPlan: CopilotPlan | null;
  requiresInput: boolean;
  missingInputs: string[];
} {
  const templates = findMatchingTemplates(userRequest);

  if (templates.length === 0) {
    return {
      templates: [],
      suggestedPlan: null,
      requiresInput: false,
      missingInputs: [],
    };
  }

  const bestTemplate = templates[0];
  const requiredInputs = bestTemplate.requiredInputs.filter(i => i.required);
  const missingInputs = requiredInputs.map(i => i.key);

  // If no required inputs, generate the plan
  if (missingInputs.length === 0) {
    const suggestedPlan = generatePlanFromTemplate(bestTemplate, {}, userRequest, options);
    return {
      templates,
      suggestedPlan,
      requiresInput: false,
      missingInputs: [],
    };
  }

  return {
    templates,
    suggestedPlan: null,
    requiresInput: true,
    missingInputs,
  };
}

// ============================================================================
// Index Export
// ============================================================================

export { PLAN_TEMPLATES as templates };
