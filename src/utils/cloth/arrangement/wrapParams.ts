import type { WrapParams } from './wrapPanel';

/**
 * Shared wrap configuration for the placement loops (render + solver) and the
 * orientation tests. Single source so render and solver never diverge.
 * 150° wrap cap, 3cm standoff from the body surface.
 */
export const DEFAULT_WRAP: WrapParams = { thetaMaxRad: 2.618, gap: 0.03 }; // 150°, 3cm
