# DXF Import Completion — Design Document

**Issue:** #107 — Import DXF-AAMA / Gerber / Lectra industrial pattern formats

**Goal:** Complete the remaining 3 gaps in the DXF-AAMA import pipeline: Import UI Dialog, robust notch parsing, and copilot integration.

**Context:** Phase 1 (DXF-AAMA parser + converter) is complete and tested with real industrial patterns (model 5000). Legacy POLYLINE with VERTEX entities is already supported. What remains is UX polish and integration.

---

## 1. Import DXF Dialog

A compact modal (CLO3D-style) that appears after file selection, before importing.

### Options

| Control | Type | Default | Values |
|---------|------|---------|--------|
| Load Type | radio | Add | Open (replace project) / Add (append pieces) |
| Unit | dropdown | Auto | mm / cm / inch / Auto |
| Scale | number input | 100 | Percentage (%) |
| Import notches | checkbox | on | — |
| Import grainlines | checkbox | on | — |
| Import internal lines | checkbox | on | — |

### Piece Summary

Read-only text showing parsed results: "4 pieces detected: Front, Back, Sleeve, Neck binding"

### Auto Unit Detection

Reads `$INSUNITS` from DXF header:
- 1 = inches, 2 = feet, 4 = mm, 5 = cm
- Missing/unknown → default mm

### Scale Application

All coordinates multiplied by `(scale / 100) * unitFactor` where unitFactor = `{ mm: 1, cm: 10, inch: 25.4 }`.

### Component

- File: `src/components/ImportDXFDialog/ImportDXFDialog.tsx`
- Integration: `FileExplorerView.tsx` — file selection opens dialog instead of importing directly
- Props: parsed DXFDocument, onImport callback, onCancel callback

---

## 2. Robust Notch Logic

Currently notches are extracted only from TEXT entity positions on AAMA layer 4. Geometric entities on layer 4 should also produce notches.

### Geometry Notch Detection

LINE, LWPOLYLINE, POLYLINE entities on layer 4 with total length ≤ 15mm are treated as notches:
- **Position**: midpoint of the line/polyline
- **Normal**: direction of the line (perpendicular to edge)

### Notch Type Classification

- **Slit (default)**: Single short line on layer 4
- **T-notch**: Two lines on layer 4 that intersect near their endpoints, forming a T shape → `notchType: 'tee'`
- **Triangle**: 3 short lines on layer 4 forming a closed triangle → `notchType: 'triangle'`

### Implementation

All changes in `src/utils/dxf/converter.ts` within `entitiesToPiece()`. No data model changes needed — `NotchOptions.notchType` already supports `'slit' | 'tee' | 'triangle' | 'vNotch'`.

---

## 3. Copilot `import_dxf` Action

### Action Type

```typescript
interface ImportDXFAction {
  action: 'import_dxf';
  fileContent: string;
  unit?: 'mm' | 'cm' | 'inch' | 'auto';
  scale?: number;
  loadType?: 'open' | 'add';
}
```

### Behavior

- Calls `parseDXF(fileContent)` + `dxfToPatternPieces(doc)` with scale/unit applied
- `loadType: 'add'` (default) → dispatches `addPiece` for each piece
- `loadType: 'open'` → dispatches `loadProject` with new pieces replacing current
- Returns piece count and names in result

### Limitation

The copilot cannot open a file picker. This tool works when DXF content is provided in context (pasted text, MCP server, clipboard). If the user asks to import without content, the copilot responds directing them to use the Import button in the sidebar.

### Files

- `src/copilot/actions/actionTypes.ts` — ImportDXFAction interface + union + category
- `src/copilot/actions/actionExecutor.ts` — import_dxf case
- `src/copilot/llm/actionSchemas.ts` — schema entry
