# Issue #463 — Validator edge-N fallback alignment plan

## Problem

`validateAndRepairProject()` currently validates seam edge names only against `piece.edges` when that metadata exists.

That is too strict for projects that use fallback seam references like `edge-0`, because other runtime paths already support that format:
- `SeamRenderer`
- `seamAssembly`

Result: a seam can be valid at render/solver time but still be quarantined during `loadProject()` with `SEAM_ORPHANED_EDGE`.

## Goal

Make project validation accept `edge-N` seam references when they resolve to a valid edge command index for the referenced piece outline.

## Non-goals

- No change to seam rendering behavior
- No change to solver matching logic beyond validator alignment
- No expansion of fallback formats beyond current `edge-N`

## Constraints

- Keep validator conservative: invalid `edge-N` references must still be quarantined
- Preserve current behavior for semantic edge names
- Avoid introducing duplicate edge-resolution logic in many places if a small helper can centralize it

## Proposed approach

### 1. Add a small edge reference validator helper

Create a local helper in `projectValidator.ts` or a shared utility if reuse becomes clean:
- input: `piece`, `edgeName`
- returns `true` when:
  - `edgeName` exists in `piece.edges`, or
  - `edgeName` matches `edge-N` and resolves to a valid drawable edge command index in `piece.outline`
- returns `false` otherwise

### 2. Define valid `edge-N` semantics clearly

Current renderer/solver behavior uses:
- `edge-0` → command index `1`
- generally `edge-N` → command index `N + 1`

Validator should mirror that exact mapping.

Validation rule for fallback:
- parse `N`
- compute command index = `N + 1`
- verify `getEdgeEndpoints(piece.outline, commandIndex)` returns non-null

That ensures the fallback points to a real edge segment, not just an arbitrary string.

### 3. Update seam validation

Replace the current `piece.edges` membership-only check with the new helper for both seam sides.

Expected behavior after change:
- semantic edge names still pass if present in `piece.edges`
- `edge-N` passes when it resolves against the outline
- unknown semantic names still fail
- out-of-range fallback names like `edge-999` still fail

### 4. Add focused tests

#### Unit tests for validator
Add tests in `src/utils/__tests__/projectValidator.test.ts` or the existing validator test file if present:

1. **accepts semantic seam edges**
2. **accepts `edge-0` fallback when piece has semantic edges metadata**
3. **accepts `edge-N` fallback when semantic edge list does not contain that literal name**
4. **rejects out-of-range `edge-N` fallback**
5. **rejects malformed fallback names** like `edge-x`
6. **still rejects missing semantic edge names**

#### Optional parity test
If there is already a seam assembly or renderer fallback test nearby, add a small comment or assertion linking expected semantics so future changes stay aligned.

## Implementation steps

1. Inspect existing validator tests
2. Add failing tests for `edge-N` acceptance/rejection
3. Implement helper and wire it into seam validation
4. Run targeted unit tests
5. Run TypeScript + relevant seam/path tests
6. If clean, optionally run the new Playwright seam E2E again as parity smoke test

## Test plan

### Minimum
- `npx vitest run src/utils/**/projectValidator*.test.ts`
- `npx vitest run src/utils/geometry/__tests__/path.test.ts`
- `npx tsc --noEmit`

### Stronger confidence
- `npx vitest run src/store/__tests__/projectSlice.sewing.test.ts`
- `npx playwright test tests/e2e/seam-curved-edges.spec.ts`

## Risks

### Risk: validator becomes too permissive
Mitigation:
- only accept exact `edge-N` pattern
- require `getEdgeEndpoints()` to resolve successfully

### Risk: fallback semantics diverge again later
Mitigation:
- mirror the same `N + 1` mapping used by renderer/solver
- document that mapping in test names/comments

## Expected outcome

Projects loaded through `loadProject()` will preserve valid fallback seam references instead of quarantining them, bringing validator behavior into line with the renderer and solver.
