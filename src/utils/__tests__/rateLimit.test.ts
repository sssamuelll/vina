import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTimeWindowLimiter,
  createCountSamplingLimiter,
} from '../rateLimit';

describe('createTimeWindowLimiter', () => {
  let nowSpy: ReturnType<typeof vi.spyOn>;
  let mockNow = 0;

  beforeEach(() => {
    mockNow = 0;
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => mockNow);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  // ─── Boundary regression guards migrated from
  //     reactiveSolverMiddleware.test.ts > 'Worker pool error rate-limit
  //     boundary (E-async D8 gap 5)' (PR #709 / issue #715). ──────────────

  it('first call after construction always emits (lastTs=0 sentinel + production Date.now)', () => {
    // Production Date.now() returns ~1.7e12 ms since epoch; with lastTs=0,
    // (now - 0) >> any reasonable windowMs → first emission always fires.
    mockNow = 1_700_000_000_000;
    const limiter = createTimeWindowLimiter(5000);
    expect(limiter.tryEmit()).toBe(true);
  });

  it('strict `>` comparison: exactly windowMs delta suppresses (off-by-one boundary)', () => {
    const limiter = createTimeWindowLimiter(5000);
    mockNow = 1_000_000;
    expect(limiter.tryEmit()).toBe(true); // lastTs becomes 1_000_000

    mockNow = 1_000_000 + 4999;
    expect(limiter.tryEmit()).toBe(false);

    mockNow = 1_000_000 + 5000;
    expect(limiter.tryEmit()).toBe(false); // boundary — suppressed

    mockNow = 1_000_000 + 5001;
    expect(limiter.tryEmit()).toBe(true);
  });

  it('within-window suppression: 0ms after last emit', () => {
    const limiter = createTimeWindowLimiter(5000);
    mockNow = 1_000_000;
    expect(limiter.tryEmit()).toBe(true);
    expect(limiter.tryEmit()).toBe(false); // same instant — suppressed
  });

  it('sentinel regression guard: if internal init were `Date.now()` the first emit would suppress', () => {
    // The helper MUST init `lastTs = 0`, not `Date.now()`. This test pins
    // the contract: with lastTs=0, first emit fires at any production now.
    // If a refactor changes init to Date.now(), this test fails.
    mockNow = 1_700_000_000_000;
    const limiter = createTimeWindowLimiter(5000);
    expect(limiter.tryEmit()).toBe(true);

    // Anti-pattern verification: if lastTs were set to current Date.now()
    // before any tryEmit, the first call at the same instant would suppress.
    // We can't reach into the closure, but we can verify the semantic with a
    // second call: after first emit, immediate retry suppresses.
    expect(limiter.tryEmit()).toBe(false);
  });

  it('reset() restores lastTs=0 sentinel', () => {
    const limiter = createTimeWindowLimiter(5000);
    mockNow = 1_000_000;
    expect(limiter.tryEmit()).toBe(true);
    expect(limiter.tryEmit()).toBe(false);

    limiter.reset();
    expect(limiter.tryEmit()).toBe(true); // first-emit semantics restored
  });
});

describe('createCountSamplingLimiter', () => {
  it('first call always emits (first-non-zero cumulative)', () => {
    const limiter = createCountSamplingLimiter(100);
    expect(limiter.tryEmit()).toBe(true);
    expect(limiter.count).toBe(1);
  });

  it('subsequent calls suppress until count is a multiple of everyN', () => {
    const limiter = createCountSamplingLimiter(100);
    expect(limiter.tryEmit()).toBe(true); // count=1
    for (let i = 2; i < 100; i++) {
      expect(limiter.tryEmit()).toBe(false);
    }
    expect(limiter.tryEmit()).toBe(true); // count=100 → multiple of 100
    expect(limiter.count).toBe(100);
  });

  it('variable increment: tryEmit(n) preserves first-occurrence semantics', () => {
    const limiter = createCountSamplingLimiter(100);
    // Literal port of A3 wasmNaNCount: 50 NaNs in one step on fresh limiter.
    // count goes 0 → 50, emits because count === increment.
    expect(limiter.tryEmit(50)).toBe(true);
    expect(limiter.count).toBe(50);
  });

  it('variable increment: skipping past a multiple of everyN does NOT trigger emit', () => {
    // Literal A3 semantics: only EXACT multiples emit. count 80 → 105
    // skips 100 without emitting (matches pre-refactor behavior).
    const limiter = createCountSamplingLimiter(100);
    expect(limiter.tryEmit(50)).toBe(true);  // count=50, first-occurrence
    expect(limiter.tryEmit(30)).toBe(false); // count=80
    expect(limiter.tryEmit(25)).toBe(false); // count=105, skipped 100
    expect(limiter.tryEmit(1)).toBe(false);  // count=106
    expect(limiter.count).toBe(106);
  });

  it('variable increment: landing exactly on a multiple of everyN emits', () => {
    const limiter = createCountSamplingLimiter(100);
    expect(limiter.tryEmit(50)).toBe(true);  // count=50
    expect(limiter.tryEmit(50)).toBe(true);  // count=100 — exact multiple
    expect(limiter.tryEmit(100)).toBe(true); // count=200 — exact multiple
    expect(limiter.count).toBe(200);
  });

  it('reset() restores count=0 and first-occurrence semantics', () => {
    const limiter = createCountSamplingLimiter(100);
    expect(limiter.tryEmit(50)).toBe(true);
    expect(limiter.tryEmit(30)).toBe(false);

    limiter.reset();
    expect(limiter.count).toBe(0);
    expect(limiter.tryEmit(30)).toBe(true); // first-occurrence again
  });
});
