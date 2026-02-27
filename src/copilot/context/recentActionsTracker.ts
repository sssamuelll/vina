/**
 * Recent Actions Tracker — maintains a rolling log of copilot actions
 * for conversation continuity and context.
 *
 * The tracker stores the last N actions with their results, enabling
 * the LLM to understand what has been done and refer back to previous
 * operations.
 *
 * @module recentActionsTracker
 */

// ============================================================================
// Types
// ============================================================================

export interface TrackedAction {
  /** Action type (e.g., 'create_piece', 'select_pieces') */
  action: string;
  /** When the action was executed */
  timestamp: number;
  /** Human-readable result summary */
  result: string;
  /** Whether the action succeeded */
  success: boolean;
  /** Key data from the action (e.g., pieceId, name) */
  data?: Record<string, unknown>;
}

export interface RecentActionsState {
  /** Rolling log of recent actions */
  actions: TrackedAction[];
  /** Maximum actions to keep */
  maxActions: number;
}

// ============================================================================
// Tracker Implementation
// ============================================================================

const DEFAULT_MAX_ACTIONS = 20;

let state: RecentActionsState = {
  actions: [],
  maxActions: DEFAULT_MAX_ACTIONS,
};

// Subscribers for React integration
const listeners = new Set<() => void>();
let revision = 0;

function notifyListeners(): void {
  revision++;
  listeners.forEach(cb => cb());
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Track a new action.
 *
 * @param action - Action type
 * @param result - Human-readable result summary
 * @param success - Whether the action succeeded
 * @param data - Optional additional data
 */
export function trackAction(
  action: string,
  result: string,
  success: boolean,
  data?: Record<string, unknown>
): void {
  const tracked: TrackedAction = {
    action,
    timestamp: Date.now(),
    result,
    success,
    data,
  };

  state.actions.push(tracked);

  // Trim to max size
  if (state.actions.length > state.maxActions) {
    state.actions = state.actions.slice(-state.maxActions);
  }

  notifyListeners();
}

/**
 * Get recent actions.
 *
 * @param count - Maximum number of actions to return (default: all)
 * @returns Array of recent actions, newest last
 */
export function getRecentActions(count?: number): TrackedAction[] {
  if (count === undefined) {
    return [...state.actions];
  }
  return state.actions.slice(-count);
}

/**
 * Get recent successful actions only.
 *
 * @param count - Maximum number of actions to return
 * @returns Array of successful actions
 */
export function getRecentSuccessfulActions(count?: number): TrackedAction[] {
  const successful = state.actions.filter(a => a.success);
  if (count === undefined) {
    return successful;
  }
  return successful.slice(-count);
}

/**
 * Get recent actions of a specific type.
 *
 * @param actionType - Action type to filter by
 * @param count - Maximum number to return
 */
export function getRecentActionsByType(actionType: string, count?: number): TrackedAction[] {
  const matching = state.actions.filter(a => a.action === actionType);
  if (count === undefined) {
    return matching;
  }
  return matching.slice(-count);
}

/**
 * Get actions since a specific timestamp.
 *
 * @param since - Timestamp in milliseconds
 */
export function getActionsSince(since: number): TrackedAction[] {
  return state.actions.filter(a => a.timestamp >= since);
}

/**
 * Clear all tracked actions.
 */
export function clearActions(): void {
  state.actions = [];
  notifyListeners();
}

/**
 * Set the maximum number of actions to track.
 *
 * @param max - New maximum
 */
export function setMaxActions(max: number): void {
  state.maxActions = Math.max(1, max);
  if (state.actions.length > state.maxActions) {
    state.actions = state.actions.slice(-state.maxActions);
  }
  notifyListeners();
}

/**
 * Get current revision number (for React subscriptions).
 */
export function getRevision(): number {
  return revision;
}

/**
 * Subscribe to changes.
 *
 * @param callback - Function to call on change
 * @returns Unsubscribe function
 */
export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Get a summary string of recent actions for LLM context.
 *
 * @param count - Number of actions to include
 * @returns Human-readable summary
 */
export function summarizeRecentActions(count = 5): string {
  const recent = getRecentActions(count);
  if (recent.length === 0) {
    return 'No recent actions.';
  }

  const lines: string[] = ['Recent actions:'];
  for (const action of recent) {
    const status = action.success ? '✓' : '✗';
    const ago = formatTimeAgo(action.timestamp);
    lines.push(`  ${status} ${action.action}: ${action.result} (${ago})`);
  }

  return lines.join('\n');
}

/**
 * Format a timestamp as relative time.
 */
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 120) return '1 min ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 7200) return '1 hour ago';
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return 'over a day ago';
}

// ============================================================================
// Integration with Action Executor
// ============================================================================

/**
 * Create a tracking wrapper for the action executor.
 * This automatically tracks all executed actions.
 *
 * @example
 * ```ts
 * const executor = createActionExecutor(dispatch, getState);
 * const trackedExecutor = withActionTracking(executor);
 * await trackedExecutor.execute(action); // Automatically tracked
 * ```
 */
export function withActionTracking<T extends { execute: (action: any) => Promise<any> }>(
  executor: T
): T {
  const originalExecute = executor.execute.bind(executor);

  executor.execute = async (action: any) => {
    const result = await originalExecute(action);

    trackAction(
      action.action,
      result.summary || (result.success ? 'Success' : result.error || 'Failed'),
      result.success,
      result.data
    );

    return result;
  };

  return executor;
}

// ============================================================================
// Reset for testing
// ============================================================================

/**
 * Reset state (for testing).
 */
export function __resetForTesting(): void {
  state = {
    actions: [],
    maxActions: DEFAULT_MAX_ACTIONS,
  };
  revision = 0;
  listeners.clear();
}
