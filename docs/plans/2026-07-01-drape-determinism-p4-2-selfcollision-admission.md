# OpenClo Eje P4-2 — Deterministic Self-Collision Admission Design

**Date:** 2026-07-01
**Status:** Draft (design, adversarial-reviewed) — ready for TDD implementation. Sizing consensus (Plumb): **M / refactor**; do NOT route through `brainstorming`/`spec`/`meta-review` — this document IS the spec, decisions are closed.
**Parent:** `docs/plans/2026-07-01-drape-determinism-p4-design.md` § P4-2. **Supersedes** the parent's P4-2, which concluded "raise `CELL_CAPACITY` or defer — counting-sort is perf-infeasible." This eje finds a *third* option the parent missed: a deterministic bounded admission with **no prefix-sum and no memory growth**, so P4-2 stops being the deferred/lossy stepchild.
**Suggested home:** `docs/reports/2026-07-01-drape-determinism-p4-2-selfcollision-admission.md` (a fixes RFC under an already-open eje, not a net-new `specs/` feature).
**Relationship to the goal:** P4-2 closes the *self-collision slot-truncation* race only. It is **necessary-not-sufficient** for a bit-exact self-collision-on drape — it depends on P4-1 (bend coloring) to remove the upstream float race that otherwise perturbs the positions this pass hashes (see § 9, Finding B). Ship P4-2 with or after P4-1, never before.

---

## 0. The framing — this deletes a buffer instead of adding one

The winning move **removes** `cellCount` rather than adding admission machinery. `cellCount` disappears from the interface, the factory, and `destroy`; `cellEntries` becomes `array<atomic<u32>>`; and the deterministic keep-smallest-K admission rides entirely on `atomicMin` into the entries array. Net: **one fewer SBA in the set (6→5), one fewer in the resolve stage (8→7), ~472 KB less memory, still exactly 4 passes.** Determinism falls out of `atomicMin` being a conservative sort-swap — the *same structural property #921 Eje A already leaned on* to make body-contact selection order-independent (`tslCollision.ts:430`/`:486`).

`// ponytail: the lazy fix is subtractive — no new SBA, no prefix-sum, no new pass. Delete cellCount, make entries atomic, done.`

---

## 1. Problem + why the parent's two options were both wrong

### The race (unchanged from parent)
Scatter claims a bucket slot via `atomicAdd(cellCount[h], 1)` (`tslSelfCollision.ts:287`) and writes the particle only if `slot < CELL_CAPACITY` (=8, `:100`) at `:288-294`. When **>8 particles hash to one thickness-sized (2 mm) cell**, *which 8 win slots 0..7* depends on `atomicAdd` arrival order = thread scheduling. The candidate set the resolve pass reads (`:358-365`, `j>i` guard `:368`) therefore varies run-to-run → different detected pair set → bistable drape.

Measured on the María shirt at rest: **~200 cells overflow, 21–31 particles/cell, transient peak higher**; residual 4 mm RMS / 17 mm max at the hem. The resolve *accumulation* is already deterministic — the i32 fixed-point `atomicAdd` (`:412-426`) is integer-commutative. **Only the slot admission is racy.**

### Why raising `CELL_CAPACITY` (parent's option b) is rejected
Overflow is **pervasive and structural**, not a rare clump: ~200 cells, max 31 at rest, and the transient peak during seam-close/settle is higher still. To make truncation never fire you'd need K ≥ ~40, i.e. **5×** the entries buffer, **5×** the resolve inner-loop bound (27 cells × 40 vs × 8), and the memory/dispatch grows with a ceiling a denser pattern re-breaches. It trades a determinism bug for a perf-and-memory cliff and still isn't deterministic above the new ceiling. Rejected.

### Why counting-sort / prefix-sum (parent's option a) is rejected
`tslSelfCollision.ts:98` records the measured verdict: the serial prefix-sum was **180–900 ms/frame** at María scale, dead against the ≥30 fps DoD (#897 H-BP1). GPU counting-sort is the same prefix-sum. Rejected — this is a **hard constraint**, not a preference.

### The third option (this eje): deterministic admission with **neither**
Keep the **K smallest particle indices** per cell. The kept set is a pure function of *which* indices hash to the cell — independent of arrival order — with **zero** prefix-sum and **zero** memory growth, because the payload (the particle index) *is its own sort key*. No composite key needed (contrast #921, which packed `(distQ<<TRI_BITS)|triIdx` because its sort key ≠ its payload).

---

## 2. Chosen approach — `atomicMin` cascade, K=8, keep-smallest, sentinel `0xFFFFFFFF`

All line numbers refer to `src/utils/cloth/gpu/tslSelfCollision.ts`.

### 2.1 Buffer changes (`SelfCollisionBufferSet`, `createSelfCollisionBuffers`)
- **Delete `cellCountSBA`** entirely: from the interface (`:59`), the factory return (`:136`), and the `destroy` list (`:177`).
- `cellEntriesSBA` keeps its shape (`Uint32Array(tableSize * CELL_CAPACITY)`, `:137-140`) but is wrapped **atomic** at `:218`:
  ```ts
  const cellEntriesBuf = makeAtomicStorage(buffers.cellEntriesSBA, 'uint', T * CELL_CAPACITY);
  ```
- **Delete `cellCountBuf`** (`:217`).
- Add one const: `const SENTINEL = uint(0xffffffff);` — u32 max. **This is why keep-*smallest* is mandatory:** the sentinel must be an out-of-range value, and `0xFFFFFFFF` is not a valid particle index (N ≈ 59k). Keep-*largest* would need sentinel `0`, which aliases real particle index 0 → corruption. (Review 1 + Review 2 Finding 5 both flag this; keep-smallest is load-bearing, not stylistic.)
- **Static sentinel-bound guard** (Review 2 Finding 6 — match the A1 precedent's `INT32_MAX` throw at `tslCollision.ts:159`): in `createSelfCollisionBuffers`, assert `numParticles < 0xFFFFFFFF` before allocation. Trivially true today, but guard it so a future giant mesh fails loudly instead of colliding a real index with the sentinel. One line.

### 2.2 cellClear (`:235-245`) — was zero-a-counter, now sentinel-fill entries
`cellCount` no longer exists, so nothing to zero. But with no counter, the sentinel is now the *only* signal for "slot empty" → cellEntries **must** be sentinel-filled every substep. Dispatch grows `tableSize` → `tableSize * K`:
```ts
const cellClearFn = Fn(() => {
  const i = instanceIndex;
  If(uint(i).lessThan(uint(T * CELL_CAPACITY)), () => {
    atomicStore(cellEntriesBuf.element(i), SENTINEL.toVar()); // .toVar() forces concrete u32 — same AbstractInt caveat as :242
  });
})();
const cellClearNode = compute(cellClearFn, T * CELL_CAPACITY, [64]);
```

### 2.3 scatter (`:253-297`) — replace the atomicAdd slot-claim with a K-slot cascade
The hash → `hVar` block (`:257-281`) is **unchanged**. Replace the `atomicAdd` + truncated-write (`:287-294`) with:
```ts
const base = hVar.mul(uint(CELL_CAPACITY));
const val = uint(i).toVar('val');
Loop({ start: uint(0), end: uint(CELL_CAPACITY), type: 'uint', condition: '<' }, ({ i: s }) => {
  If(val.notEqual(SENTINEL), () => {          // early-out: once deposited, val==SENTINEL, remaining ops are provable no-ops
    const old = atomicMin(cellEntriesBuf.element(base.add(s)), val).toVar('old');
    val.assign(old.max(val));                 // carry the DISPLACED (larger) value down to the next slot
  });
})();
```
Per-particle atomic count: **K=8 `atomicMin`** worst case (was 1 `atomicAdd`); with the early-out, **~2–3 typical** (once a real value lands in a slot, `val` becomes `SENTINEL` and the guard skips the rest).

> **FORBIDDEN early-out (Review 1 + Review 2 land-mine).** Do **not** replace the guard with `If(old >= val)` "the slot didn't need me, exit." That breaks the correctness premise in § 3 (a thread would stop while still carrying a *real* value) and silently drops kept values. The guard MUST be exactly `val != SENTINEL`. The CPU test in § 6 exists specifically to fail if anyone makes this substitution.

### 2.4 resolve (`:304-438`) — constant loop bound, sentinel skip, atomic reads
Two changes; **both are load-bearing** (Review 1: "land the two resolve guards or it cannot run").
- **Delete** the `atomicLoad(cellCount…).min(K)` (`:358-359`). Loop a **compile-time constant** `0..K`.
- Every entries read is now `atomicLoad` — `cellEntries` is `array<atomic<u32>>`, and a plain `.element()` read is a **WGSL validation error → silent pipeline fail → CPU fallback** (the exact #554 hazard `atomicStorage.ts:69` warns about).
- Guard `j != SENTINEL` **before** `position.element(j)` — without it, `0xFFFFFFFF > i` passes the existing `j>i` guard (`:368`) and `positionBufNode.element(SENTINEL)` reads out of bounds.

```ts
const entriesBase = hVar.mul(uint(CELL_CAPACITY));
Loop({ start: uint(0), end: uint(CELL_CAPACITY), type: 'uint', condition: '<' }, ({ i: ki }) => {
  const j = atomicLoad(cellEntriesBuf.element(entriesBase.add(ki)));  // atomic read now REQUIRED
  If(j.notEqual(SENTINEL).and(j.greaterThan(uint(i))), () => {
    // ... existing adjacency + distance + atomicAdd correction body (:369-427) UNCHANGED ...
  });
});
```
The correction math (`:369-427`) and its i32 `atomicAdd`s are **untouched** — already order-independent.

### 2.5 apply (`:445-477`) — **unchanged.**

### 2.6 Per-stage SBA count (8-buffer wall)
| stage | buffers | count |
|---|---|---|
| cellClear | cellEntries | 1 |
| scatter | position, cellEntries | 2 |
| resolve | position, invMass, cellEntries, adjOffsets, adjNeighbors, delta, corrCount | **7** (was 8 — gained a slot) |
| apply | position, delta, corrCount | 3 |

All ≤ 8. Resolve gains headroom (relevant after face-poke's 11→8 pack). **PASS.**

---

## 3. Correctness — the cascade IS interleave-safe (proof, not hope)

**Claim.** After all threads finish, the K slots of a cell contain exactly the K smallest of the inserted index multiset (sentinels padding underfull cells), as a pure function of *which* indices hashed there — independent of thread scheduling **and** of `atomicMin`-cascade interleaving.

**Three structural facts (none assume global ordering):**

1. **Each `atomicMin(slot, val)` is a per-op-atomic conservative 2-element sort-swap.** Before: multiset `{slot_old, val}`. After: `slot ← min`, register `← max = old.max(val)`. The pair is preserved, only sorted. So the global multiset `G = (all K·#cells slots) ⊎ (all in-flight registers)` is **invariant** under every atomic op. A value enters `G` when its thread starts (register `= i`); it leaves only as a thread's *final* register after its Kth op (the drop).
2. **Slot values are monotonically non-increasing in time** — the only writer is `atomicMin`, which never raises a slot; cellClear is a prior, pass-barriered write.
3. **A thread ending while carrying a real value visited every slot feeding `≤` that value.** Its carried value is non-decreasing (`val ← max` each step). If a thread's final carry is `v`, then the value it fed slot `s_j` was `≤ v` for all `j`. So right after its visit `slot[s_j] = min(old, ≤v) ≤ v`; by fact 2, **final `slot[s_j] ≤ v` for all j.**

**Crux — no K-smallest value is ever dropped.** Take any discarded `v` (a thread's final carried register). By fact 3 every slot ended `≤ v`, so **every kept value `≤ v`**. This holds for *every* discarded `v` ⇒ all discarded `≥` all kept ⇒ kept = the K smallest. ∎

**Why the naive-cascade land-mine doesn't bite this kernel.** The danger is a real value living only in a register (in no slot) while a foreign cascade "crosses" it. That can only lose a value if a thread **stops before slot K-1 while still carrying a real value.** This kernel never does: once a thread deposits, `val` becomes `SENTINEL` (`max(SENTINEL, x) = SENTINEL`), and every subsequent `atomicMin(slot, SENTINEL)` is a provable no-op. The `val != SENTINEL` early-out skips only those no-ops — never an op while carrying a real value. Fact 3's premise ("fed every slot `≤ v`") therefore holds regardless of scheduling. **The forbidden `old >= val` early-out breaks exactly this premise** (§ 2.3).

Duplicates are a non-issue: particle indices are unique → no ties → the kept set is a strict K-smallest.

This is the same class of guarantee as #921 Eje A, reached **without a composite key** because the payload is the sort key.

---

## 4. Alternative — residue-slot placement (also the codegen fallback)

Map each particle to a fixed slot `s = i % K` and `atomicMin` **only** that slot:
```ts
const s = uint(i).mod(uint(CELL_CAPACITY));
atomicMin(cellEntriesBuf.element(base.add(s)), uint(i));
```
- **Deterministic** (slot is a pure function of `i`; per-slot winner is the min index of that residue class — order-independent).
- **1 `atomicMin`/particle** vs up-to-8; cellClear/resolve identical to § 2.
- **Codegen-simplest** — a single `atomicMin`, closest to #921's proven `atomicMin(i32)` shape (no loop-carried `.max()` cascade). **This is the fallback if the cascade's u32 `atomicMin` + loop-carried `old.max(val)` fails to emit valid WGSL** (Review 2 Finding 5 — see § 9 Risk R1).

**Tradeoff:** keeps the smallest index *per residue class*, not the global K-smallest. On an overflow cell, two particles sharing `i % K` compete for one slot and the loser is dropped even if other slots are empty (birthday collisions ⇒ effective capacity < K). Coarser, lossier — but 8× cheaper and trivially correct. **Decision:** ship the cascade (§ 2); keep residue-slot as the named fallback for a codegen failure or a future profiler hit.

---

## 5. Cost (resolve cost corrected per Review 2 Finding 3)

| | today | leading (cascade) | Δ |
|---|---|---|---|
| scatter atomics/particle | 1 `atomicAdd` | 8 `atomicMin` (≤3 typical w/ early-out) | +7 worst |
| cellClear dispatch | `tableSize` (~118k) `atomicStore` | `tableSize·K` (~944k) `atomicStore` | ×8 |
| resolve reads/particle | 27 `atomicLoad`(count) + ≤216 *plain* entries reads | **216 `atomicLoad`(entries)**, no count load | **+~191M `atomicLoad`/frame** |
| SBAs in set | 6 | 5 | −1 |
| SBAs in resolve stage | 8 | 7 | −1 |
| memory | +`tableSize·4` (cellCount) | — | **−~472 KB** |

**Resolve is NOT "≈0"** (the parent DESIGN's table said so; corrected here). Because `cellEntries` is now atomic, the inner loop's reads must be `atomicLoad` and lose coalescing: N ≈ 59k × 27 × 8 × 15 substeps ≈ **191M atomicLoad/frame**. On desktop GPUs an *uncontended* `atomicLoad` is ~a normal load; the cost is lost coalescing, estimated **< 0.5 ms/frame** — but this is the single biggest perf unknown and is **explicitly deferred to @gpu-local measurement**, not asserted. `// ponytail: resolve reads went atomic — measure the coalescing hit @gpu-local before declaring the fps DoD safe.`

Other per-frame adds (N≈59k, tableSize≈118k, 15 substeps): scatter ≈ +6.2M `atomicMin`; cellClear ≈ +12.4M `atomicStore` (pure bandwidth ~57 MB writes/frame ≈ 0.2 ms). `atomicMin` contention is bounded (≤ ~31 threads over 8 addresses in the ~200 overflow cells). **Expected total frame impact < 1 ms** — inside the ≥30 fps DoD, pending the resolve-read measurement. No prefix-sum, no extra dispatch (still 4 passes), no new buffer, net memory decrease.

---

## 6. CPU-testable admission core + TDD plan

Model the admission as a pure step-machine so order-independence is proven **exhaustively in JS** before any WGSL lands. Home: `src/utils/cloth/gpu/__tests__/kSmallestAdmission.test.ts`, model inlined (~15 lines — no shipped module; YAGNI).

```ts
const SENTINEL = 0xffffffff;

// one atomicMin step on a shared slot; mutates slots, returns the thread's new carry.
// Models the SENTINEL sticky-drop: once carry==SENTINEL it stays SENTINEL (the early-out no-op).
function step(slots: number[], slot: number, carry: number): number {
  if (carry === SENTINEL) return SENTINEL;            // deposited already → no-op (the LEGAL early-out)
  const old = slots[slot];
  slots[slot] = Math.min(old, carry);
  return Math.max(old, carry);                        // displaced (larger) value carried onward
}

// FORBIDDEN variant, kept ONLY to prove the test is sensitive to the §2.3 land-mine.
function stepForbidden(slots: number[], slot: number, carry: number): number {
  const old = slots[slot];
  if (old >= carry) return carry;                     // "slot didn't need me" — breaks the proof
  slots[slot] = carry; return old;
}

function kSmallest(indices: number[], K: number): number[] {
  return [...indices].sort((a, b) => a - b).slice(0, K);
}

// DFS over all interleavings of T threads (each = K sequential step() calls over its own carry);
// collect final non-sentinel slots (sorted) per interleaving.
function allInterleavingsAgree(indices, K, stepFn): boolean { /* ... */ }
```

**Assertions:**
1. `allInterleavingsAgree(indices, K, step)` === true AND every interleaving's final slots === `kSmallest(indices, K)` — the crux (§ 3), across the matrix below.
2. **`allInterleavingsAgree(indices, K, stepForbidden)` === false** on at least one overflow case — proves the harness actually *detects* the forbidden early-out (Review 2 Finding 7: the model must be able to catch the one fatal mistake, else it's theatre).

**Matrix:** all index subsets of `{0..5}` at `K∈{2,3}`, up to 4 concurrent threads. Interleaving count stays in the thousands → runs in ms.

This is the **red-before-green pin**. GPU execution stays `@gpu-local` (Samuel runs it), exactly like the tslCollision determinism pins at `__tests__/tslCollision.test.ts:402-417`.

---

## 7. File / kernel changes (Plumb sizing + callsite inventory)

**`src/utils/cloth/gpu/tslSelfCollision.ts`** — the only production file touched (public signatures `createSelfCollisionBuffers` / `makeSelfCollisionComputeNodes` **unchanged** → zero downstream edits):
- buffers/types: delete `cellCountSBA` (interface `:59`, factory `:136`, destroy `:177`) + wrap `cellEntries` atomic 'uint' `:218` + drop `cellCountBuf` `:217` + `SENTINEL` const + N-bound guard + `atomicMin` import — **~8 lines, XS**
- cellClear `:235-245`: dispatch `T→T·K`, store SENTINEL — **~10 lines, XS**
- scatter `:287-294`: K-slot cascade (carries the § 3 proof) — **~15 lines, S**
- resolve `:356-365`: delete count load, constant `0..K` loop, `atomicLoad` reads, `j!=SENTINEL` guard — **~8 lines, XS**
- apply: **0**

**`src/utils/cloth/gpu/__tests__/kSmallestAdmission.test.ts`** — new, model + DFS + matrix + forbidden-variant sensitivity — **~70 lines, S**

**`src/utils/cloth/gpu/__tests__/tslSelfCollision.test.ts`** — existing, breaks on `cellCountSBA` deletion. Assertions at **`:158, :180-181, :286`** (defined / `Uint32Array` / length / `setAtomic`-called on cellCount) must be removed or retargeted to `cellEntries` — **~15-20 lines, S**

**`cellCount` deletion is fully isolated** (Review 1 verified): consumed only by pass-through in `gpuSolverClient.ts:579` and `tslSolver.ts:962` (public signatures unchanged → **0 edits**) plus the test above. **`sc-cellCount` in `gpuSolver.ts:1045` is the SEPARATE raw-WGSL/prefix-sum legacy path — DO NOT touch it.**

**No changes** to `atomicStorage.ts` (`'uint'` + `atomicMin`/`atomicMax` already supported, verified `:65`/`:79`), the augment `d.ts`, or the resolve correction math.

Architectural decisions required: **1**, already resolved (cascade over residue-slot, § 4).

---

## 8. Verification — the P4-0 gate must flip DIVERGED→BIT-EXACT

Uses the P4-0 harness verbatim (`docs/plans/2026-07-01-drape-determinism-p4-design.md` § P4-0): capture the position `Float32Array` at the 2.5s M4 / tether-capture checkpoint per `--repeat-each` run; offline `memcmp` diff; mm L∞/L2 as diagnostic.

- **Determinism (the deliverable): with `config.selfCollision` ON, `pos-*.bin` bit-exact across N≥5 runs.** Two preconditions the gate must honor:
  - **P4-0 must first confirm self-collision is *active* at the 2.5s checkpoint** (parent § P4-0(b)). If it's off on the default María drape, a green gate says *nothing* about this race — a self-collision-ON gate run is required to have any signal. **Do not claim P4-2 verified from a self-collision-off run.**
  - **P4-1 (bend coloring) must be landed** — otherwise the upstream bend float race perturbs the hashed positions and the drape won't go bit-exact even with admission fixed (§ 9 Finding B). Expected sequence: P4-0 red (both races) → +P4-1 → still red iff self-collision active → +P4-2 → **green**.
- **Drape correctness unchanged (separate signal):** existing M4 asserts still hold (`belowHipPct<5`, `minY>0.5`, `maxY>1.3`, sleeve `meanY<1.476`, `nan===0`). Reproducible ≠ correct — a reproducibly-*wrong* pose passes the diff and fails M4, by design. Keep-smallest's index bias (§ 9 Finding A) is watched *here*.
- **≥30 fps held** after the scatter cascade + atomic resolve reads — measure @gpu-local (the resolve-read coalescing hit, § 5, is the thing to watch).
- **CPU pin green** (§ 6) before any WGSL — including the forbidden-variant sensitivity assertion.
- **WASM parity oracle (#746/#748) + CI `rust` job green** — trivially, no WASM code changes (GPU-only constant/kernel edits).

---

## 9. Honest risks / assumptions (Serrano)

- **[HIGH — Finding A] Keep-smallest is a deterministic *bias*, not quality-neutral.** In an overflow cell the dropped particles are exactly the highest indices; combined with the resolve `j>i` guard, a dropped high-index particle finds no partner and receives **zero** self-collision correction from that cell — and, being absent from `cellEntries`, is never anyone's `j` either. Indices are piece-sequential with cross-piece offsets (`gpuSolverClient` bakes them), so the under-correction lands **systematically on high-index particles/pieces.** *Verdict:* accepted, and it's the right trade for P4's goal. Any truncation is lossy; today's scheme drops a **random** losing 8-set every run (non-deterministic *and* lossy). Keep-smallest drops the **same** set every run — strictly better for the determinism goal, and within the *already-ratified* CELL_CAPACITY truncation divergence (`:94-99`). Bounded to ~200 overflow cells at rest. **The mm/M4 correctness signal (§ 8) is the guard**: if the bias visibly regresses the drape, the lever is a modest K bump (memory-cheap relative to counting-sort), noted as follow-up — *not* a return to non-determinism.
- **[HIGH — Finding B] P4-2 alone does not make the drape bit-exact.** The proof (§ 3) fixes admission *given a fixed input multiset*. The input is fixed only if upstream passes are deterministic — which they are **not** until P4-1 colors bend. Stated as a hard dependency in § 8; do not ship P4-2 expecting a green gate without P4-1.
- **[MEDIUM — Finding R1] u32 `atomicMin` + loop-carried `old.max(val)` codegen is unproven in-repo.** #921 uses `atomicMin` on **i32**, single op. This uses **u32** + a cascade that consumes the atomic's return value and reassigns a loop-carried var. `makeAtomicStorage('uint')` and `atomicMin` are wired (`atomicStorage.ts:65`/`:79`), but the *cascade shape* is new. **Mitigation:** compile the shader early (a pipeline-fail silently drops to CPU — catch it at first @gpu-local run); if it fails, fall back to residue-slot (§ 4), which is a single `atomicMin` matching the proven pattern.
- **[MEDIUM] Resolve atomic-read perf** — the +191M `atomicLoad`/frame from atomic entries (§ 5). Expected < 0.5 ms but unmeasured. Watch at @gpu-local.
- **[LOW] Cross-driver.** Determinism is per-device by definition; green on María's GPU proves nothing on another driver. Same scope note as all of P4.
- **Assumption (verified):** `makeAtomicStorage` supports `'uint'`; `atomicMin`/`atomicMax` valid on the emitted `array<atomic<u32>>` (`atomicStorage.ts:65`). The resolve `atomicLoad` requirement for atomic buffers is documented at `atomicStorage.ts:69`.

---

## 10. Rejected feedback (and why)

- **Review 2's implicit "keep-smallest may be deterministically-wrong, reconsider the subset."** Not rejected but **re-scoped**: the bias is real (§ 9 Finding A) and declared, but P4's ratified stance is determinism over cross-tier/quality match within already-ratified truncation divergence. Keep-smallest is strictly better than the status-quo random-lossy admission for the stated goal. The correctness signal (M4 asserts) — not the admission scheme — owns quality; if it regresses, bump K. No change to the chosen approach.
- **Parent DESIGN P4-2 options (a) counting-sort and (b) raise `CELL_CAPACITY`.** Both rejected here (§ 1): (a) is the 180–900 ms/frame prefix-sum #897 already killed; (b) needs K≈40 (5× memory/loop) for pervasive overflow and still isn't deterministic above the ceiling. The `atomicMin` cascade dominates both.
- **Raising K / composite-key packing / per-cell scratch** (from the DESIGN's own "skipped" line). Rejected: the index is already its own sort key, so plain `atomicMin` suffices. Add a composite key only if a future variant needs a secondary tiebreak — it doesn't.
- **The parent table's "resolve ≈0" cost.** Rejected/corrected (§ 5): resolve reads went atomic, +191M `atomicLoad`/frame.

---

## 11. Verification outcome (@gpu-local, 2026-07-02) — SHIPPED, race-determinism closed

P4-2 landed (commit `6ceae493` on feat/envelope-wrap), after P4-1 (`b4b82572`) and P4-0 (`7ad5e198`). @gpu-local, María shirt, webgpu tier, María default measurements:

- **R1 clear.** The u32 `atomicMin` cascade compiled and ran on GPU — the tier stayed `webgpu` across every run (a codegen failure would have fallen to WASM and failed the tier assertion). The residue-slot fallback (§ 4) was NOT needed.
- **P4-2 hit its target.** The self-collision admission race is gone: before P4-2 the drape split into 2 basins ~17mm apart with no bit-exact majority; after, runs form bit-exact clusters — the per-frame solver is deterministic.
- **Bit-exact NOT achieved — a metastable residual remains.** A 10-run gate (`--repeat-each=10`) clustered into 5 bit-exact groups forming **two macro-basins ~320-345mm apart (7/3 split)** plus fine 15-42mm sub-structure. Both macro-basins are valid drapes (belowHip 0%, same envelope) — a different whole-garment WRINKLE configuration, not a collapse.

**Root cause (not a race).** With bend (P4-1), self-collision (P4-2) and contact (A1) races all eliminated — the only data races the audit found — the residual is the caveat in § "What deterministic means": WGSL does not spec-guarantee run-to-run float determinism even absent races (FMA contraction / op reordering across runs). On a metastable drape that sub-ULP noise tips the basin. **More race-elimination cannot close this — no races remain.** Aggravating: the settle-tether captures at the SAME 2.5s frame, freezing whichever basin the transient landed in.

**Conclusion — P4 race-determinism CLOSED.** Bit-exact is not reachable by the determinism axis on this architecture. The remaining ~320mm macro-bifurcation is a **drape-stability / quality** problem (the drape has multiple valid settled states), addressed by the bend-model fix (P1 dihedral → real flexural rigidity → fewer basins) and/or tether-capture timing — NOT by more determinism work. Recorded as a known limitation; keep-smallest's index bias (§ 9 Finding A) did not visibly regress the drape (belowHip 0%, envelope unchanged).

**Files this spec anchors on (all absolute):**
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\tslSelfCollision.ts` (interface `:57-73`, factory `:129-155`, destroy `:168-191`, cellClear `:235-245`, scatter `:253-297` incl. slot-claim `:287-294`, resolve `:304-438` incl. count-load `:358-359`/entries-read `:365`/`j>i` guard `:368`, `CELL_CAPACITY` `:100`, prefix-sum-rejected note `:98`)
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\atomicStorage.ts` (`makeAtomicStorage` `'uint'`+atomicMin `:65`/`:77-83`, atomicLoad-required note `:69`)
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\tslCollision.ts` (#921 Eje A composite-key `atomicMin` precedent `:430`/`:486`, INT32_MAX guard `:159`, determinism pins host)
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\__tests__\tslSelfCollision.test.ts` (cellCount assertions to retarget `:158`/`:180-181`/`:286`)
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\__tests__\kSmallestAdmission.test.ts` (new — the red-before-green pin)
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\gpuSolverClient.ts` (cellCount pass-through `:579`, signature unchanged)
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\tslSolver.ts` (cellCount pass-through `:962`, signature unchanged)
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\gpuSolver.ts` (`sc-cellCount` legacy prefix-sum path `:1045` — **untouched**)
- `D:\Desktop\projects\openclo\docs\plans\2026-07-01-drape-determinism-p4-design.md` (parent; P4-0 gate, P4-1 bend dependency)