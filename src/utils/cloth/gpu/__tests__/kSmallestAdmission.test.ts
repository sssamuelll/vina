import { describe, it, expect } from 'vitest';

/**
 * P4-2 deterministic self-collision admission — CPU proof of the atomicMin
 * cascade's order-independence (the load-bearing concurrency claim in
 * docs/plans/2026-07-01-drape-determinism-p4-2-selfcollision-admission.md § 3).
 *
 * The RED-BEFORE-GREEN pin: it validates the algorithm across EVERY thread
 * interleaving in JS before any WGSL lands. GPU execution is verified @gpu-local
 * via the P4-0 determinism gate. `advanceForbidden` models the § 2.3 land-mine
 * (a thread that BREAKS the cascade while still carrying a real value) and MUST
 * be detected as non-deterministic — a harness that can't catch the one fatal
 * mistake proves nothing.
 */
const SENTINEL = 0xffffffff;

/** advance = one atomicMin step on the thread's current slot. Returns the new
 *  carry (the displaced, larger value) and whether the thread is finished. */
type Advance = (slots: number[], slot: number, carry: number) => { carry: number; done: boolean };

/** CORRECT cascade: min into the slot, carry the larger value down. A thread
 *  finishes the moment its carry becomes SENTINEL (it deposited into an empty
 *  slot; every later atomicMin(slot, SENTINEL) is a provable no-op). */
const advanceCorrect: Advance = (slots, slot, carry) => {
  const old = slots[slot];
  slots[slot] = Math.min(old, carry);
  const carryAfter = Math.max(old, carry);
  return { carry: carryAfter, done: carryAfter === SENTINEL };
};

/** FORBIDDEN early-out (§ 2.3): break as soon as the slot already held a value
 *  ≤ our incoming carry — "the slot didn't need me, I'm done" — which STOPS the
 *  thread while it is still carrying a real value, dropping it. Present only so
 *  the harness can prove it detects the land-mine. */
const advanceForbidden: Advance = (slots, slot, carry) => {
  const old = slots[slot];
  slots[slot] = Math.min(old, carry);
  const carryAfter = Math.max(old, carry);
  return { carry: carryAfter, done: old <= carry || carryAfter === SENTINEL };
};

function kSmallest(indices: number[], K: number): number[] {
  return [...indices].sort((a, b) => a - b).slice(0, K);
}

/**
 * The SET of final slot configurations reachable over ALL interleavings of the
 * threads. Each thread writes slots 0..K-1 in order, carrying its result, and
 * may finish early. Memoized by state so the state space (not the path count)
 * bounds the work.
 */
function finalOutcomes(indices: number[], K: number, advance: Advance): Set<string> {
  const T = indices.length;
  const memo = new Map<string, Set<string>>();

  function rec(slots: number[], prog: number[], carry: number[], done: boolean[]): Set<string> {
    if (done.every((d) => d)) {
      const kept = slots.filter((v) => v !== SENTINEL).sort((a, b) => a - b);
      return new Set([kept.join(',')]);
    }
    const mk = `${slots.join(',')}|${prog.join(',')}|${carry.join(',')}|${done.map((d) => (d ? 1 : 0)).join('')}`;
    const cached = memo.get(mk);
    if (cached) return cached;

    const out = new Set<string>();
    for (let t = 0; t < T; t++) {
      if (done[t]) continue;
      const s2 = slots.slice();
      const c2 = carry.slice();
      const p2 = prog.slice();
      const d2 = done.slice();
      const r = advance(s2, prog[t], carry[t]);
      c2[t] = r.carry;
      p2[t] = prog[t] + 1;
      d2[t] = r.done || p2[t] === K;
      for (const o of rec(s2, p2, c2, d2)) out.add(o);
    }
    memo.set(mk, out);
    return out;
  }

  return rec(
    new Array(K).fill(SENTINEL),
    new Array(T).fill(0),
    indices.slice(),
    new Array(T).fill(false),
  );
}

const UNIVERSE = [0, 1, 2, 3, 4, 5];
const subsets: number[][] = [];
for (let mask = 1; mask < 1 << UNIVERSE.length; mask++) {
  const s = UNIVERSE.filter((_, i) => mask & (1 << i));
  if (s.length <= 4) subsets.push(s); // up to 4 concurrent threads per cell
}

describe('P4-2 k-smallest atomicMin admission', () => {
  it('every interleaving yields exactly the K smallest indices (K=2,3)', () => {
    for (const K of [2, 3]) {
      for (const s of subsets) {
        const outcomes = finalOutcomes(s, K, advanceCorrect);
        expect(outcomes.size, `subset [${s}] K=${K} is order-dependent`).toBe(1);
        expect([...outcomes][0], `subset [${s}] K=${K} kept the wrong set`).toBe(
          kSmallest(s, K).join(','),
        );
      }
    }
  });

  it('detects the forbidden early-out as non-deterministic on overflow cells', () => {
    // Only overflow cells (T > K) contend for slots and can expose the land-mine.
    const detected = subsets.flatMap((s) =>
      [2, 3]
        .filter((K) => s.length > K)
        .filter((K) => finalOutcomes(s, K, advanceForbidden).size > 1),
    );
    // The harness MUST catch the §2.3 land-mine, else the crux proof is untested.
    expect(detected.length).toBeGreaterThan(0);
  });
});
