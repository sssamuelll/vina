import type { InterfacingType } from '../../types/types';

export const INTERFACING_STIFFNESS: Record<InterfacingType, number> = {
  'none': 1.0,
  'fusible-light': 2.0,
  'fusible-medium': 4.0,
  'fusible-heavy': 8.0,
  'sew-in-light': 1.5,
  'sew-in-heavy': 3.0,
  'canvas': 10.0,
};

export function computeStiffnessMultiplier(
  interfacingType: InterfacingType = 'none',
  solidifyFactor: number = 0,
): number {
  const interfacingMul = INTERFACING_STIFFNESS[interfacingType] ?? 1.0;
  const solidifyMul = 1 + Math.max(0, Math.min(1, solidifyFactor)) * 9;
  return Math.min(interfacingMul * solidifyMul, 50); // cap at 50x to prevent instability
}
