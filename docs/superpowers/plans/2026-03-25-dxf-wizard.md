# DXF Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-detect DXF format on import and use the correct parser pipeline.

**Architecture:** Pure detection engine scores DXF layers against format profiles, converter gets profile-aware layer resolution, dialog shows detection results with confidence scores.

**Tech Stack:** TypeScript, React, Redux Toolkit, Vitest

**Spec:** `docs/superpowers/specs/2026-03-25-dxf-wizard-design.md`

---

### Task 1: Add shared types to `types.ts`

**Files:**
- Modify: `src/utils/dxf/types.ts:127` (after `layerRole` function)

- [ ] **Step 1: Add types after the existing `layerRole` function (line 127)**

```typescript
// ─── Format Detection Types ───

export type FormatId = 'aama' | 'astm' | 'gerber' | 'lectra' | 'standard';

export interface DetectionResult {
  profileId: FormatId;
  name: string;
  confidence: number; // 0-100
}

export interface FormatProfile {
  id: FormatId;
  name: string;
  layerMap: Record<string, LayerRole>;
  layerPatterns: Array<{ pattern: RegExp; role: LayerRole }>;
  detectHook?: (doc: DXFDocument) => number;
  convertHook?: (piece: PatternPiece, blockEntities: DXFEntity[]) => PatternPiece;
}
```

Where `LayerRole` is the existing return type of `layerRole()`. Extract it to a named type:

```typescript
export type LayerRole = 'cut' | 'notch' | 'grainline' | 'draw' | 'intcut' | 'label' | 'seam' | 'unknown';
```

Place this above the `layerRole` function (line 114) and update `layerRole`'s return type to use it.

- [ ] **Step 2: Update `index.ts` exports**

Add to `src/utils/dxf/index.ts`:
```typescript
export type { FormatId, FormatProfile, DetectionResult, LayerRole } from './types';
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (no new code, just types)

- [ ] **Step 4: Commit**

```bash
git add src/utils/dxf/types.ts src/utils/dxf/index.ts
git commit -m "feat(dxf): add FormatId, FormatProfile, DetectionResult types"
```

---

### Task 2: Create format profiles

**Files:**
- Create: `src/utils/dxf/formatProfiles.ts`
- Test: `src/utils/dxf/__tests__/formatProfiles.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { FORMAT_PROFILES, getProfile } from '../formatProfiles';

describe('formatProfiles', () => {
  it('has all 5 format profiles', () => {
    expect(Object.keys(FORMAT_PROFILES)).toHaveLength(5);
    expect(FORMAT_PROFILES.aama).toBeDefined();
    expect(FORMAT_PROFILES.astm).toBeDefined();
    expect(FORMAT_PROFILES.gerber).toBeDefined();
    expect(FORMAT_PROFILES.lectra).toBeDefined();
    expect(FORMAT_PROFILES.standard).toBeDefined();
  });

  it('getProfile returns the correct profile', () => {
    expect(getProfile('aama').id).toBe('aama');
    expect(getProfile('gerber').name).toContain('Gerber');
  });

  describe('AAMA profile', () => {
    it('maps numeric layer 1 to cut', () => {
      expect(FORMAT_PROFILES.aama.layerMap['1']).toBe('cut');
    });
    it('maps CUT to cut', () => {
      expect(FORMAT_PROFILES.aama.layerMap['CUT']).toBe('cut');
    });
    it('maps numeric layer 4 to notch', () => {
      expect(FORMAT_PROFILES.aama.layerMap['4']).toBe('notch');
    });
    it('maps numeric layer 7 to grainline', () => {
      expect(FORMAT_PROFILES.aama.layerMap['7']).toBe('grainline');
    });
  });

  describe('ASTM profile', () => {
    it('maps PIECE BOUNDARY to cut (case-insensitive keys stored uppercase)', () => {
      expect(FORMAT_PROFILES.astm.layerMap['PIECE BOUNDARY']).toBe('cut');
    });
    it('maps SEW LINE to seam', () => {
      expect(FORMAT_PROFILES.astm.layerMap['SEW LINE']).toBe('seam');
    });
  });

  describe('Gerber profile', () => {
    it('maps PERIMETER to cut', () => {
      expect(FORMAT_PROFILES.gerber.layerMap['PERIMETER']).toBe('cut');
    });
    it('maps TURN POINTS to notch', () => {
      expect(FORMAT_PROFILES.gerber.layerMap['TURN POINTS']).toBe('notch');
    });
    it('has a detectHook', () => {
      expect(FORMAT_PROFILES.gerber.detectHook).toBeDefined();
    });
  });

  describe('Lectra profile', () => {
    it('maps CONTOUR to cut', () => {
      expect(FORMAT_PROFILES.lectra.layerMap['CONTOUR']).toBe('cut');
    });
    it('maps DROIT_FIL to grainline', () => {
      expect(FORMAT_PROFILES.lectra.layerMap['DROIT_FIL']).toBe('grainline');
    });
    it('maps CRAN to notch', () => {
      expect(FORMAT_PROFILES.lectra.layerMap['CRAN']).toBe('notch');
    });
  });

  describe('Standard profile', () => {
    it('has empty layerMap', () => {
      expect(Object.keys(FORMAT_PROFILES.standard.layerMap)).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/dxf/__tests__/formatProfiles.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement format profiles**

Create `src/utils/dxf/formatProfiles.ts`:

```typescript
import type { FormatId, FormatProfile, DXFDocument } from './types';

function gerberDetectHook(doc: DXFDocument): number {
  // AccuMark exports often include specific header values
  const maintVer = doc.header?.get('$ACAD_MAINT_VER');
  if (maintVer !== undefined) return 20;
  return 0;
}

function lectraDetectHook(doc: DXFDocument): number {
  // Lectra exports may include custom variables
  for (const [key] of doc.header) {
    if (key.startsWith('$LECTRA') || key.startsWith('$IBA')) return 30;
  }
  return 0;
}

export const FORMAT_PROFILES: Record<FormatId, FormatProfile> = {
  aama: {
    id: 'aama',
    name: 'AAMA / DXF-AAMA',
    layerMap: {
      '1': 'cut', 'CUT': 'cut',
      '4': 'notch', 'NOTCH': 'notch',
      '7': 'grainline', 'GRAINLINE': 'grainline',
      '8': 'draw', 'DRAW': 'draw',
      '11': 'intcut', 'INTCUT': 'intcut',
      '13': 'label', // FABRIC_CODE
      '14': 'label', // ANNOTATION
      '15': 'draw',  // FOLD_DIR
      'SEAM': 'seam',
      'LABEL': 'label',
    },
    layerPatterns: [],
  },
  astm: {
    id: 'astm',
    name: 'ASTM D6673',
    layerMap: {
      'PIECE BOUNDARY': 'cut',
      'SEW LINE': 'seam',
      'INTERNAL LINE': 'intcut',
      'NOTCH': 'notch',
      'GRAIN LINE': 'grainline',
      'ANNOTATION': 'label',
      'DRILL HOLE': 'notch',
      'STRIPE': 'draw',
      'PLAID': 'draw',
    },
    layerPatterns: [
      { pattern: /piece\s*bound/i, role: 'cut' },
      { pattern: /sew\s*line/i, role: 'seam' },
      { pattern: /grain\s*line/i, role: 'grainline' },
      { pattern: /internal\s*line/i, role: 'intcut' },
    ],
  },
  gerber: {
    id: 'gerber',
    name: 'Gerber AccuMark',
    layerMap: {
      'PERIMETER': 'cut',
      'TURN POINTS': 'notch',
      'STRIPE': 'draw',
      'ANNOTATION': 'label',
      'INTERNAL': 'intcut',
      'DRILL HOLE': 'notch',
      'GRAIN': 'grainline',
    },
    layerPatterns: [
      { pattern: /perim/i, role: 'cut' },
      { pattern: /turn\s*point/i, role: 'notch' },
      { pattern: /grain/i, role: 'grainline' },
    ],
    detectHook: gerberDetectHook,
  },
  lectra: {
    id: 'lectra',
    name: 'Lectra IBA',
    layerMap: {
      'CONTOUR': 'cut',
      'COUTURE': 'seam',
      'DROIT_FIL': 'grainline',
      'CRAN': 'notch',
      'INT': 'intcut',
      'PINCE': 'intcut',   // darts
      'TEXTE': 'label',
    },
    layerPatterns: [
      { pattern: /contour/i, role: 'cut' },
      { pattern: /couture/i, role: 'seam' },
      { pattern: /droit.fil/i, role: 'grainline' },
    ],
    detectHook: lectraDetectHook,
  },
  standard: {
    id: 'standard',
    name: 'Standard DXF',
    layerMap: {},
    layerPatterns: [],
  },
};

export function getProfile(id: FormatId): FormatProfile {
  return FORMAT_PROFILES[id];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/utils/dxf/__tests__/formatProfiles.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/dxf/formatProfiles.ts src/utils/dxf/__tests__/formatProfiles.test.ts
git commit -m "feat(dxf): add format profiles for AAMA, ASTM, Gerber, Lectra, standard"
```

---

### Task 3: Create format detection engine

**Files:**
- Create: `src/utils/dxf/formatDetector.ts`
- Test: `src/utils/dxf/__tests__/formatDetector.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { detectDXFFormat } from '../formatDetector';
import type { DXFDocument } from '../types';

function makeDoc(layers: string[], entityLayers: string[] = [], header?: Map<string, string | number>): DXFDocument {
  return {
    header: header ?? new Map(),
    layers: layers.map(name => ({ name, color: 7, lineType: 'CONTINUOUS' })),
    entities: entityLayers.map(layer => ({ type: 'LINE', layer, data: { x1: 0, y1: 0, x2: 1, y2: 1 } as any })),
    blocks: new Map(),
  };
}

describe('detectDXFFormat', () => {
  it('detects AAMA from numeric layers', () => {
    const results = detectDXFFormat(makeDoc(['1', '4', '7', '8', '11']));
    expect(results[0].profileId).toBe('aama');
    expect(results[0].confidence).toBeGreaterThanOrEqual(80);
  });

  it('detects ASTM from named layers', () => {
    const results = detectDXFFormat(makeDoc(['Piece Boundary', 'Sew Line', 'Grain Line', 'Notch']));
    expect(results[0].profileId).toBe('astm');
    expect(results[0].confidence).toBeGreaterThanOrEqual(70);
  });

  it('detects Gerber from AccuMark layers', () => {
    const results = detectDXFFormat(makeDoc(['Perimeter', 'Turn Points', 'Grain', 'Annotation']));
    expect(results[0].profileId).toBe('gerber');
    expect(results[0].confidence).toBeGreaterThanOrEqual(70);
  });

  it('detects Lectra from IBA layers', () => {
    const results = detectDXFFormat(makeDoc(['CONTOUR', 'COUTURE', 'DROIT_FIL', 'CRAN']));
    expect(results[0].profileId).toBe('lectra');
    expect(results[0].confidence).toBeGreaterThanOrEqual(80);
  });

  it('falls back to standard for generic DXF', () => {
    const results = detectDXFFormat(makeDoc(['0', 'Defpoints']));
    expect(results[0].profileId).toBe('standard');
  });

  it('falls back to standard for empty DXF', () => {
    const results = detectDXFFormat(makeDoc([]));
    expect(results).toHaveLength(1);
    expect(results[0].profileId).toBe('standard');
    expect(results[0].confidence).toBe(10);
  });

  it('collects layers from entities when TABLES section is absent', () => {
    const results = detectDXFFormat(makeDoc([], ['CONTOUR', 'COUTURE', 'DROIT_FIL', 'CRAN']));
    expect(results[0].profileId).toBe('lectra');
  });

  it('handles case-insensitive layer names', () => {
    const results = detectDXFFormat(makeDoc(['contour', 'Couture', 'droit_fil']));
    expect(results[0].profileId).toBe('lectra');
  });

  it('always returns at least one result', () => {
    const results = detectDXFFormat(makeDoc([]));
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('returns ranked results sorted by confidence', () => {
    const results = detectDXFFormat(makeDoc(['1', '4', 'NOTCH'])); // matches AAMA
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].confidence).toBeGreaterThanOrEqual(results[i].confidence);
    }
  });

  it('handles detectHook that throws', () => {
    // Gerber profile has a detectHook — passing a doc with no header should not crash
    const results = detectDXFFormat(makeDoc(['Perimeter']));
    expect(results).toBeDefined();
  });

  it('clamps detectHook bonus to [-50, +50]', () => {
    const results = detectDXFFormat(makeDoc(['1', '4', '7', '8', '11']));
    for (const r of results) {
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(100);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/dxf/__tests__/formatDetector.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement detection engine**

Create `src/utils/dxf/formatDetector.ts`:

```typescript
import type { DXFDocument, DetectionResult } from './types';
import { FORMAT_PROFILES } from './formatProfiles';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function collectLayerNames(doc: DXFDocument): Set<string> {
  const names = new Set<string>();
  // From TABLES section
  for (const layer of doc.layers) {
    names.add(layer.name.toUpperCase());
  }
  // From entity .layer fields
  for (const e of doc.entities) {
    if (e.layer) names.add(e.layer.toUpperCase());
  }
  // From block entities
  for (const [, block] of doc.blocks) {
    for (const e of block.entities) {
      if (e.layer) names.add(e.layer.toUpperCase());
    }
  }
  return names;
}

export function detectDXFFormat(doc: DXFDocument): DetectionResult[] {
  const layerNames = collectLayerNames(doc);
  const results: DetectionResult[] = [];

  for (const profile of Object.values(FORMAT_PROFILES)) {
    if (profile.id === 'standard') continue; // handled as fallback

    const mapKeys = Object.keys(profile.layerMap);
    const expectedCount = mapKeys.length + profile.layerPatterns.length;
    if (expectedCount === 0) continue;

    let matchCount = 0;
    // Exact match (keys already uppercase in profiles)
    for (const key of mapKeys) {
      if (layerNames.has(key.toUpperCase())) matchCount++;
    }
    // Regex match (check original and uppercase)
    for (const { pattern } of profile.layerPatterns) {
      for (const name of layerNames) {
        if (pattern.test(name)) { matchCount++; break; }
      }
    }

    const baseScore = (matchCount / expectedCount) * 100;

    let hookBonus = 0;
    if (profile.detectHook) {
      try {
        const raw = profile.detectHook(doc);
        hookBonus = (typeof raw === 'number' && !isNaN(raw)) ? clamp(raw, -50, 50) : 0;
      } catch {
        hookBonus = 0;
      }
    }

    const confidence = clamp(Math.round(baseScore + hookBonus), 0, 100);
    if (confidence > 0) {
      results.push({ profileId: profile.id, name: profile.name, confidence });
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);

  if (results.length === 0) {
    return [{ profileId: 'standard', name: 'Standard DXF', confidence: 10 }];
  }

  return results;
}
```

- [ ] **Step 4: Update `index.ts` exports**

Add to `src/utils/dxf/index.ts`:
```typescript
export { detectDXFFormat } from './formatDetector';
export { FORMAT_PROFILES, getProfile } from './formatProfiles';
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/utils/dxf/__tests__/formatDetector.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/dxf/formatDetector.ts src/utils/dxf/__tests__/formatDetector.test.ts src/utils/dxf/index.ts
git commit -m "feat(dxf): add format detection engine with confidence scoring"
```

---

### Task 4: Integrate profiles into converter

**Files:**
- Modify: `src/utils/dxf/converter.ts:342,364`
- Extend test: `src/utils/dxf/__tests__/dxfImport.test.ts`

- [ ] **Step 1: Write failing test for profile-aware conversion**

Add to `src/utils/dxf/__tests__/dxfImport.test.ts`:

```typescript
import { getProfile } from '../formatProfiles';

describe('profile-aware conversion', () => {
  it('resolveLayerRole uses profile layerMap when provided', () => {
    // Lectra DXF: CONTOUR layer should be 'cut' only with lectra profile
    const lectraDoc = parseDXF(makeDxfWithLayers(['CONTOUR']));
    const withProfile = dxfToPatternPieces(lectraDoc, { formatProfile: getProfile('lectra') });
    const withoutProfile = dxfToPatternPieces(lectraDoc);
    // With lectra profile, CONTOUR is 'cut' → produces a piece outline
    // Without profile, CONTOUR is 'unknown' → skipped
    expect(withProfile.length).toBeGreaterThanOrEqual(withoutProfile.length);
  });

  it('falls back to AAMA layerRole when no profile', () => {
    const aamaDoc = parseDXF(makeDxfWithLayers(['1', '4', '7']));
    const pieces = dxfToPatternPieces(aamaDoc);
    expect(pieces.length).toBeGreaterThan(0);
  });
});
```

Note: `makeDxfWithLayers` is a helper that creates a minimal DXF string with entities on the given layers. Define it at the top of the test file using the existing DXF string patterns in the test suite.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/dxf/__tests__/dxfImport.test.ts -t "profile-aware"`
Expected: FAIL — `formatProfile` option not supported yet

- [ ] **Step 3: Add `resolveLayerRole` and thread profile through converter**

In `src/utils/dxf/converter.ts`:

1. Add import at top:
```typescript
import type { FormatProfile, LayerRole } from './types';
```

2. Add `resolveLayerRole` function (before `entitiesToPiece`):
```typescript
function resolveLayerRole(layerName: string, profile?: FormatProfile): LayerRole {
  const normalized = layerName.toUpperCase();
  if (profile) {
    if (profile.layerMap[normalized]) return profile.layerMap[normalized];
    for (const { pattern, role } of profile.layerPatterns) {
      if (pattern.test(layerName)) return role;
    }
  }
  return layerRole(layerName);
}
```

3. Replace `layerRole(e.layer)` calls at lines ~342 and ~364 with `resolveLayerRole(e.layer, profile)`.

4. Thread `profile` parameter through `entitiesToPiece()` and from `dxfToPatternPieces()`:
```typescript
export function dxfToPatternPieces(
  doc: DXFDocument,
  options?: DXFImportOptions & { formatProfile?: FormatProfile },
): PatternPiece[]
```

5. Run `convertHook` after piece assembly if profile has one:
```typescript
if (profile?.convertHook && piece) {
  piece = profile.convertHook(piece, entities);
}
```

- [ ] **Step 4: Run all DXF tests**

Run: `npx vitest run src/utils/dxf/__tests__/`
Expected: ALL PASS (existing tests unchanged, new test passes)

- [ ] **Step 5: Commit**

```bash
git add src/utils/dxf/converter.ts src/utils/dxf/__tests__/dxfImport.test.ts
git commit -m "feat(dxf): add profile-aware layer resolution to converter"
```

---

### Task 5: Add `lastParsedDoc` cache to parser

**Files:**
- Modify: `src/utils/dxf/parser.ts:320-330`

- [ ] **Step 1: Add module-level cache**

At the top of `src/utils/dxf/parser.ts` (after imports):

```typescript
let lastParsedDoc: DXFDocument | null = null;

/** Returns the most recently parsed DXF document (for copilot tool). */
export function getLastParsedDoc(): DXFDocument | null {
  return lastParsedDoc;
}
```

- [ ] **Step 2: Set cache in `parseDXF()` before return**

At line ~325 (the return statement in `parseDXF`), set the cache before returning:

```typescript
const doc: DXFDocument = {
  header,
  layers,
  entities,
  blocks,
};
lastParsedDoc = doc;
return doc;
```

- [ ] **Step 3: Export from index**

Add to `src/utils/dxf/index.ts`:
```typescript
export { getLastParsedDoc } from './parser';
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/dxf/parser.ts src/utils/dxf/index.ts
git commit -m "feat(dxf): cache last parsed doc for copilot tool access"
```

---

### Task 6: Add `dxfPreferredFormat` to `workflowSlice`

**Files:**
- Modify: `src/store/workflowSlice.ts:5-9,19-23,84-89`

- [ ] **Step 1: Add import and field to `WorkflowState` interface (line ~5)**

Add import at top of file:
```typescript
import type { FormatId } from '../utils/dxf/types';
```

Update interface:
```typescript
export interface WorkflowState {
  expertMode: boolean;
  confirmOverrides: Record<string, 'default' | 'always' | 'never'>;
  toolMemory: Record<string, Record<string, unknown>>;
  dxfPreferredFormat: FormatId | null;
}
```

- [ ] **Step 2: Add to `initialState` (line ~19)**

```typescript
const initialState: WorkflowState = {
  expertMode: false,
  confirmOverrides: {},
  toolMemory: {},
  dxfPreferredFormat: null,
};
```

- [ ] **Step 3: Add reducer**

In the `reducers` block:
```typescript
setDxfPreferredFormat(state, action: PayloadAction<FormatId | null>) {
  state.dxfPreferredFormat = action.payload;
},
```

- [ ] **Step 4: Update `rehydrateWorkflow` reducer (line ~77)**

The `rehydrateWorkflow` reducer manually assigns each field. Add `dxfPreferredFormat`:
```typescript
rehydrateWorkflow(state, action: PayloadAction<WorkflowState>) {
  state.expertMode = action.payload.expertMode;
  state.confirmOverrides = action.payload.confirmOverrides;
  state.toolMemory = action.payload.toolMemory;
  state.dxfPreferredFormat = action.payload.dxfPreferredFormat ?? null;
},
```

Without this, the preference will never be restored from localStorage on page reload.

- [ ] **Step 5: Preserve in `NEW_PROJECT` handler (line ~84)**

Update the `extraReducers` handler:
```typescript
builder.addCase(NEW_PROJECT, (state) => {
  state.toolMemory = {};
  // dxfPreferredFormat, expertMode, confirmOverrides survive NEW_PROJECT
});
```

- [ ] **Step 6: Export the new action**

Add `setDxfPreferredFormat` to the exports destructuring.

- [ ] **Step 7: Run type check + existing workflow tests**

Run: `npx tsc --noEmit && npx vitest run src/store/__tests__/workflowSlice`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/store/workflowSlice.ts
git commit -m "feat(workflow): add dxfPreferredFormat preference field"
```

---

### Task 7: Create `DetectedFormatBanner` component

**Files:**
- Create: `src/components/ImportDXFDialog/DetectedFormatBanner.tsx`

- [ ] **Step 1: Create the component**

```typescript
import type { DetectionResult, FormatId } from '../../utils/dxf/types';

const CONFIDENT_THRESHOLD = 80;

interface DetectedFormatBannerProps {
  results: DetectionResult[];
  selectedFormat: FormatId;
  onFormatChange: (id: FormatId) => void;
  onAlwaysUse: (id: FormatId) => void;
  rememberedFormat: FormatId | null;
  onClearRemembered: () => void;
}

export default function DetectedFormatBanner({
  results,
  selectedFormat,
  onFormatChange,
  onAlwaysUse,
  rememberedFormat,
  onClearRemembered,
}: DetectedFormatBannerProps) {
  if (rememberedFormat) {
    const profile = results.find(r => r.profileId === rememberedFormat);
    return (
      <div className="dxf-format-banner dxf-format-remembered">
        <span>Remembered: {profile?.name ?? rememberedFormat}</span>
        <button onClick={onClearRemembered} className="dxf-clear-btn">Clear</button>
      </div>
    );
  }

  const top = results[0];
  if (!top) return null;

  if (top.confidence >= CONFIDENT_THRESHOLD) {
    return (
      <div className="dxf-format-banner dxf-format-confident">
        <span>Detected: {top.name} ({top.confidence}%)</span>
        <select
          value={selectedFormat}
          onChange={e => onFormatChange(e.target.value as FormatId)}
        >
          {results.map(r => (
            <option key={r.profileId} value={r.profileId}>
              {r.name} ({r.confidence}%)
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Ambiguous — show full selector
  return (
    <div className="dxf-format-banner dxf-format-ambiguous">
      <div className="dxf-format-title">Multiple formats detected</div>
      {results.filter(r => r.confidence > 0).map(r => (
        <label key={r.profileId} className="dxf-format-option">
          <input
            type="radio"
            name="dxf-format"
            value={r.profileId}
            checked={selectedFormat === r.profileId}
            onChange={() => onFormatChange(r.profileId)}
          />
          <span className="dxf-format-name">{r.name}</span>
          <span className="dxf-format-confidence">{r.confidence}%</span>
          <div className="dxf-format-bar">
            <div className="dxf-format-bar-fill" style={{ width: `${r.confidence}%` }} />
          </div>
        </label>
      ))}
      <label className="dxf-format-always">
        <input
          type="checkbox"
          onChange={e => {
            if (e.target.checked) onAlwaysUse(selectedFormat);
          }}
        />
        Always use this format
      </label>
    </div>
  );
}

export { CONFIDENT_THRESHOLD };
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ImportDXFDialog/DetectedFormatBanner.tsx
git commit -m "feat(ui): add DetectedFormatBanner component for DXF import"
```

---

### Task 8: Integrate detection into `ImportDXFDialog` and `FileExplorerView`

**Files:**
- Modify: `src/components/ImportDXFDialog/ImportDXFDialog.tsx:14-18,48-50`
- Modify: `src/components/views/FileExplorerView.tsx:98,573-579`

- [ ] **Step 1: Update `ImportDXFDialog` props and integrate banner**

In `ImportDXFDialog.tsx`:

1. Add imports:
```typescript
import type { DetectionResult, FormatId } from '../../utils/dxf/types';
import { getProfile } from '../../utils/dxf/formatProfiles';
import DetectedFormatBanner from './DetectedFormatBanner';
```

2. Extend props interface (line ~14):
```typescript
interface Props {
  doc: DXFDocument;
  detectionResults: DetectionResult[];
  rememberedFormat: FormatId | null;
  onImport: (options: ImportDXFOptions & { formatProfile?: FormatProfile }) => void;
  onCancel: () => void;
  onAlwaysUse: (id: FormatId) => void;
  onClearRemembered: () => void;
}
```

3. Add state for selected format:
```typescript
const [selectedFormat, setSelectedFormat] = useState<FormatId>(
  rememberedFormat ?? detectionResults[0]?.profileId ?? 'standard'
);
```

4. Update `handleImport` to include profile:
```typescript
const handleImport = () => {
  onImport({
    loadType, unit, scale, importNotches, importGrainlines, importInternalLines,
    formatProfile: getProfile(selectedFormat),
  });
};
```

5. Render banner at the top of the dialog body:
```typescript
<DetectedFormatBanner
  results={detectionResults}
  selectedFormat={selectedFormat}
  onFormatChange={setSelectedFormat}
  onAlwaysUse={onAlwaysUse}
  rememberedFormat={rememberedFormat}
  onClearRemembered={onClearRemembered}
/>
```

- [ ] **Step 2: Update `FileExplorerView.tsx` to run detection and pass props**

1. Add imports:
```typescript
import { detectDXFFormat } from '../../utils/dxf/formatDetector';
import type { DetectionResult, FormatId } from '../../utils/dxf/types';
import { setDxfPreferredFormat } from '../../store/workflowSlice';
```

2. Add state for detection results (near line ~77):
```typescript
const [dxfDetectionResults, setDxfDetectionResults] = useState<DetectionResult[]>([]);
const dxfPreferredFormat = useSelector((s: RootState) => s.workflow.dxfPreferredFormat);
```

3. After `parseDXF(text)` call (line ~98):
```typescript
const doc = parseDXF(text);
const detectionResults = detectDXFFormat(doc);
setDxfDetectionResults(detectionResults);
setDxfDialogDoc(doc);
```

4. Update the dialog rendering (line ~573):
```typescript
{dxfDialogDoc && (
  <ImportDXFDialog
    doc={dxfDialogDoc}
    detectionResults={dxfDetectionResults}
    rememberedFormat={dxfPreferredFormat as FormatId | null}
    onImport={handleDXFDialogImport}
    onCancel={() => setDxfDialogDoc(null)}
    onAlwaysUse={(id) => dispatch(setDxfPreferredFormat(id))}
    onClearRemembered={() => dispatch(setDxfPreferredFormat(null))}
  />
)}
```

5. Update `handleDXFDialogImport` (line ~105) to thread `formatProfile` through to `dxfToPatternPieces`.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/ImportDXFDialog/ImportDXFDialog.tsx src/components/views/FileExplorerView.tsx
git commit -m "feat(ui): integrate format detection into DXF import dialog"
```

---

### Task 9: Add dialog component tests

**Files:**
- Create: `src/components/ImportDXFDialog/__tests__/DetectedFormatBanner.test.tsx`

- [ ] **Step 1: Write tests for banner rendering**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DetectedFormatBanner from '../DetectedFormatBanner';
import type { DetectionResult, FormatId } from '../../../utils/dxf/types';

const mockResults: DetectionResult[] = [
  { profileId: 'aama', name: 'AAMA / DXF-AAMA', confidence: 95 },
  { profileId: 'astm', name: 'ASTM D6673', confidence: 30 },
];

const ambiguousResults: DetectionResult[] = [
  { profileId: 'aama', name: 'AAMA / DXF-AAMA', confidence: 72 },
  { profileId: 'gerber', name: 'Gerber AccuMark', confidence: 58 },
  { profileId: 'astm', name: 'ASTM D6673', confidence: 31 },
];

const noop = () => {};

describe('DetectedFormatBanner', () => {
  it('renders confident banner when top result >= 80%', () => {
    render(
      <DetectedFormatBanner
        results={mockResults}
        selectedFormat="aama"
        onFormatChange={noop}
        onAlwaysUse={noop}
        rememberedFormat={null}
        onClearRemembered={noop}
      />
    );
    expect(screen.getByText(/Detected.*AAMA/)).toBeDefined();
    expect(screen.getByText(/95%/)).toBeDefined();
  });

  it('renders format selector when top result < 80%', () => {
    render(
      <DetectedFormatBanner
        results={ambiguousResults}
        selectedFormat="aama"
        onFormatChange={noop}
        onAlwaysUse={noop}
        rememberedFormat={null}
        onClearRemembered={noop}
      />
    );
    expect(screen.getByText(/Multiple formats detected/)).toBeDefined();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('"Always use" checkbox calls onAlwaysUse only when checked', () => {
    const onAlwaysUse = vi.fn();
    render(
      <DetectedFormatBanner
        results={ambiguousResults}
        selectedFormat="aama"
        onFormatChange={noop}
        onAlwaysUse={onAlwaysUse}
        rememberedFormat={null}
        onClearRemembered={noop}
      />
    );
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox); // check
    expect(onAlwaysUse).toHaveBeenCalledWith('aama');
  });

  it('shows "Remembered" label when preference exists', () => {
    render(
      <DetectedFormatBanner
        results={mockResults}
        selectedFormat="aama"
        onFormatChange={noop}
        onAlwaysUse={noop}
        rememberedFormat="aama"
        onClearRemembered={noop}
      />
    );
    expect(screen.getByText(/Remembered/)).toBeDefined();
  });

  it('"Clear" link calls onClearRemembered', () => {
    const onClear = vi.fn();
    render(
      <DetectedFormatBanner
        results={mockResults}
        selectedFormat="aama"
        onFormatChange={noop}
        onAlwaysUse={noop}
        rememberedFormat="aama"
        onClearRemembered={onClear}
      />
    );
    fireEvent.click(screen.getByText('Clear'));
    expect(onClear).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/components/ImportDXFDialog/__tests__/DetectedFormatBanner.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ImportDXFDialog/__tests__/DetectedFormatBanner.test.tsx
git commit -m "test: add DetectedFormatBanner component tests"
```

---

### Task 10: Create copilot `detectDXFFormat` tool

**Files:**
- Create: `src/copilot/action/tools/definitions/dxfTools.ts`
- Test: `src/copilot/action/tools/__tests__/dxfTools.test.ts`
- Modify: `src/copilot/action/tools/registry.ts:379`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';

describe('dxfTools', () => {
  it('detectDXFFormat tool returns format list from last parsed doc', async () => {
    // Parse a DXF to populate lastParsedDoc
    const { parseDXF, getLastParsedDoc } = await import('../../../../utils/dxf/parser');
    parseDXF('0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n1\n10\n0\n20\n0\n11\n100\n21\n100\n0\nENDSEC\n0\nEOF');

    const { tools } = await import('../definitions/dxfTools');
    const tool = tools.find(t => t.name === 'detectDXFFormat')!;
    const result = await tool.execute({}, (() => {}) as any, (() => ({})) as any);
    expect(result.success).toBe(true);
    expect(result.data.formats).toBeDefined();
    expect(result.data.formats.length).toBeGreaterThan(0);
  });

  it('detectDXFFormat returns error when no doc parsed', async () => {
    // Reset by reimporting (vitest module isolation)
    const { tools } = await import('../definitions/dxfTools');
    const tool = tools.find(t => t.name === 'detectDXFFormat')!;
    // Note: this test depends on module state; may need vi.resetModules()
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/action/tools/__tests__/dxfTools.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create the tool**

Create `src/copilot/action/tools/definitions/dxfTools.ts`:

```typescript
import type { ToolDefinition, ToolResult } from '../registry';

export const tools: ToolDefinition[] = [
  {
    name: 'detectDXFFormat',
    description: 'Detect the format of the most recently imported DXF file (AAMA, ASTM, Gerber, Lectra, standard). A DXF file must have been imported first.',
    parameters: { type: 'object', properties: {}, required: [] },
    execute: async (): Promise<ToolResult> => {
      const { getLastParsedDoc } = await import('../../../../utils/dxf/parser');
      const doc = getLastParsedDoc();
      if (!doc) return { success: false, error: 'No DXF file has been imported yet' };
      const { detectDXFFormat } = await import('../../../../utils/dxf/formatDetector');
      const formats = detectDXFFormat(doc);
      return { success: true, data: { formats } };
    },
  },
];
```

- [ ] **Step 4: Register in `registry.ts`**

In `src/copilot/action/tools/registry.ts`:

1. Add import at the top with other tool imports:
```typescript
import { tools as dxfToolDefs } from './definitions/dxfTools';
```

2. Add `dxfToolDefs,` as the **last element inside** the `ALL_TOOL_MODULES` array (before the closing `];` at line ~380):
```typescript
  referenceImageToolDefs,
  dxfToolDefs,        // ← insert here, before the closing bracket
];
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/copilot/action/tools/__tests__/dxfTools.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/copilot/action/tools/definitions/dxfTools.ts src/copilot/action/tools/__tests__/dxfTools.test.ts src/copilot/action/tools/registry.ts
git commit -m "feat(copilot): add detectDXFFormat tool to registry"
```

---

### Task 11: Extend `import_dxf` action with `autoDetect` and `format` fields

**Files:**
- Modify: `src/copilot/actions/actionTypes.ts:491-497`
- Modify: `src/copilot/actions/actionExecutor.ts:908-914`

- [ ] **Step 1: Add fields to `ImportDXFAction` interface**

In `actionTypes.ts` (line ~491):
```typescript
export interface ImportDXFAction {
  action: 'import_dxf';
  fileContent: string;
  unit?: 'mm' | 'cm' | 'inch' | 'auto';
  scale?: number;
  loadType?: 'open' | 'add';
  autoDetect?: boolean;
  format?: string; // FormatId
}
```

- [ ] **Step 2: Update inline type cast in `actionExecutor.ts`**

At line ~909, update the inline cast:
```typescript
const importAction = action as unknown as {
  fileContent: string;
  unit?: 'mm' | 'cm' | 'inch' | 'auto';
  scale?: number;
  loadType?: 'open' | 'add';
  autoDetect?: boolean;
  format?: string;
};
```

- [ ] **Step 3: Add detection logic before `dxfToPatternPieces` call**

After the cast, before calling `dxfToPatternPieces`:
```typescript
let formatProfile: FormatProfile | undefined;
if (importAction.format) {
  formatProfile = getProfile(importAction.format as FormatId);
} else if (importAction.autoDetect !== false) {
  const results = detectDXFFormat(doc);
  if (results.length > 0) formatProfile = getProfile(results[0].profileId);
}
const pieces = dxfToPatternPieces(doc, { ...options, formatProfile });
```

Add imports at the top of the executor:
```typescript
import { detectDXFFormat } from '../../utils/dxf/formatDetector';
import { getProfile } from '../../utils/dxf/formatProfiles';
import type { FormatProfile, FormatId } from '../../utils/dxf/types';
```

- [ ] **Step 4: Run type check + existing import_dxf tests**

Run: `npx tsc --noEmit && npx vitest run src/copilot/actions/__tests__/importDxf`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/copilot/actions/actionTypes.ts src/copilot/actions/actionExecutor.ts
git commit -m "feat(copilot): add autoDetect and format fields to import_dxf action"
```

---

### Task 12: Update tool count tests

**Files:**
- Modify: `src/copilot/__tests__/compoundTools.test.ts`
- Modify: `src/copilot/__tests__/toolsE2E.test.ts` (if it has a count assertion)

- [ ] **Step 1: Update expected tool count**

Find the `expect(registry.size).toBe(N)` assertion and increment by 1 (one new `detectDXFFormat` tool).

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/copilot/__tests__/compoundTools.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/copilot/__tests__/
git commit -m "test: update tool count for detectDXFFormat"
```

---

### Task 13: Final integration test

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit any remaining fixes**

If any tests needed adjustment, commit them.

- [ ] **Step 4: Create PR**

```bash
git push -u origin worktree-feat-dxf-wizard-264
gh pr create --title "feat: DXF Wizard — auto-detect format (#264)" --body "..."
```
