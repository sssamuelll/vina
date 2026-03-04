# Standard 3D Navigation — Design Document

**Issue:** #138 — Standard 3D Navigation (Numpad resets + Focus F)
**Date:** 2026-03-04
**Status:** Approved

## Goal

Implement CLO3D-standard 3D camera navigation: 8 numpad view presets (front, back, left, right, top, bottom, 3/4 right, 3/4 left) and Focus (F) to zoom-to-fit the selected piece. Integrate with copilot so the LLM can set camera views programmatically.

---

## 1. Camera View Presets

All views orbit around a fixed target `[0, 0.75, 0]` at distance 2.8 (default). Animated with 250ms lerp.

| Key | View | Camera Position |
|-----|------|-----------------|
| Numpad 2 | Front | `(0, 0.75, 2.8)` |
| Numpad 8 | Back | `(0, 0.75, -2.8)` |
| Numpad 4 | Right | `(2.8, 0.75, 0)` |
| Numpad 6 | Left | `(-2.8, 0.75, 0)` |
| Numpad 5 | Top | `(0, 3.55, 0)` |
| Numpad 0 | Bottom | `(0, -2.05, 0)` |
| Numpad 1 | 3/4 Right | `(2.0, 0.75, 2.0)` |
| Numpad 3 | 3/4 Left | `(-2.0, 0.75, 2.0)` |

---

## 2. Focus (F)

- **With selection:** Compute the selected piece's 3D bounding box, move camera target to the box center, set distance to frame the bounding sphere. Animate with 250ms lerp.
- **Without selection:** No action (CLO3D behavior).

---

## 3. Architecture

### Hook: `useCameraPresets`

New hook in `src/components/Viewport3D/useCameraPresets.ts`:
- Takes `orbitRef` (OrbitControls ref)
- Provides `setCameraView(preset)` and `focusOnSelection()`
- Uses `requestAnimationFrame` lerp for smooth 250ms transitions
- No new dependencies

### Redux: `cameraSlice`

New slice `src/store/cameraSlice.ts` to bridge copilot → viewport:
- `setCameraPreset(preset)` — sets a pending preset request
- `focusOnPiece(pieceId)` — sets a pending focus request
- `clearCameraRequest()` — clears after the hook consumes it

The `useCameraPresets` hook watches the slice state. When a request appears, it animates and clears.

### Keyboard Handling

In `Viewport3D.tsx`, extend the existing `useEffect` keydown handler to check for numpad keys and F.

---

## 4. Copilot Integration

New tool `setCameraView` in `3dInteractionTools.ts`:

```typescript
{
  name: 'setCameraView',
  description: 'Set the 3D camera to a preset view or focus on a specific piece.',
  parameters: {
    type: 'object',
    properties: {
      view: {
        type: 'string',
        enum: ['front', 'back', 'left', 'right', 'top', 'bottom', 'threeQuarterLeft', 'threeQuarterRight'],
        description: 'Camera view preset',
      },
      focusPieceId: {
        type: 'string',
        description: 'Piece ID to focus/zoom on (instead of view preset)',
      },
    },
  },
}
```

Dispatches `setCameraPreset` or `focusOnPiece` from the camera slice. The viewport hook picks up the request and animates.

---

## 5. Files

| File | Action |
|------|--------|
| `src/components/Viewport3D/useCameraPresets.ts` | Create — preset positions, lerp animation, focus logic |
| `src/store/cameraSlice.ts` | Create — camera request state for copilot bridge |
| `src/store/index.ts` | Modify — add cameraSlice reducer |
| `src/components/Viewport3D/Viewport3D.tsx` | Modify — wire hook + numpad/F keyboard handlers |
| `src/copilot/action/tools/definitions/3dInteractionTools.ts` | Modify — add setCameraView tool |
