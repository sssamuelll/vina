/**
 * Rate limiter helpers — consolidates two pre-existing module-scoped patterns:
 * - A3 § 3.3.A `wasmNaNCount` (count-sampling, every Nth cumulative item).
 * - E-async § 3.5.3.A `shouldEmitSolverToast` (time-window, windowMs since last).
 *
 * Issue #715 (cross-eje A3 + E-async follow-up).
 */

export interface RateLimiter {
  tryEmit(increment?: number): boolean;
  reset(): void;
}

export interface CountSamplingLimiter extends RateLimiter {
  readonly count: number;
}

/**
 * Time-window limiter — emits when `now - lastTs > windowMs` (strict `>`).
 *
 * Sentinel `lastTs = 0` is intentional (NOT `Date.now()`): in production
 * `Date.now() >> windowMs`, so the first call after construction always
 * emits. Initializing to `Date.now()` would silently suppress the first
 * event of every session.
 */
export function createTimeWindowLimiter(windowMs: number): RateLimiter {
  let lastTs = 0;
  return {
    tryEmit(): boolean {
      const now = Date.now();
      if (now - lastTs > windowMs) {
        lastTs = now;
        return true;
      }
      return false;
    },
    reset(): void {
      lastTs = 0;
    },
  };
}

/**
 * Count-sampling limiter — emits on first non-zero cumulative + when the
 * post-increment cumulative is an exact multiple of `everyN`. Used for
 * telemetry where each call may contribute a variable count (`tryEmit(n)`),
 * not a single tick. An increment that skips past a multiple of `everyN`
 * does NOT trigger emission (literal port of the A3 `wasmNaNCount` shape).
 */
export function createCountSamplingLimiter(everyN: number): CountSamplingLimiter {
  let count = 0;
  return {
    get count(): number {
      return count;
    },
    tryEmit(increment: number = 1): boolean {
      count += increment;
      return count === increment || count % everyN === 0;
    },
    reset(): void {
      count = 0;
    },
  };
}
