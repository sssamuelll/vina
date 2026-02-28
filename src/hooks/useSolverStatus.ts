/**
 * useSolverStatus — Subscribe to reactive solver status.
 *
 * Returns the current computing state of the solver,
 * updating reactively when the state changes.
 *
 * Usage:
 *   const { isComputing } = useSolverStatus();
 *   {isComputing && <span>Computing...</span>}
 */

import { useState, useEffect } from 'react';
import {
  subscribeToComputingState,
  getIsComputing,
  getSolverMetrics,
  getSolverState,
} from '../store/reactiveSolverMiddleware';
import type { SolverMetrics } from '../types/reactiveSolver';

export interface SolverStatus {
  /** Whether the solver is currently computing pieces */
  isComputing: boolean;
}

/**
 * Hook to subscribe to solver computing state.
 */
export function useSolverStatus(): SolverStatus {
  const [isComputing, setIsComputing] = useState(getIsComputing);

  useEffect(() => {
    const unsubscribe = subscribeToComputingState(setIsComputing);
    return unsubscribe;
  }, []);

  return { isComputing };
}

/**
 * Hook to get solver metrics (for debugging/dev mode).
 * Note: This does NOT auto-update. Call it when you need fresh metrics.
 */
export function useSolverMetrics(): {
  getMetrics: () => SolverMetrics;
  getState: () => ReturnType<typeof getSolverState>;
} {
  return {
    getMetrics: getSolverMetrics,
    getState: getSolverState,
  };
}
