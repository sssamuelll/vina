# Edit Pattern (Z) Polish — Design Document

**Issue:** #141 — Refactor Edit Pattern (Z) — sub-element selection
**Date:** 2026-03-04
**Status:** Approved

## Background

The Edit Pattern (Z) tool was implemented via `2026-03-03-edit-pattern-tool-design.md`. Most of Issue #141's requirements (sub-selection, segment selection, visual feedback, marquee, add point) are already working. This design addresses the remaining quality gaps.

## Scope

Three targeted improvements:

### 1. Bezier-Accurate Segment Hit Testing

**Problem:** `nearestSegment()` computes distance to the chord (straight line between anchors) for C/Q commands, not the actual curve. Clicks on visible bezier arcs that are far from the chord don't register.

**Solution:** Sample bezier curves at N points (20 for cubic, 10 for quadratic) using de Casteljau evaluation. Compute distance to the resulting polyline segments instead of the chord.

**Files:** `src/components/PatternEditor/nodeEditorUtils.ts`

### 2. Closing Segment Overlay

**Problem:** The closing segment (last anchor → first anchor via Z command) doesn't render hover/selection highlights in `EditPatternOverlay`. The loop iterates over outline commands but Z has no geometry to draw.

**Solution:** After the main loop, render the closing segment (last anchor → M anchor) when it's hovered or selected.

**Files:** `src/components/PatternEditor/renderers/overlays/EditPatternOverlay.tsx`

### 3. Add-Point Cursor Feedback

**Problem:** Users don't know they can double-click to add a point on a hovered edge. The cursor shows `pointer` which signals click-to-select, not add-point.

**Solution:** When `addPointPreview` is set (hovering an edge, no node hovered, no segment selected), change cursor to `cell` (the "+" cursor). This signals "click here to add."

**Files:** `src/components/PatternEditor/useEditPattern.ts`
