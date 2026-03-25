# Garment Information & File Operations

**Issue:** #378
**Date:** 2026-03-25

## Problem

Projects only have a name. No way to attach garment-level metadata (brand, season, style number, designer) needed for production handoff and professional workflows.

## Design

### Data Model (`src/types/types.ts`)

```typescript
export interface GarmentInfo {
  brand?: string;
  season?: string;
  styleNumber?: string;
  designer?: string;
  date?: string;
  notes?: string;
  description?: string;
}
```

Add to `OpenCloProject` serialized type. Add `garmentInfo: GarmentInfo` to `ProjectState` (default `{}`).

### Redux (`projectSlice.ts`)

- `setGarmentInfo({ field, value })` — update a single field
- `setGarmentInfoBulk(info)` — replace entire object

### Save/Load (`projectIO.ts`)

- `stateToProject()` includes `garmentInfo`
- Load defaults to `{}` for old projects without it

### UI (`ProjectView.tsx`)

Expand the existing project info section with fields:
- Brand (text input)
- Season (text input)
- Style Number (text input)
- Designer (text input)
- Date (text input)
- Notes (textarea)

All fields dispatch `setGarmentInfo` on change.

### DXF Export

New `GARMENT_INFO` layer. Emit metadata as text block at the top-left of the export area.

### Copilot Tools

- `setGarmentInfo` — `{ brand?, season?, styleNumber?, designer?, date?, notes? }`
- `getGarmentInfo` — return all metadata fields

### Files

| File | Change |
|------|--------|
| `src/types/types.ts` | GarmentInfo interface, add to OpenCloProject |
| `src/store/projectSlice.ts` | garmentInfo state + 2 reducers |
| `src/utils/projectIO.ts` | Serialize/deserialize garmentInfo |
| `src/components/views/ProjectView.tsx` | Metadata form fields |
| `src/utils/exportDXF.ts` | GARMENT_INFO layer |
| `src/copilot/action/tools/definitions/garmentInfoTools.ts` | NEW: 2 tools |
| `src/copilot/action/tools/registry.ts` | Register tools |
