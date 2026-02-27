/**
 * usePredictiveWarmup — Predictive warmup for reactive solver.
 *
 * Triggers worker pool warmup when user hovers/focuses on slider controls,
 * so the pool is ready before they start dragging.
 *
 * Usage:
 *   const { onFocus, onMouseEnter } = usePredictiveWarmup();
 *   <input onFocus={onFocus} onMouseEnter={onMouseEnter} ... />
 */

import { useRef, useCallback } from 'react';
import { warmupSolver } from '../store/reactiveSolverMiddleware';

/** Delay before triggering warmup on hover (avoids false positives from cursor pass-through) */
const HOVER_DELAY_MS = 100;

export function usePredictiveWarmup() {
  const warmedRef = useRef(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerWarmup = useCallback(() => {
    if (warmedRef.current) return;
    warmedRef.current = true;

    // Fire and forget — warmup failure is non-critical
    warmupSolver().catch(() => {
      // If warmup fails, allow retry on next interaction
      warmedRef.current = false;
    });
  }, []);

  const onFocus = useCallback(() => {
    // Focus is intentional — warmup immediately
    triggerWarmup();
  }, [triggerWarmup]);

  const onMouseEnter = useCallback(() => {
    // Hover might be accidental — delay to filter pass-through
    if (warmedRef.current) return;

    hoverTimerRef.current = setTimeout(() => {
      triggerWarmup();
    }, HOVER_DELAY_MS);
  }, [triggerWarmup]);

  const onMouseLeave = useCallback(() => {
    // Cancel pending warmup if user leaves before delay
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  return {
    onFocus,
    onMouseEnter,
    onMouseLeave,
    /** Reset warmup state (for testing or forced re-warmup) */
    reset: useCallback(() => {
      warmedRef.current = false;
    }, []),
    /** Check if warmup has been triggered */
    isWarmed: useCallback(() => warmedRef.current, []),
  };
}
