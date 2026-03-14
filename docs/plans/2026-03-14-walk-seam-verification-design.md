# Walk Seam Verification — Design Doc

**Issue:** #254
**Date:** 2026-03-14
**Status:** Approved

## Goal

Interactive tool that lets users walk along sewn edges to verify length matching, ease distribution, and notch alignment — matching CLO3D/Gerber AccuMark "Walk Pattern" behavior.

## Architecture

SVG Ghost Transform approach: the mobile piece renders as a semi-transparent SVG ghost that translates+rotates along the stationary edge as the user hovers. Pure SVG — no canvas or WebGL. Reuses existing `PieceRenderer` patterns and arc-length infrastructure from the measure tools.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Entry mode | Both: auto-discover from Seam data + Shift for manual | Covers both sewn and unsewn edge verification |
| Ghost preview | Full piece at 30% opacity | Matches CLO3D/Gerber industry standard |
| Tolerance | 3mm default (configurable 1/3/5mm) | Industry standard for woven garments |
| Rendering | SVG `<g>` with transform | Fits existing all-SVG architecture |
| Approach | SVG Ghost Transform | Best balance of fidelity and simplicity |

## Interaction Model

### Two Entry Modes

**Auto mode (default):** Click an edge → hook searches `seams[]` for a Seam referencing that edge name and piece. If found, the paired piece becomes the mobile ghost automatically.

**Manual mode (Shift+click):** Click edge A on any piece, then Shift+click edge B on any piece. No seam data required.

### Walk Behavior

Once both edges are established:
- **Stationary piece** stays in place, matched edge highlighted in blue
- **Mobile piece** renders as 30% opacity ghost
- Cursor movement along stationary edge drives walk position
- Ghost translates+rotates so mobile edge aligns at cursor arc-length position
- Edge tangent alignment ensures smooth rotation

### Controls

- `Escape` — clear walk, deselect edges
- Mouse hover along stationary edge — drives walk position
- Click during walk — place persistent measurement marker

## Ghost Piece Transform Math

At hover distance `d` along stationary edge:

1. `pointAtPathDistance(stationaryOutline, d, segRange)` → point `Ps` + tangent `Ts`
2. `pointAtPathDistance(mobileOutline, d, segRange)` → point `Pm` + tangent `Tm`
3. Rotation: `θ = atan2(Ts.y, Ts.x) - atan2(Tm.y, Tm.x)`
4. Translation: `Ps - rotate(Pm + mobilePosition, θ)`
5. SVG: `<g opacity="0.3" transform="translate(tx, ty) rotate(θ_deg, pivotX, pivotY)">`

Tangent via finite difference: `tangent(d) = normalize(point(d + ε) - point(d - ε))` where `ε = 0.5mm`.

## Mismatch Visualization

Sample both edges at 5mm intervals. At each sample, compute `delta = |dA - dB|`:
- **Green:** delta < tolerance (default 3mm)
- **Yellow:** tolerance ≤ delta < 2× tolerance
- **Red:** delta ≥ 2× tolerance

Rendered as thick colored polyline segments on both edges.

## Metrics Panel

Floating SVG panel showing:

| Metric | Example | Description |
|--------|---------|-------------|
| Edge A | 125.3 mm | Stationary edge arc-length |
| Edge B | 128.1 mm | Mobile edge arc-length |
| Delta | +2.8 mm | B - A |
| Ease | +2.2% | (delta / A) × 100 |
| Walk | 63.2 mm | Current hover position |

## Tool Options

- **Tolerance:** 1mm / 3mm (default) / 5mm — select dropdown
- **Ghost Opacity:** 10–80% slider, default 30%

## File Changes

| File | Action |
|------|--------|
| `src/tools/definitions/walkSeam.tsx` | Create — tool definition |
| `src/tools/definitions/index.ts` | Modify — register walkSeam |
| `src/components/PatternEditor/useWalkSeamTool.ts` | Create — hook |
| `src/components/PatternEditor/renderers/overlays/WalkSeamOverlay.tsx` | Create — overlay |
| `src/components/PatternEditor/renderers/ToolOverlay.tsx` | Modify — add walkSeam props + conditional |
| `src/components/PatternEditor/PatternEditor.tsx` | Modify — wire useWalkSeamTool |
| `src/components/PatternEditor/useEditorInteractions.ts` | Modify — cursor + dispatch |
| `src/components/PatternEditor/__tests__/useWalkSeamTool.test.ts` | Create — unit tests |
| `src/shortcuts/defaults.ts` | Modify — add shortcut |

## Reused Infrastructure

- `computePathArcLength`, `pointAtPathDistance`, `samplePathAtIntervals` from `arcLength.ts`
- `snapToOutline`, `findEdgeForSegment`, `buildEdgeInfo` from `useMeasureTool.ts`
- `MeasurementLabel`, `EdgeHighlight`, `WalkDot` patterns from `MeasureToolOverlay.tsx`
- `PieceRenderer` SVG rendering for ghost piece
- `toolRegistry` registration pattern
