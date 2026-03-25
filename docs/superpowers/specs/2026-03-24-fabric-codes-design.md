# Fabric Codes on Pieces

**Issue:** #259
**Date:** 2026-03-24

## Problem

Pattern pieces lack production classification. Without fabric codes, DXF exports are just geometry — the cutting room doesn't know which fabric to cut each piece from.

## Design

### Data Model

Add `fabricCode?: string` to `PatternPiece` in `src/types/types.ts`.

Standard codes (exported as constant):
```typescript
export const STANDARD_FABRIC_CODES = [
  'SELF', 'LINING', 'INTERLINING', 'CONTRAST-1', 'CONTRAST-2', 'FUSIBLE',
] as const;
```

Color map for 2D visualization:
```typescript
export const FABRIC_CODE_COLORS: Record<string, string> = {
  'SELF': '#4a9eff',
  'LINING': '#ff6b9d',
  'INTERLINING': '#ffa64a',
  'CONTRAST-1': '#9d6bff',
  'CONTRAST-2': '#6bffa6',
  'FUSIBLE': '#ff4a4a',
};
```

Default: `'SELF'` for new pieces.

### Redux (`projectSlice.ts`)

- `setFabricCode(state, { pieceId, fabricCode })` — single piece
- `batchSetFabricCode(state, { pieceIds, fabricCode })` — multi-piece
- `addPiece` — default `fabricCode: 'SELF'` if not provided

### UI

**PieceProperties.tsx**: Add dropdown after fabric select with standard codes + custom free-text input.

**PieceRenderer.tsx**: Small colored dot or left-border accent based on `fabricCode` color (similar to existing layer indicator pattern).

### DXF Export

Add `FABRIC_CODE` layer. For each piece, emit a text entity with the piece's fabricCode at the piece label position.

### Copilot Tools

**`setFabricCode`**: `{ pieceId?: string, pieceIds?: string[], fabricCode: string }` — set on one or many pieces.

**`getFabricCodes`**: `{}` — list all pieces with their fabric codes, grouped by code.

Both registered in `fabricTools.ts`, auto-collected by registry.

### Files to modify

| File | Change |
|------|--------|
| `src/types/types.ts` | Add `fabricCode?` to PatternPiece |
| `src/utils/fabricCodes.ts` | NEW: constants + color map |
| `src/store/projectSlice.ts` | Add reducers, default in addPiece |
| `src/components/PropertiesPanel/PieceProperties.tsx` | Fabric code dropdown |
| `src/components/PatternEditor/renderers/PieceRenderer.tsx` | Color-coded accent |
| `src/utils/exportDXF.ts` | FABRIC_CODE layer + text |
| `src/copilot/action/tools/definitions/fabricTools.ts` | 2 new tools |
| `src/copilot/__tests__/compoundTools.test.ts` | Update tool count |
| `src/copilot/__tests__/toolsE2E.test.ts` | Update tool count |
