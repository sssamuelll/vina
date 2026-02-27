/**
 * Copilot Context Module — Phase 3 of Issue #130
 *
 * Provides context generation for LLM requests, including:
 * - Project state (pieces, seams, fabrics)
 * - Selection state
 * - View/tool state
 * - Simulation state
 * - Avatar state
 * - Recent actions tracking
 *
 * @example
 * ```ts
 * import { generateCopilotContext, trackAction } from './copilot/context';
 *
 * // Track an action
 * trackAction('create_piece', 'Created "Front Bodice"', true, { pieceId: 'p1' });
 *
 * // Generate context for LLM
 * const context = generateCopilotContext(store.getState());
 * const contextStr = serializeCopilotContext(context);
 * ```
 *
 * @module copilot/context
 */

// Context generation
export {
  generateCopilotContext,
  serializeCopilotContext,
  generateContextDelta,
} from './copilotContext';

export type {
  CopilotContext,
  CopilotPieceInfo,
  CopilotSeamInfo,
  CopilotSelection,
  CopilotViewState,
  CopilotSimulationState,
  CopilotAvatarState,
} from './copilotContext';

// Recent actions tracking
export {
  trackAction,
  getRecentActions,
  getRecentSuccessfulActions,
  getRecentActionsByType,
  getActionsSince,
  clearActions,
  setMaxActions,
  getRevision,
  subscribe,
  summarizeRecentActions,
  withActionTracking,
} from './recentActionsTracker';

export type { TrackedAction, RecentActionsState } from './recentActionsTracker';
