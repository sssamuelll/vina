/**
 * Feature flags for copilot functionality.
 * @module features
 */

const BRIDGE_MODE_KEY = 'openclo-use-bridge';

/**
 * Check if bridge mode is enabled (uses new ExecutionBridge instead of agentLoop).
 * Bridge mode is now enabled by default for better execution control and reduced verbosity.
 */
export function isBridgeModeEnabled(): boolean {
  try {
    // Bridge mode is ON by default - only disable if explicitly set to 'false'
    return localStorage.getItem(BRIDGE_MODE_KEY) !== 'false';
  } catch {
    return true; // Default to bridge mode
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
