# DXF Wizard — Auto-Detect Format Design

> Issue: #264
> Date: 2026-03-25

## Summary

Auto-detect DXF file format on import (AAMA, ASTM D6673, standard DXF, Gerber AM, Lectra IBA) and select the correct parser pipeline. Zero-friction import for users migrating from any CAD system.

## Architecture

### Types

**All shared types live in `src/utils/dxf/types.ts`** (single source of truth):

```typescript
type FormatId = 'aama' | 'astm' | 'gerber' | 'lectra' | 'standard';
type LayerRole = 'cut' | 'notch' | 'grainline' | 'draw' | 'intcut' | 'label' | 'seam' | 'unknown';

interface DetectionResult {
  profileId: FormatId;
  name: string;
  confidence: number; // 0-100
}

interface FormatProfile {
  id: FormatId;
  name: string;
  layerMap: Record<string, LayerRole>;        // exact layer name → role
  layerPatterns: Array<{ pattern: RegExp; role: LayerRole }>;  // regex fallbacks
  detectHook?: (doc: DXFDocument) => number;  // bonus/penalty score (-50 to +50)
  convertHook?: (piece: PatternPiece, blockEntities: DXFEntity[]) => PatternPiece;
}
```

`formatProfiles.ts` and `formatDetector.ts` both import from `types.ts`.

### Format Detection Engine

**Module:** `src/utils/dxf/formatDetector.ts`

Pure function `detectDXFFormat(doc: DXFDocument)` takes a parsed DXF document and returns a ranked list of format candidates with confidence scores.

```typescript
function detectDXFFormat(doc: DXFDocument): DetectionResult[]
```

**Layer name collection:** Scans **both** `doc.layers` (TABLES section) **and** unique `.layer` strings from all entities in `doc.entities` and `doc.blocks`. This handles DXF files that omit the TABLES section (valid per DXF spec, common in Gerber exports).

**Scoring algorithm:**
1. Build the union of all layer names (from `doc.layers` + entity `.layer` fields). **Normalize all layer names to uppercase** before matching to handle mixed-case DXF exports.
2. For each format profile, count how many layer names match its `layerMap` (exact, keys stored uppercase) or `layerPatterns` (regex, use `/i` flag)
3. Compute base score: `baseScore = (matchedLayers / profile's expected layer count) * 100`
4. Run `detectHook` if present. Hook must return a number; if it throws or returns `NaN`, treat as `0`. Clamp to `[-50, +50]`.
5. Final confidence: `clamp(baseScore + hookBonus, 0, 100)`
6. Sort descending by confidence
7. **Always return at least one result.** If no profile scores above 0, return `[{ profileId: 'standard', name: 'Standard DXF', confidence: 10 }]` as fallback.

The `standard` profile has an empty `layerMap` and scores a baseline 10 when no other format matches. This ensures the dialog always has something to display.

### Format Profiles

**Module:** `src/utils/dxf/formatProfiles.ts`

Exports `FORMAT_PROFILES: Record<FormatId, FormatProfile>` and a convenience `getProfile(id: FormatId): FormatProfile`.

**Layer patterns per format:**

| Format | Key Layers |
|--------|-----------|
| **AAMA** | Numeric `1`-`15`, named `CUT`, `NOTCH`, `GRAINLINE`, `DRAW`, `INTCUT` |
| **ASTM D6673** | `Piece Boundary`, `Sew Line`, `Internal Line`, `Notch`, `Grain Line`, `Annotation` |
| **Gerber AM** | `Perimeter`, `Turn Points`, `Stripe`, `Annotation`, `Internal`, `Drill Hole` |
| **Lectra IBA** | `CONTOUR`, `COUTURE`, `DROIT_FIL`, `CRAN`, `INT` |
| **Standard DXF** | Empty `layerMap` — baseline fallback, no garment-specific layers expected |

**`detectHook` examples:**
- **Gerber:** Scans `doc.header` for AccuMark comment patterns (e.g., `$ACAD_MAINT_VER` values specific to AccuMark). Returns +30 if found.
- **Lectra:** Scans header for Lectra-specific `$CUSTOMVAR` entries. Returns +30 if found.
- **AAMA/ASTM/Standard:** No `detectHook` (layer matching is sufficient).

### Converter Integration

The existing `dxfToPatternPieces()` gets a new optional parameter:

```typescript
function dxfToPatternPieces(
  doc: DXFDocument,
  options?: DXFImportOptions & { formatProfile?: FormatProfile }
): PatternPiece[]
```

**Layer role resolution** — `resolveLayerRole` replaces all direct `layerRole(e.layer)` calls inside `entitiesToPiece()` in `converter.ts`:

```typescript
function resolveLayerRole(layerName: string, profile?: FormatProfile): LayerRole {
  const normalized = layerName.toUpperCase();
  if (profile) {
    if (profile.layerMap[normalized]) return profile.layerMap[normalized];
    for (const { pattern, role } of profile.layerPatterns) {
      if (pattern.test(layerName)) return role;
    }
  }
  return layerRole(layerName); // existing AAMA fallback
}
```

The `profile` is threaded from `dxfToPatternPieces()` through to every `entitiesToPiece()` call. The existing `layerRole()` function in `types.ts` remains unchanged as the AAMA fallback.

**Per-format `convertHook`** runs after each piece is assembled in `entitiesToPiece()`. It receives the built `PatternPiece` and the entities that were consumed to build that piece:

- **Block-based DXF:** passes the block's `DXFEntity[]` (scoped to the current piece)
- **No-blocks DXF:** passes only the entities that the converter consumed for the current piece (the converter already tracks which entities it groups per piece via layer role assignment)

```typescript
if (profile?.convertHook) {
  piece = profile.convertHook(piece, consumedEntities);
}
```

**Note:** For no-blocks DXF files with overlapping geometry (rare), the consumed entity set may include false positives. `convertHook` should be defensive. Most professional CAD exports (AAMA, ASTM, Gerber) use blocks, where entity scoping is exact.

**No existing behavior changes** — the default path (no `formatProfile`) is identical to today.

## UI

### ImportDXFDialog Modifications

**Detection entry point:** The parent component that opens `ImportDXFDialog` (currently `FileExplorerView.tsx`) already calls `parseDXF(content)` and passes the resulting `DXFDocument` as a prop. After parsing, it also calls `detectDXFFormat(doc)` and passes the results as a new prop `detectionResults: DetectionResult[]`.

```typescript
// In FileExplorerView.tsx, where the dialog is opened:
const doc = parseDXF(content);
const detectionResults = detectDXFFormat(doc);
// Pass both to dialog:
<ImportDXFDialog doc={doc} detectionResults={detectionResults} ... />
```

**New prop on `ImportDXFDialog`:**
```typescript
detectionResults: DetectionResult[]
```

The dialog renders based on top result confidence. The threshold is a named constant:

```typescript
const CONFIDENT_THRESHOLD = 80; // extract to top of DetectedFormatBanner.tsx
```

**Confident (>=CONFIDENT_THRESHOLD):** Info banner at the top of existing dialog.

```
┌─────────────────────────────────────────┐
│ i Detected: AAMA format (95%)           │
│   [Change format v]                     │
├─────────────────────────────────────────┤
│ Load type:  ( ) Open  ( ) Add           │
│ Unit:       [Auto v]                    │
│ Scale:      [100%]                      │
│ [x] Import notches  [x] Import grainlines│
│ ...existing options...                  │
└─────────────────────────────────────────┘
```

**Ambiguous (<80%):** Format selector section replaces the banner.

```
┌─────────────────────────────────────────┐
│ ! Multiple formats detected             │
│                                         │
│ ( ) AAMA          72%  ========--       │
│ ( ) Gerber AM     58%  ======----       │
│ ( ) ASTM D6673    31%  ===-------       │
│                                         │
│ [ ] Always use this format              │
├─────────────────────────────────────────┤
│ Load type:  ( ) Open  ( ) Add           │
│ ...existing options...                  │
└─────────────────────────────────────────┘
```

### New Sub-Component

`DetectedFormatBanner` — renders the confident banner or ambiguous selector based on detection results. Placed at the top of `ImportDXFDialog`. Props:

```typescript
interface DetectedFormatBannerProps {
  results: DetectionResult[];
  selectedFormat: FormatId;
  onFormatChange: (id: FormatId) => void;
  onAlwaysUse: (id: FormatId) => void;
  rememberedFormat: FormatId | null;
  onClearRemembered: () => void;
}
```

### Preference Storage

**"Always use this format" checkbox** saves to a dedicated field in `workflowSlice`:

```typescript
// Added to WorkflowState:
dxfPreferredFormat: FormatId | null;  // default null
```

This is a **user preference**, not per-project state, so it must NOT be cleared on `NEW_PROJECT`. Adding a dedicated field (rather than using `toolMemory`) ensures it survives project resets. Persisted alongside existing workflow state to `localStorage` key `'openclo-workflow'`.

**Important:** The `workflowSlice` partial reset handler for `NEW_PROJECT` must explicitly preserve `dxfPreferredFormat` alongside `expertMode` and `confirmOverrides`. Add it to the preservation list in the `extraReducers` handler.

On subsequent imports:
- If `dxfPreferredFormat` is set, auto-detection is skipped
- Banner shows "Remembered: AAMA" with a "Clear" link
- "Clear" dispatches `setDxfPreferredFormat(null)`

## Copilot Integration

### New Tool: `detectDXFFormat`

**File:** `src/copilot/action/tools/definitions/dxfTools.ts`

This tool lives in the bridge-mode tool registry (`src/copilot/action/tools/`), separate from the `actionExecutor.ts` action system.

**Design constraint:** The LLM cannot pass raw DXF file content as a tool parameter (files can be 10-100MB, exceeding token limits). Instead, the tool operates on the **most recently parsed DXF document**, cached in a module-level variable set during the import flow.

**Module-level cache** in `src/utils/dxf/parser.ts`:

```typescript
let lastParsedDoc: DXFDocument | null = null;
export function getLastParsedDoc(): DXFDocument | null { return lastParsedDoc; }
// Set inside parseDXF() before returning:
// lastParsedDoc = doc;
```

**Tool definition:**

```typescript
{
  name: 'detectDXFFormat',
  description: 'Detect the format of the most recently imported DXF file (AAMA, ASTM, Gerber, Lectra, standard). Must import a DXF file first.',
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async (_params, _dispatch, getState) => {
    const doc = getLastParsedDoc();
    if (!doc) return { success: false, error: 'No DXF file has been imported yet' };
    const results = detectDXFFormat(doc);
    return { success: true, data: { formats: results } };
  }
}
```

This mirrors the pattern used for reference images (`objectUrlMap` — module-level state set during import, consumed by tools).

Registered in `ALL_TOOL_MODULES` in `registry.ts`.

### Existing `import_dxf` Action Extension

New optional fields on `ImportDXFAction` in `actionTypes.ts`:

```typescript
interface ImportDXFAction {
  action: 'import_dxf';
  fileContent: string;
  unit?: 'mm' | 'cm' | 'inch' | 'auto';
  scale?: number;
  loadType?: 'open' | 'add';
  autoDetect?: boolean;   // default true
  format?: FormatId;      // explicit override
}
```

**In `actionExecutor.ts`:** The inline type cast at the `import_dxf` case must be updated to include `autoDetect` and `format` fields. When `autoDetect` is true (or omitted) and no `format` is specified, the executor runs `detectDXFFormat()` and passes `{ formatProfile: getProfile(topResult.profileId) }` to `dxfToPatternPieces()`. When `format` is explicit, it uses `getProfile(format)` directly.

## Testing

### Format Detection — `src/utils/dxf/__tests__/formatDetector.test.ts`
- One test per format: DXF with known layers → correct format + high confidence
- Ambiguous: layers matching multiple formats → ranked results
- Empty DXF (no layers, no entities) → `standard` fallback with confidence 10
- DXF with only entity-level layers (no TABLES section) → still detects correctly
- `detectHook` throws → treated as 0 bonus, does not crash
- `detectHook` returns out-of-range → clamped to [-50, +50]

### Format Profiles — `src/utils/dxf/__tests__/formatProfiles.test.ts`
- Each profile's `layerMap` resolves known layers to correct roles
- Each profile's `layerPatterns` match expected regex variants
- `detectHook` returns expected bonus/penalty for format-specific markers

### Converter Integration — extend `src/utils/dxf/__tests__/dxfImport.test.ts`
- Same geometry + different layer naming → each profile produces correct pieces
- `resolveLayerRole` falls back to AAMA when no profile given
- `convertHook` runs and modifies piece with block entities passed
- Existing tests unchanged (no `formatProfile` = same behavior)

### Dialog — extend `src/components/ImportDXFDialog/__tests__/`
- Confident: banner renders with format + confidence
- Ambiguous: selector renders with radio buttons + scores
- "Always use" checkbox dispatches `setDxfPreferredFormat`
- Preference exists: shows "Remembered" label
- "Clear" link dispatches `setDxfPreferredFormat(null)`

### Copilot — `src/copilot/action/tools/__tests__/dxfTools.test.ts`
- `detectDXFFormat` tool returns ranked list
- `import_dxf` action with `autoDetect: true` uses detected profile
- `import_dxf` action with explicit `format` uses that profile
- `import_dxf` inline type cast includes new fields

## File Map

### New Files
- `src/utils/dxf/formatDetector.ts` — detection engine
- `src/utils/dxf/formatProfiles.ts` — format profile definitions
- `src/components/ImportDXFDialog/DetectedFormatBanner.tsx` — banner/selector UI
- `src/copilot/action/tools/definitions/dxfTools.ts` — copilot tool (bridge registry)
- `src/utils/dxf/__tests__/formatDetector.test.ts`
- `src/utils/dxf/__tests__/formatProfiles.test.ts`
- `src/copilot/action/tools/__tests__/dxfTools.test.ts`

### Modified Files
- `src/utils/dxf/types.ts` — add `FormatProfile`, `FormatId`, `DetectionResult`, `LayerRole` types
- `src/utils/dxf/parser.ts` — cache last parsed doc in module-level variable for copilot tool
- `src/utils/dxf/converter.ts` — add `formatProfile` option, replace `layerRole()` calls with `resolveLayerRole()`
- `src/components/ImportDXFDialog/ImportDXFDialog.tsx` — add `detectionResults` prop, integrate `DetectedFormatBanner`
- `src/components/views/FileExplorerView.tsx` — call `detectDXFFormat()` after parse, pass results to dialog
- `src/copilot/actions/actionTypes.ts` — add `autoDetect` + `format` fields to `ImportDXFAction`
- `src/copilot/actions/actionExecutor.ts` — update inline type cast, use detected profile in import
- `src/copilot/action/tools/registry.ts` — register `dxfTools` in `ALL_TOOL_MODULES`
- `src/store/workflowSlice.ts` — add `dxfPreferredFormat: FormatId | null` field + reducer

## Dependencies

- Existing DXF parser (`src/utils/dxf/parser.ts`) — unchanged
- Existing converter (`src/utils/dxf/converter.ts`) — extended
- `workflowSlice` — new dedicated field for format preference
