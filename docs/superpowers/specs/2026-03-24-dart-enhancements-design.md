# Dart Enhancements — Segment Darts & Shape Dart Cap

**Issue:** #366
**Date:** 2026-03-24

## Problem

The existing dart tool creates basic V-shaped darts. Two CLO3D-parity features are missing:
1. **Segment Darts**: Distribute intake across multiple smaller darts along an edge
2. **Shape Dart Cap**: Reshape the dart tip (pointed, curved, flat, diamond)

## Design

### Data Model Changes

**`src/types/types.ts`**:
- Add `dartOptions?: DartOptions` to `InternalLine` (follows `notchOptions`/`topstitchOptions` pattern)
- Add `DartOptions` interface: `{ capShape?: 'pointed' | 'curved' | 'flat' | 'diamond' }`
- Add `capShape` field to `Dart` entity type

### Segment Darts

New function in `dartEntity.ts`:

```typescript
segmentDart(
  piece: PatternPiece,
  dartId: string,
  segments: number  // 2–6
): InternalLine[]
```

Algorithm:
1. Find the original dart in `piece.internals`
2. Extract its `Dart` entity (intake, apex, legs, edge position)
3. Compute the base edge segment the dart sits on
4. Divide intake equally: `segmentIntake = originalIntake / segments`
5. Space N darts evenly along the edge segment
6. For each: build a V-shaped `InternalLine` path with `segmentIntake` width and proportionally scaled depth
7. Return N new `InternalLine` entries

The caller (copilot tool or UI handler) removes the original dart and adds the N replacements.

### Shape Dart Cap

New function in `dartEntity.ts`:

```typescript
shapeDartCap(
  dart: Dart,
  capShape: 'pointed' | 'curved' | 'flat' | 'diamond'
): PathCommand[]
```

Geometry per shape:
- **pointed** (default): `M(base1) L(apex) L(base2)` — standard V
- **curved**: `M(base1) L(nearApex1) C(cp1, cp2, nearApex2) L(base2)` — cubic bezier replacing the tip vertex, control points offset perpendicular to dart axis
- **flat**: `M(base1) L(flatLeft) L(flatRight) L(base2)` — replace apex with a horizontal segment (width = intake * 0.3)
- **diamond**: `M(base1) L(midLeft) L(apex) L(midRight) L(base2)` — add side vertices at 60% depth

Returns the new `PathCommand[]` for the `InternalLine.path`.

### Copilot Tools

Two new tools in `dartTools.ts`:

**`segmentDart`**:
- Params: `{ pieceId: string, dartId: string, segments: number }`
- Validates: piece exists, dart exists, segments in 2–6
- Executes: remove original dart, add N new darts via `removeInternalLine` + `addInternalLine`
- Rollback: dispatch `updatePiece` with original piece snapshot

**`shapeDartCap`**:
- Params: `{ pieceId: string, dartId: string, capShape: 'pointed' | 'curved' | 'flat' | 'diamond' }`
- Validates: piece exists, dart exists
- Executes: compute new path, update `InternalLine` path + set `dartOptions.capShape`, dispatch `updateInternalLine`
- Rollback: dispatch with original path

Both auto-registered via existing `ALL_TOOL_MODULES` pattern in `registry.ts`.

### 2D Tool UI

Extend existing dart tool options in `src/tools/definitions/dart.tsx`:
- Add `capShape` dropdown option: `{ id: 'capShape', type: 'select', options: ['pointed', 'curved', 'flat', 'diamond'], value: 'pointed' }`
- Add `segments` number option: `{ id: 'segments', type: 'number', min: 1, max: 6, value: 1 }` (1 = no segmenting)

### Rendering

No rendering changes needed. `InternalLineRenderer` already renders dart paths from `InternalLine.path`. Cap shapes and segmented darts just produce different path geometry — rendering is automatic.

### Files to create/modify

| File | Action |
|------|--------|
| `src/types/types.ts` | Add `DartOptions`, `dartOptions?` field, `capShape` on `Dart` |
| `src/utils/dartEntity.ts` | Add `segmentDart()`, `shapeDartCap()` |
| `src/utils/__tests__/dartEntity.test.ts` | Tests for both functions |
| `src/copilot/action/tools/definitions/dartTools.ts` | Add 2 new tool definitions |
| `src/tools/definitions/dart.tsx` | Add `capShape` + `segments` options |

## Acceptance Criteria

- [ ] `segmentDart` splits a dart into 2–6 evenly spaced darts along the edge
- [ ] `shapeDartCap` produces correct geometry for all 4 cap shapes
- [ ] Both copilot tools registered and callable
- [ ] 2D tool options include capShape dropdown and segments count
- [ ] Unit tests for geometry functions
- [ ] Type-checks clean, all existing tests pass
