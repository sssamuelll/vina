/**
 * Feature flags for copilot functionality.
 * @module features
 */

const BRIDGE_MODE_KEY = 'openclo-use-bridge';

/**
 * Check if bridge mode is enabled (uses new ExecutionBridge instead of agentLoop).
 * NOTE: Bridge OFF by default - Planner needs context integration before enabling.
 */
export function isBridgeModeEnabled(): boolean {
  try {
    return localStorage.getItem(BRIDGE_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Enable or disable bridge mode.
 */
export function setBridgeMode(enabled: boolean): void {
  try {
    localStorage.setItem(BRIDGE_MODE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
}
