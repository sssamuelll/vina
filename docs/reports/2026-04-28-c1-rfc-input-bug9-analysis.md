# C1 RFC input — BUG-9 leak sites and inline-fix shapes

**Status:** input data for the C1 (Buffer lifecycle Three.js) RFC. **Not** a canonical proposal. Captured during BUG-9 (#612) inline-fix work so the API surface a future helper has to cover is recorded against real code, not against a hypothetical.

**Source commit:** the BUG-9 inline `.dispose()` fix that landed alongside this doc.

---

## Why this exists

BUG-9 fix landed inline `useEffect(() => () => geo.dispose(), [geo])` cleanups at 5 sites instead of extracting a helper. Sam's reasoning, recorded verbatim:

> La regla "stop si pide helper" no es prohibición de fixear con 5 sitios — es un trigger para que vos pares y yo decida. Vos paraste correctamente. Mi decisión es proceder porque inline 5× no introduce abstracción y por ende no cementa nada que C1 tenga que revertir.

> Si C1 decide canónico = useDisposableGeometry(factory, deps), migrar 5 inline a 5 calls al helper es find-and-replace mecánico. Cero rework arquitectónico.

The pre-fix scope check that BUG-9 surfaced is exactly the input data C1 will need: how many sites, what shapes they have, what variations exist beyond the simplest case. This doc captures that.

---

## The 5 leak sites

All 5 sites are `useMemo` blocks in `src/components/Viewport3D/` that produce `THREE.BufferGeometry` (or subclass) instances and previously had no cleanup → GPU memory leak proportional to dependency-change frequency.

### Site 1 — `Mannequin.tsx:95-101` (bodyGeometry)

- **Type:** `THREE.LatheGeometry` (extends `BufferGeometry`).
- **Lifecycle:** `useMemo` + deps `[measurements]`. Recomputes when avatar measurements change.
- **Nullability:** non-null. Always returns a geometry.
- **Return shape:** `geo` directly.
- **Inline fix shape:** pure recipe. `useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry])`.

### Site 2 — `Mannequin.tsx:103-108` (standGeometry)

- **Type:** `THREE.LatheGeometry`.
- **Lifecycle:** `useMemo` + deps `[]`. Stable forever; only disposes on unmount.
- **Nullability:** non-null.
- **Return shape:** `geo` directly.
- **Inline fix shape:** pure recipe (deps array empty means cleanup only fires on unmount, but the same recipe applies).

### Site 3 — `FloorGrid.tsx:57-67` (fineGeo + sectionGeo)

- **Type:** Two `THREE.BufferGeometry` instances (fine grid + section grid).
- **Lifecycle:** **One** `useMemo` produces both. Deps `[size, cellSize, sectionEvery]`. They always change together because they share the same dep array and are built in the same memo.
- **Nullability:** non-null.
- **Return shape:** `{ fineGeo, sectionGeo }` — multi-geo coupled pair.
- **Inline fix shape:** **Variation 1A** — single `useEffect` covering both:
  ```typescript
  useEffect(() => () => { fineGeo.dispose(); sectionGeo.dispose(); }, [fineGeo, sectionGeo]);
  ```
  Two independent useEffects (one per geo) was rejected because it would fictionalize the lifecycle: in this code, the two geos are a unit, not independent.

### Site 4 — `PieceMesh.tsx:107-127` (geometry)

- **Type:** `THREE.ShapeGeometry | null`.
- **Lifecycle:** `useMemo` + deps `[piece.outline]`. Recomputes when the piece's outline changes.
- **Nullability:** **Yes.** The memo returns `null` when `commandsToShape(piece.outline)` returns null (degenerate outline).
- **Return shape:** nullable single geo.
- **Inline fix shape:** **Variation 2B** — optional chaining one-liner:
  ```typescript
  useEffect(() => () => { geometry?.dispose(); }, [geometry]);
  ```
  Early-return guard (`if (!geometry) return; return () => geometry.dispose();`) was rejected for being multi-statement on conceptually single operation.

### Site 5 — `GarmentSimulation.tsx:197-266` (staticGeometry)

- **Type:** `THREE.BufferGeometry | null`.
- **Lifecycle:** `useMemo` + deps `[pieceMeshes, activePieces, avatarMeasurements]`.
- **Nullability:** **Yes.** Returns `{ staticGeometry: null }` when `pieceMeshes.length === 0`.
- **Return shape:** **Wrapper object** `{ staticGeometry: T | null }`. The destructured value is what gets disposed.
- **Inline fix shape:** **Variation 2B** — same as PieceMesh:
  ```typescript
  useEffect(() => () => { staticGeometry?.dispose(); }, [staticGeometry]);
  ```

---

## Variation summary for C1 helper API design

| Variation | Sites | Shape |
|---|---|---|
| **Pure recipe** (single non-null geo) | Site 1, Site 2 | `useEffect(() => () => g.dispose(), [g])` |
| **Multi-geo coupled** (two geos from one useMemo) | Site 3 | `useEffect(() => () => { a.dispose(); b.dispose(); }, [a, b])` |
| **Nullable** (geo can be null on degenerate input or empty state) | Site 4, Site 5 | `useEffect(() => () => { g?.dispose(); }, [g])` |

**Distribution:** 2 / 5 = pure recipe, 1 / 5 = multi-geo, 2 / 5 = nullable.

---

## Implications for the C1 canonical helper

A helper that only handles the "pure recipe" case (single non-null geo) leaves 3 of 5 sites stuck on inline patterns:

```typescript
// The naive helper signature:
function useDisposableGeometry<T extends THREE.BufferGeometry>(
  factory: () => T,
  deps: React.DependencyList,
): T;
```

This signature covers Sites 1 and 2 cleanly. It does NOT cover Sites 3, 4, 5 without:
- **Site 3 (multi-geo coupled):** caller would have to call the helper twice, but the two geos share a dep array and are built together — calling twice forces splitting one useMemo into two, which (a) duplicates the dep array and (b) decouples geos that are coupled in reality.
- **Site 4 (nullable):** caller would have to either accept the helper signature `T` and have the factory throw on null (bad), or wrap with a separate null check and not use the helper for nullable cases.
- **Site 5 (nullable + wrapper object):** same as Site 4 plus the wrapper-object destructure.

### Possible C1 directions to evaluate (input only — not a recommendation)

1. **Generalized helper accepting a tuple/array of geos:** `useDisposableGeometries(factory: () => T[], deps): T[]` — handles Sites 1, 2, 3 uniformly. Doesn't cover Sites 4, 5 (nullable) without further work.
2. **Nullable-aware variant:** `useDisposableGeometry<T>(factory: () => T | null, deps): T | null` — handles Sites 1, 2, 4 but not 3 or 5's wrapper.
3. **Hook returns a disposer ref instead of a value:** caller computes the geometry however they like (single, multi, nullable, wrapper) and the hook just registers a disposer. Most flexible, least magical.
4. **Two-tier API:** simple helper for the common case (Sites 1, 2), a lower-level escape hatch for variations (Sites 3, 4, 5). Mirrors the way RTK exposes `createSlice` (high-level) and `createReducer` (low-level).
5. **No helper at all — keep inline as canonical.** Sites 3, 4, 5's variations argue against forced uniformity. C1 could ratify the inline pattern as the canonical and document the three variations as legitimate.

C1 RFC will choose. This doc just constrains the choice space with concrete shapes.

---

## What the inline fix landing now does NOT prejudge

- **Helper API surface.** Inline doesn't establish or block any of the 5 directions above.
- **Naming.** `useDisposableGeometry`, `useGeometryLifecycle`, `useDisposable`, etc. — open.
- **Whether the helper lives in `src/utils/` vs `src/components/Viewport3D/hooks/` vs co-located.** Open.
- **Whether the helper handles non-geometry disposables** (materials, textures, render targets — Three.js has many disposable resources). The 5 sites only deal with geometries, but the same lifecycle bug exists for materials and textures in the same components. C1 should consider whether to scope the helper to geometries or to disposables in general.

---

## Test coverage status post-BUG-9

- **Site 1 (Mannequin bodyGeometry):** dedicated regression test in `src/components/Viewport3D/__tests__/Mannequin.test.tsx` verifying that changing `measurements` disposes the previous `LatheGeometry`. This is the representative test Sam approved.
- **Sites 2, 3, 4, 5:** comments inline (`// BUG-9 (#612): inline dispose pending C1 canonical pattern`) but no per-site test. When C1 lands, these get rewritten around the canonical helper's tests; the per-site granularity isn't worth the test-mocking cost given imminent refactor.

---

## Pointers for the C1 RFC author

When opening C1 RFC:
- This doc is the input section for the BUG-9 leak sites and their variations.
- Cross-reference: BUG-9 (#612), commit landing the inline fix, and the corresponding `Mannequin.test.tsx` regression test.
- Adjacent fix that touched the same area: BUG-1 fix (#604, commit ed632b9) added the WASM-side `bendRestDistances` helper as a localized adapter — different concern (WASM bridge) but shows the project's preferred shape for "small adapter at the boundary" vs "shared helper across many sites".
- The audit's drift inventory at `docs/reports/2026-04-28-drift-inventory-fase1.md` axis C1 (Buffer lifecycle Three.js) is what this RFC formalizes.
