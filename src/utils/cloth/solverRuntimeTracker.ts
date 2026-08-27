import type { SolverTier } from '../../store/simulationSlice';

let activeTier: SolverTier = 'none';

export function setActiveSolverTier(
  tier: Exclude<SolverTier, 'none'>,
): void {
  activeTier = tier;
}

export function clearActiveSolverTier(): void {
  activeTier = 'none';
}

export function getActiveSolverTier(): SolverTier {
  return activeTier;
}
