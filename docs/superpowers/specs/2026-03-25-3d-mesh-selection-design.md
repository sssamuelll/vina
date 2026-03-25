# 3D Mesh Selection — Box & Lasso

**Issue:** #371
**Date:** 2026-03-25

## Problem

No way to select 3D mesh vertices/faces in the viewport. Needed for bulk pinning, regional property application, and targeted grab/steam operations.

## Design

### Tool Definitions

**meshSelectBox** — drag rectangle to select vertices:
- Shortcut: `v`, group: `3d-arrange`, cursor: `crosshair`
- Options: `mode` select (replace/add/subtract)
- SubTools: `['meshSelectBox', 'meshSelectLasso']`

**meshSelectLasso** — freeform polygon selection:
- Hidden subtool of meshSelectBox (flyout only)
- Same options

### Redux State (`simulationSlice`)

```typescript
selectedVertices: number[];           // selected vertex indices
selectBox3D: { startX: number; startY: number; currentX: number; currentY: number } | null;
selectLasso3D: { x: number; y: number }[] | null;
```

Actions: `setSelectedVertices`, `addSelectedVertices`, `clearSelectedVertices`, `setSelectBox3D`, `setSelectLasso3D`

### Interaction (`GarmentSimulation.tsx`)

**Box select:**
1. PointerDown records screen start position
2. PointerMove updates box rectangle (screen space)
3. PointerUp: project all cloth vertices to screen space via camera, select those inside the 2D rect

**Lasso select:**
1. PointerDown adds polygon point
2. PointerMove updates preview line to cursor
3. Double-click or close-to-start completes polygon, selects vertices inside

**Vertex projection:** For each vertex in `positionsRef.current`, project to NDC via `camera.matrixWorldInverse` + `camera.projectionMatrix`, convert to screen coords, test containment.

**Shift modifier:** Adds to existing selection instead of replacing.

### Visual Feedback

**Box overlay:** Screen-space `<div>` with dashed blue border overlaid on canvas (not in 3D scene).

**Lasso overlay:** Screen-space SVG polygon overlaid on canvas.

**Selected vertices:** `SelectedVertexRenderer` component — renders small cyan points at selected vertex positions using Three.js Points with a BufferGeometry. Updates when `selectedVertices` or positions change.

### Copilot Tool

`selectVerticesInRegion` — programmatic selection:
- Params: `{ region: 'all' | { center: {x,y,z}, radius: number } }`
- Selects vertices within a 3D sphere or all vertices

### Files

| File | Change |
|------|--------|
| `src/store/simulationSlice.ts` | Selection state + actions |
| `src/tools/definitions/meshSelect.tsx` | NEW: box + lasso tool defs |
| `src/tools/index.ts` | Register new tools |
| `src/components/Viewport3D/GarmentSimulation.tsx` | Box/lasso handlers |
| `src/components/Viewport3D/SelectionOverlay.tsx` | NEW: screen-space box/lasso overlays |
| `src/components/Viewport3D/SelectedVertexRenderer.tsx` | NEW: 3D vertex highlights |
| `src/copilot/action/tools/definitions/meshSelectionTools.ts` | NEW: copilot tool |
| `src/copilot/action/tools/registry.ts` | Register |
