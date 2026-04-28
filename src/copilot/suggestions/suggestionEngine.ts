/**
 * Suggestion Engine — Provides intelligent suggestions to users.
 *
 * Generates suggestions based on:
 * - Current context (selected pieces, active tools)
 * - User history and preferences
 * - Pattern knowledge base
 * - Common workflows
 *
 * @module suggestionEngine
 */

import type { RootState } from '../../store';
import { getPreferenceManager } from '../preferences/userPreferences';
import { PLAN_TEMPLATES } from '../planner/planGenerator';
import { newId } from '../../utils/ids';
import type { PlanTemplate } from '../planner/planTypes';

// ============================================================================
// Types
// ============================================================================

/**
 * Type of suggestion.
 */
export type SuggestionType =
  | 'quick_action'    // Single action suggestion
  | 'workflow'        // Multi-step workflow
  | 'template'        // Plan template
  | 'knowledge'       // Knowledge tip
  | 'shortcut'        // Keyboard shortcut hint
  | 'contextual';     // Based on current context

/**
 * Priority level for suggestions.
 */
export type SuggestionPriority = 'high' | 'medium' | 'low';

/**
 * A single suggestion.
 */
export interface Suggestion {
  /** Unique ID */
  id: string;
  /** Type of suggestion */
  type: SuggestionType;
  /** Short title */
  title: string;
  /** Detailed description */
  description: string;
  /** Priority */
  priority: SuggestionPriority;
  /** Icon name or emoji */
  icon?: string;
  /** Action to execute if selected */
  action?: SuggestionAction;
  /** Related template ID */
  templateId?: string;
  /** Keywords for search */
  keywords: string[];
  /** Confidence score 0-1 */
  confidence: number;
  /** Category for grouping */
  category: string;
}

/**
 * Action to execute from a suggestion.
 */
export interface SuggestionAction {
  /** Type of action */
  type: 'execute_template' | 'run_action' | 'show_help' | 'open_panel' | 'custom';
  /** Payload for the action */
  payload: Record<string, unknown>;
}

/**
 * Context for generating suggestions.
 */
export interface SuggestionContext {
  /** Currently selected piece IDs */
  selectedPieceIds: string[];
  /** Number of pieces in project */
  pieceCount: number;
  /** Number of seams in project */
  seamCount: number;
  /** Is simulation running */
  isSimulating: boolean;
  /** Current tool */
  currentTool?: string;
  /** User's recent actions */
  recentActions: string[];
  /** User's skill level */
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  /** Is project empty */
  isEmpty: boolean;
  /** Has body/avatar */
  hasBody: boolean;
  /** User input (for search) */
  query?: string;
}

/**
 * Options for suggestion generation.
 */
export interface SuggestionOptions {
  /** Maximum number of suggestions */
  maxSuggestions: number;
  /** Include workflow suggestions */
  includeWorkflows: boolean;
  /** Include knowledge tips */
  includeKnowledge: boolean;
  /** Include shortcuts */
  includeShortcuts: boolean;
  /** Minimum confidence threshold */
  minConfidence: number;
}

const DEFAULT_OPTIONS: SuggestionOptions = {
  maxSuggestions: 5,
  includeWorkflows: true,
  includeKnowledge: true,
  includeShortcuts: true,
  minConfidence: 0.3,
};

// ============================================================================
// Built-in Suggestions
// ============================================================================

/**
 * Suggestions for empty projects.
 */
const EMPTY_PROJECT_SUGGESTIONS: Suggestion[] = [
  {
    id: 'start-tshirt',
    type: 'template',
    title: 'Create a T-Shirt',
    description: 'Start with a basic t-shirt pattern - front, back, and sleeves',
    priority: 'high',
    icon: '👕',
    action: { type: 'execute_template', payload: { templateId: 'tshirt-basic' } },
    templateId: 'tshirt-basic',
    keywords: ['t-shirt', 'tshirt', 'top', 'start', 'beginner'],
    confidence: 1.0,
    category: 'getting-started',
  },
  {
    id: 'start-bodice',
    type: 'template',
    title: 'Create a Bodice Block',
    description: 'Start with a basic bodice block - the foundation for many garments',
    priority: 'high',
    icon: '📐',
    action: { type: 'execute_template', payload: { templateId: 'bodice-block' } },
    templateId: 'bodice-block',
    keywords: ['bodice', 'block', 'sloper', 'base', 'foundation'],
    confidence: 0.9,
    category: 'getting-started',
  },
  {
    id: 'start-skirt',
    type: 'template',
    title: 'Create a Skirt',
    description: 'Start with a basic A-line skirt pattern',
    priority: 'medium',
    icon: '👗',
    action: { type: 'execute_template', payload: { templateId: 'skirt-basic' } },
    templateId: 'skirt-basic',
    keywords: ['skirt', 'bottom', 'a-line'],
    confidence: 0.85,
    category: 'getting-started',
  },
  {
    id: 'create-piece',
    type: 'quick_action',
    title: 'Create a Custom Piece',
    description: 'Draw a custom pattern piece using the drawing tools',
    priority: 'medium',
    icon: '✏️',
    action: { type: 'run_action', payload: { action: 'select_tool', tool: 'draw' } },
    keywords: ['draw', 'create', 'custom', 'piece', 'freehand'],
    confidence: 0.7,
    category: 'getting-started',
  },
];

/**
 * Suggestions when pieces are selected.
 */
const SELECTION_SUGGESTIONS: Suggestion[] = [
  {
    id: 'auto-seam',
    type: 'quick_action',
    title: 'Auto-detect Seams',
    description: 'Automatically detect and create seams between selected pieces',
    priority: 'high',
    icon: '🔗',
    action: { type: 'run_action', payload: { action: 'auto_detect_seams' } },
    keywords: ['seam', 'connect', 'join', 'auto'],
    confidence: 0.9,
    category: 'assembly',
  },
  {
    id: 'duplicate',
    type: 'quick_action',
    title: 'Duplicate Piece',
    description: 'Create a copy of the selected piece',
    priority: 'medium',
    icon: '📋',
    action: { type: 'run_action', payload: { action: 'duplicate_piece' } },
    keywords: ['duplicate', 'copy', 'clone'],
    confidence: 0.8,
    category: 'editing',
  },
  {
    id: 'mirror',
    type: 'quick_action',
    title: 'Mirror Piece',
    description: 'Create a mirrored copy of the selected piece',
    priority: 'medium',
    icon: '🪞',
    action: { type: 'run_action', payload: { action: 'mirror_piece' } },
    keywords: ['mirror', 'flip', 'reflect', 'symmetry'],
    confidence: 0.75,
    category: 'editing',
  },
  {
    id: 'add-seam-allowance',
    type: 'quick_action',
    title: 'Add Seam Allowance',
    description: 'Add seam allowance to the selected piece',
    priority: 'medium',
    icon: '📏',
    action: { type: 'run_action', payload: { action: 'add_seam_allowance' } },
    keywords: ['seam', 'allowance', 'offset'],
    confidence: 0.7,
    category: 'finishing',
  },
];

/**
 * Suggestions when simulation can run.
 */
const SIMULATION_SUGGESTIONS: Suggestion[] = [
  {
    id: 'start-sim',
    type: 'quick_action',
    title: 'Start Simulation',
    description: 'Run the cloth simulation to see how the garment drapes',
    priority: 'high',
    icon: '▶️',
    action: { type: 'run_action', payload: { action: 'start_simulation' } },
    keywords: ['simulate', 'drape', 'fit', 'preview', 'run'],
    confidence: 0.95,
    category: 'simulation',
  },
];

/**
 * Knowledge tips for beginners.
 */
const KNOWLEDGE_TIPS: Suggestion[] = [
  {
    id: 'tip-ease',
    type: 'knowledge',
    title: 'Understanding Ease',
    description: 'Ease is the extra room added to body measurements for comfort and movement',
    priority: 'low',
    icon: '💡',
    action: { type: 'show_help', payload: { topic: 'ease' } },
    keywords: ['ease', 'fit', 'comfort', 'measurement'],
    confidence: 0.5,
    category: 'learning',
  },
  {
    id: 'tip-grainline',
    type: 'knowledge',
    title: 'Grain Line Direction',
    description: 'The grain line should run parallel to the selvage for proper drape',
    priority: 'low',
    icon: '💡',
    action: { type: 'show_help', payload: { topic: 'grainline' } },
    keywords: ['grain', 'fabric', 'direction', 'selvage'],
    confidence: 0.5,
    category: 'learning',
  },
  {
    id: 'tip-notches',
    type: 'knowledge',
    title: 'Using Notches',
    description: 'Single notches mark front pieces, double notches mark back pieces',
    priority: 'low',
    icon: '💡',
    action: { type: 'show_help', payload: { topic: 'notches' } },
    keywords: ['notch', 'mark', 'front', 'back'],
    confidence: 0.5,
    category: 'learning',
  },
];

/**
 * Keyboard shortcut hints.
 */
const SHORTCUT_HINTS: Suggestion[] = [
  {
    id: 'shortcut-undo',
    type: 'shortcut',
    title: 'Undo: ⌘Z',
    description: 'Undo the last action',
    priority: 'low',
    icon: '⌨️',
    keywords: ['undo', 'shortcut', 'keyboard'],
    confidence: 0.4,
    category: 'shortcuts',
  },
  {
    id: 'shortcut-redo',
    type: 'shortcut',
    title: 'Redo: ⌘⇧Z',
    description: 'Redo the last undone action',
    priority: 'low',
    icon: '⌨️',
    keywords: ['redo', 'shortcut', 'keyboard'],
    confidence: 0.4,
    category: 'shortcuts',
  },
  {
    id: 'shortcut-delete',
    type: 'shortcut',
    title: 'Delete: ⌫',
    description: 'Delete selected piece',
    priority: 'low',
    icon: '⌨️',
    keywords: ['delete', 'remove', 'shortcut', 'keyboard'],
    confidence: 0.4,
    category: 'shortcuts',
  },
];

// ============================================================================
// Suggestion Engine
// ============================================================================

/**
 * Generate a unique suggestion ID.
 *
 * B11-state: returns a UUID. Previous `let suggestionIdCounter = 0`
 * counter removed. Verified non-load-bearing.
 */
function generateSuggestionId(): string {
  return newId();
}

/**
 * Build context from Redux state.
 */
export function buildSuggestionContext(state: RootState): SuggestionContext {
  const prefManager = getPreferenceManager();
  const prefs = prefManager.getPreferences();
  const recentActions = prefManager.getMostUsedActions(5).map(a => a.action);

  const pieces = state.project?.pieces ?? [];
  const seams = state.project?.seams ?? [];
  const selectedIds = state.editor?.selectedPieceIds ?? [];

  return {
    selectedPieceIds: selectedIds,
    pieceCount: pieces.length,
    seamCount: seams.length,
    isSimulating: state.simulation?.simulationState === 'running',
    currentTool: state.editor?.activeTool,
    recentActions,
    skillLevel: prefs.skillLevel,
    isEmpty: pieces.length === 0,
    hasBody: state.simulation?.bodyCollision ?? false,
  };
}

/**
 * Generate suggestions based on context.
 */
export function generateSuggestions(
  context: SuggestionContext,
  options: Partial<SuggestionOptions> = {}
): Suggestion[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const suggestions: Suggestion[] = [];

  // Empty project suggestions
  if (context.isEmpty) {
    suggestions.push(...EMPTY_PROJECT_SUGGESTIONS);
  }

  // Selection-based suggestions
  if (context.selectedPieceIds.length > 0) {
    suggestions.push(...SELECTION_SUGGESTIONS);
  }

  // Simulation suggestions (when pieces exist and seams are set)
  if (context.pieceCount > 0 && context.seamCount > 0 && !context.isSimulating) {
    suggestions.push(...SIMULATION_SUGGESTIONS);
  }

  // Knowledge tips for beginners
  if (opts.includeKnowledge && context.skillLevel === 'beginner') {
    suggestions.push(...KNOWLEDGE_TIPS);
  }

  // Shortcut hints
  if (opts.includeShortcuts && context.skillLevel !== 'expert') {
    // Only show a few shortcuts
    suggestions.push(...SHORTCUT_HINTS.slice(0, 2));
  }

  // Template suggestions from user history
  const prefManager = getPreferenceManager();
  const mostUsedTemplates = prefManager.getMostUsedTemplates(3);
  for (const { templateId } of mostUsedTemplates) {
    const template = PLAN_TEMPLATES.find(t => t.id === templateId);
    if (template && !context.isEmpty) {
      suggestions.push(createTemplateSuggestion(template, 0.6));
    }
  }

  // Filter by confidence and query
  let filtered = suggestions.filter(s => s.confidence >= opts.minConfidence);

  // If there's a query, filter by keywords
  if (context.query) {
    const queryLower = context.query.toLowerCase();
    filtered = filtered.filter(s =>
      s.keywords.some(k => k.includes(queryLower)) ||
      s.title.toLowerCase().includes(queryLower) ||
      s.description.toLowerCase().includes(queryLower)
    );
    // Boost confidence for matching suggestions
    filtered = filtered.map(s => ({
      ...s,
      confidence: s.keywords.some(k => k.includes(queryLower))
        ? Math.min(1, s.confidence + 0.3)
        : s.confidence,
    }));
  }

  // Sort by priority and confidence
  filtered.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    const aPriority = priorityOrder[a.priority];
    const bPriority = priorityOrder[b.priority];
    if (aPriority !== bPriority) return bPriority - aPriority;
    return b.confidence - a.confidence;
  });

  // Limit results
  return filtered.slice(0, opts.maxSuggestions);
}

/**
 * Create a suggestion from a plan template.
 */
function createTemplateSuggestion(
  template: PlanTemplate,
  confidence: number
): Suggestion {
  return {
    id: generateSuggestionId(),
    type: 'template',
    title: template.name,
    description: template.description,
    priority: 'medium',
    action: { type: 'execute_template', payload: { templateId: template.id } },
    templateId: template.id,
    keywords: template.keywords,
    confidence,
    category: template.category,
  };
}

/**
 * Search suggestions by query.
 */
export function searchSuggestions(
  query: string,
  options: Partial<SuggestionOptions> = {}
): Suggestion[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const queryLower = query.toLowerCase().trim();

  if (!queryLower) {
    return [];
  }

  const allSuggestions: Suggestion[] = [
    ...EMPTY_PROJECT_SUGGESTIONS,
    ...SELECTION_SUGGESTIONS,
    ...SIMULATION_SUGGESTIONS,
    ...KNOWLEDGE_TIPS,
    ...SHORTCUT_HINTS,
  ];

  // Add all templates
  for (const template of PLAN_TEMPLATES) {
    allSuggestions.push(createTemplateSuggestion(template, 0.5));
  }

  // Filter and score by query match
  const scored = allSuggestions
    .map(suggestion => {
      let score = 0;

      // Exact keyword match
      if (suggestion.keywords.some(k => k === queryLower)) {
        score += 1.0;
      }
      // Partial keyword match
      else if (suggestion.keywords.some(k => k.includes(queryLower))) {
        score += 0.7;
      }
      // Title match
      if (suggestion.title.toLowerCase().includes(queryLower)) {
        score += 0.5;
      }
      // Description match
      if (suggestion.description.toLowerCase().includes(queryLower)) {
        score += 0.3;
      }

      return { suggestion, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored
    .slice(0, opts.maxSuggestions)
    .map(({ suggestion, score }) => ({
      ...suggestion,
      confidence: Math.min(1, suggestion.confidence + score * 0.3),
    }));
}

/**
 * Get suggestions for a specific category.
 */
export function getSuggestionsByCategory(
  category: string,
  options: Partial<SuggestionOptions> = {}
): Suggestion[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const allSuggestions: Suggestion[] = [
    ...EMPTY_PROJECT_SUGGESTIONS,
    ...SELECTION_SUGGESTIONS,
    ...SIMULATION_SUGGESTIONS,
    ...KNOWLEDGE_TIPS,
    ...SHORTCUT_HINTS,
  ];

  return allSuggestions
    .filter(s => s.category === category)
    .slice(0, opts.maxSuggestions);
}

// ============================================================================
// Quick Action Suggestions
// ============================================================================

/**
 * Get quick action suggestions for the command palette.
 */
export function getQuickActions(limit = 10): Suggestion[] {
  const suggestions: Suggestion[] = [
    ...EMPTY_PROJECT_SUGGESTIONS.filter(s => s.type === 'quick_action'),
    ...SELECTION_SUGGESTIONS,
    ...SIMULATION_SUGGESTIONS,
  ];

  // Add template actions
  for (const template of PLAN_TEMPLATES) {
    suggestions.push({
      id: `qa-${template.id}`,
      type: 'workflow',
      title: `Create ${template.name}`,
      description: template.description,
      priority: 'medium',
      action: { type: 'execute_template', payload: { templateId: template.id } },
      templateId: template.id,
      keywords: template.keywords,
      confidence: 0.8,
      category: template.category,
    });
  }

  return suggestions.slice(0, limit);
}
