# Texture Tiling — Per-Piece UV Controls

**Issue:** #376
**Date:** 2026-03-24

## Problem

UV repeat/rotation controls exist but lack offset for print alignment, the UI is bare number inputs, and there's no copilot tool for texture manipulation.

## Design

### 1. UV Offset Support

Extend `pieceUVTransforms` in `simulationSlice.ts`:

```typescript
pieceUVTransforms: Record<string, {
  repeatX: number;    // existing
  repeatY: number;    // existing
  rotation: number;   // existing
  offsetX: number;    // NEW — 0.0–1.0
  offsetY: number;    // NEW — 0.0–1.0
}>;
```

Default: `{ repeatX: 4, repeatY: 4, rotation: 0, offsetX: 0, offsetY: 0 }`

Apply in `GarmentSimulation.tsx` UV effect:
```typescript
tex.offset.set(effectiveUV.offsetX, effectiveUV.offsetY);
```

Also apply to TSL material path in the surface mode effect.

### 2. MaterialTab UI Improvements

Replace bare number inputs with:
- **Repeat sliders**: repeatX/Y (0.1–20, step 0.5) with numeric readout
- **Offset sliders**: offsetX/Y (0–1, step 0.05) for print positioning
- **Rotation slider**: 0–360° (step 15)
- **Preset buttons**: "1x1", "2x2", "4x4", "8x8" for quick repeat setting
- **Lock aspect toggle**: sync repeatX/Y when locked

### 3. Copilot Tool

`setTextureRepeat` in `fabricTools.ts`:
- Params: `{ pieceId, repeatX?, repeatY?, rotation?, offsetX?, offsetY? }`
- Partial updates (only provided fields change)
- Rollback with previous UV state

### Files to modify

| File | Change |
|------|--------|
| `src/store/simulationSlice.ts` | Add offsetX/Y to UV transform type + reducer |
| `src/components/Viewport3D/GarmentSimulation.tsx` | Apply tex.offset in UV effect + TSL effect |
| `src/components/PropertiesPanel/MaterialTab.tsx` | Sliders, presets, lock toggle, offset controls |
| `src/copilot/action/tools/definitions/fabricTools.ts` | setTextureRepeat tool |

### Out of scope

- 2D tiling preview (SVG can't efficiently render bitmap tiling)
- Seam-matching UV alignment (future feature)
