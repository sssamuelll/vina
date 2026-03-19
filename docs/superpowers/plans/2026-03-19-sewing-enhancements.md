# Sewing Enhancements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-seam tension/strength, M:N seam groups, piece/seam deactivation, seam taping, SeamPropertiesPanel, and 8 copilot tools.

**Architecture:** Extend the `Seam` type with tension/strength/active/taped fields and tStart/tEnd ranges. Add `SeamGroup` type for M:N sewing. Solver uses per-seam properties in `buildSeamConstraints`. New `SeamPropertiesPanel` component. 8 copilot tools registered. Diagnostic inspector extended.

**Tech Stack:** Redux Toolkit, React, Vitest, XPBD solver (seamAssembly.ts)

**Spec:** `docs/superpowers/specs/2026-03-19-sewing-enhancements-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/components/PropertiesPanel/SeamPropertiesPanel.tsx` | Seam property editor UI |
| `src/copilot/action/tools/definitions/sewingEnhancementTools.ts` | 8 copilot tools |
| `src/store/__tests__/projectSlice.sewing.test.ts` | Sewing action tests |

---

### Task 1: Extend Seam type + add PatternPiece.active

**Files:**
- Modify: `src/types/types.ts`

- [ ] **Step 1: Extend Seam interface**

Read `src/types/types.ts`. Find the `Seam` interface. Update it:

```typescript
export interface Seam {
  id: string;
  pieceA: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number };
  pieceB: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number };
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';
  tension: number;       // 100 = neutral, <100 = gathering, >100 = easing. Default 100.
  strength: number;      // 0-1, constraint force. Default 1.0.
  active: boolean;       // false = excluded from simulation. Default true.
  taped: boolean;        // true = 10x stiffer. Default false.
  tapeWidth: number;     // mm, visual only. Default 10.
}
```

Add `SeamGroup` interface after `Seam`:

```typescript
export interface SeamGroup {
  id: string;
  edgesA: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number }[];
  edgesB: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number }[];
  type: Seam['type'];
  tension: number;
  strength: number;
  active: boolean;
  taped: boolean;
  tapeWidth: number;
}
```

Add `active: boolean` to `PatternPiece` (after the existing `locked?` field):

```typescript
/** Whether this piece participates in simulation. Default true. */
active: boolean;
```

Add `seamGroups?: SeamGroup[]` to `OpenCloProject` interface.

- [ ] **Step 2: Fix all type errors**

Run `npx tsc --noEmit`. The extended `Seam` type now requires `tension`, `strength`, `active`, `taped`, `tapeWidth` on every `Seam` literal in the codebase. Fix all constructors:
- `useSegmentSewingTool.ts` — add defaults when creating seam
- `useFreeSewingTool.ts` — add defaults
- `ContextMenu.tsx` — if seams are created there
- Test files — add defaults to mock Seam objects
- `copilot/action/tools/definitions/seamTools.ts` — add defaults in createSeam tool

Default values: `tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10`

Similarly, `PatternPiece.active` needs defaults everywhere PatternPiece objects are created. Add `active: true` to all constructors.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(sewing): extend Seam type with tension/strength/active/taped, add SeamGroup, add PatternPiece.active"
```

---

### Task 2: Redux actions — updateSeam, deactivation, seam groups

**Files:**
- Modify: `src/store/projectSlice.ts`
- Create: `src/store/__tests__/projectSlice.sewing.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/store/__tests__/projectSlice.sewing.test.ts
import { describe, it, expect } from 'vitest';
import reducer, {
  addSeam, updateSeam, setSeamTension, deactivateSeam, deactivatePiece,
  addSeamGroup, removeSeamGroup, addPiece,
} from '../projectSlice';
import type { Seam, PatternPiece, SeamGroup } from '../../types/types';

function makeSeam(overrides: Partial<Seam> = {}): Seam {
  return {
    id: 's1', type: 'standard',
    pieceA: { pieceId: 'p1', edgeName: 'side' },
    pieceB: { pieceId: 'p2', edgeName: 'side' },
    tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
    ...overrides,
  };
}

function makePiece(id: string): PatternPiece {
  return {
    id, name: id, outline: [], internals: [],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, layer: 1, sublayer: 0, active: true,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

const initialState = reducer(undefined, { type: '@@INIT' });

describe('sewing enhancements', () => {
  describe('updateSeam', () => {
    it('replaces seam by id', () => {
      let state = reducer(initialState, addSeam(makeSeam()));
      const updated = { ...makeSeam(), tension: 80 };
      state = reducer(state, updateSeam(updated));
      expect(state.seams[0].tension).toBe(80);
    });
  });

  describe('setSeamTension', () => {
    it('sets tension clamped to 10-200', () => {
      let state = reducer(initialState, addSeam(makeSeam()));
      state = reducer(state, setSeamTension({ seamId: 's1', tension: 5, strength: 0.5 }));
      expect(state.seams[0].tension).toBe(10); // clamped
      expect(state.seams[0].strength).toBe(0.5);
    });

    it('clamps strength to 0.01-1.0', () => {
      let state = reducer(initialState, addSeam(makeSeam()));
      state = reducer(state, setSeamTension({ seamId: 's1', tension: 100, strength: 0 }));
      expect(state.seams[0].strength).toBe(0.01);
    });
  });

  describe('deactivateSeam', () => {
    it('toggles seam active state', () => {
      let state = reducer(initialState, addSeam(makeSeam()));
      state = reducer(state, deactivateSeam({ seamId: 's1', active: false }));
      expect(state.seams[0].active).toBe(false);
    });
  });

  describe('deactivatePiece', () => {
    it('toggles piece active state', () => {
      let state = reducer(initialState, addPiece(makePiece('p1')));
      state = reducer(state, deactivatePiece({ pieceId: 'p1', active: false }));
      expect(state.pieces.find(p => p.id === 'p1')?.active).toBe(false);
    });
  });

  describe('addSeam defaults', () => {
    it('backfills defaults on addSeam', () => {
      const minimalSeam = {
        id: 's2', type: 'standard' as const,
        pieceA: { pieceId: 'p1', edgeName: 'a' },
        pieceB: { pieceId: 'p2', edgeName: 'b' },
      } as Seam;
      const state = reducer(initialState, addSeam(minimalSeam));
      const seam = state.seams.find(s => s.id === 's2');
      expect(seam?.tension).toBe(100);
      expect(seam?.strength).toBe(1.0);
      expect(seam?.active).toBe(true);
      expect(seam?.taped).toBe(false);
      expect(seam?.tapeWidth).toBe(10);
    });
  });

  describe('seamGroups', () => {
    it('adds and removes seam group', () => {
      const group: SeamGroup = {
        id: 'sg1',
        edgesA: [{ pieceId: 'p1', edgeName: 'a' }],
        edgesB: [{ pieceId: 'p2', edgeName: 'b' }, { pieceId: 'p3', edgeName: 'c' }],
        type: 'standard', tension: 100, strength: 1.0,
        active: true, taped: false, tapeWidth: 10,
      };
      let state = reducer(initialState, addSeamGroup(group));
      expect(state.seamGroups).toHaveLength(1);
      state = reducer(state, removeSeamGroup('sg1'));
      expect(state.seamGroups).toHaveLength(0);
    });
  });

  describe('loadProject migration', () => {
    it('backfills seam defaults on load', () => {
      // Seams loaded without new fields should get defaults
      // This is tested by the loadProject reducer
    });
  });
});
```

- [ ] **Step 2: Implement Redux actions**

In `src/store/projectSlice.ts`:

1. Add `seamGroups: SeamGroup[]` to `ProjectState` interface and initial state (`seamGroups: []`).

2. Update `addSeam` to backfill defaults:
```typescript
addSeam(state, action: PayloadAction<Seam>) {
  const seam = {
    tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
    ...action.payload,
  };
  state.seams.push(seam);
  state.isDirty = true;
},
```

3. Add new reducers:
```typescript
updateSeam(state, action: PayloadAction<Seam>) {
  const idx = state.seams.findIndex(s => s.id === action.payload.id);
  if (idx !== -1) { state.seams[idx] = action.payload; state.isDirty = true; }
},

setSeamTension(state, action: PayloadAction<{ seamId: string; tension: number; strength?: number }>) {
  const seam = state.seams.find(s => s.id === action.payload.seamId);
  if (seam) {
    seam.tension = Math.max(10, Math.min(200, action.payload.tension));
    if (action.payload.strength !== undefined) {
      seam.strength = Math.max(0.01, Math.min(1.0, action.payload.strength));
    }
    state.isDirty = true;
  }
},

deactivateSeam(state, action: PayloadAction<{ seamId: string; active: boolean }>) {
  const seam = state.seams.find(s => s.id === action.payload.seamId);
  if (seam) { seam.active = action.payload.active; state.isDirty = true; }
},

deactivatePiece(state, action: PayloadAction<{ pieceId: string; active: boolean }>) {
  const piece = state.pieces.find(p => p.id === action.payload.pieceId);
  if (piece) { piece.active = action.payload.active; state.isDirty = true; }
},

addSeamGroup(state, action: PayloadAction<SeamGroup>) {
  state.seamGroups.push(action.payload);
  state.isDirty = true;
},

removeSeamGroup(state, action: PayloadAction<string>) {
  state.seamGroups = state.seamGroups.filter(g => g.id !== action.payload);
  state.isDirty = true;
},
```

4. Export all new actions.

5. Update `loadProject` to backfill seam defaults:
```typescript
// After existing piece backfill:
for (const seam of state.seams) {
  if ((seam as any).tension === undefined) seam.tension = 100;
  if ((seam as any).strength === undefined) seam.strength = 1.0;
  if ((seam as any).active === undefined) seam.active = true;
  if ((seam as any).taped === undefined) seam.taped = false;
  if ((seam as any).tapeWidth === undefined) seam.tapeWidth = 10;
}
for (const piece of state.pieces) {
  if ((piece as any).active === undefined) piece.active = true;
}
state.seamGroups = (action.payload as any).seamGroups ?? [];
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/store/__tests__/projectSlice.sewing.test.ts`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(sewing): add updateSeam, setSeamTension, deactivation, seamGroup Redux actions"
```

---

### Task 3: Solver — per-seam tension/strength/range in seamAssembly

**Files:**
- Modify: `src/utils/cloth/seamAssembly.ts`

- [ ] **Step 1: Read seamAssembly.ts thoroughly**

Read the full file. Understand `buildSeamConstraints()`, `parameterizeEdge()`, `matchVertices()`, and `SeamConstraintConfig`.

- [ ] **Step 2: Update buildSeamConstraints to use per-seam properties**

In `buildSeamConstraints()`:

1. Skip inactive seams: at the start of the per-seam loop, add `if (!seam.active) continue;`

2. Apply t-range: when calling `parameterizeEdge()`, pass `tStart`/`tEnd` if defined on the seam side. If `parameterizeEdge` doesn't accept a range, filter the returned vertices to only include those within the t-range.

3. Apply tension: after getting vertex lists for both sides, if `tension !== 100`, modify the t-parameter distribution on the longer side. Scale the t-parameters by `tension / 100` to compress/expand the matching region.

4. Compute per-seam compliance:
```typescript
const baseCompliance = config.compliance[seam.type];
const seamCompliance = (baseCompliance / (seam.strength ?? 1.0)) * (seam.taped ? 0.1 : 1.0);
```

5. Use `seamCompliance` when setting the compliance for this seam's constraint pairs (instead of the type-level compliance from config).

- [ ] **Step 3: Run type check + existing tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(sewing): per-seam tension/strength/range/tape in solver constraint building"
```

---

### Task 4: Worker bridge — pass extended SeamInitData

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx`
- Modify: `src/utils/cloth/clothWorker.ts` (SeamInitData type)

- [ ] **Step 1: Update seamsToInitData in GarmentSimulation.tsx**

Read `src/components/Viewport3D/GarmentSimulation.tsx`. Find `seamsToInitData()` function. Update it to pass new fields:

```typescript
function seamsToInitData(seams: Seam[], seamGroups?: SeamGroup[]): SeamInitData[] {
  const result: SeamInitData[] = seams
    .filter(s => s.active !== false) // exclude inactive
    .map(s => ({
      id: s.id,
      pieceAId: s.pieceA.pieceId,
      pieceAEdgeName: s.pieceA.edgeName,
      pieceARange: s.pieceA.tStart != null ? [s.pieceA.tStart, s.pieceA.tEnd ?? 1.0] as [number, number] : undefined,
      pieceBId: s.pieceB.pieceId,
      pieceBEdgeName: s.pieceB.edgeName,
      pieceBRange: s.pieceB.tStart != null ? [s.pieceB.tStart, s.pieceB.tEnd ?? 1.0] as [number, number] : undefined,
      type: s.type,
      tension: s.tension ?? 100,
      strength: s.strength ?? 1.0,
      active: s.active ?? true,
      taped: s.taped ?? false,
    }));

  // Flatten SeamGroups into SeamInitData entries
  if (seamGroups) {
    for (const group of seamGroups) {
      if (!group.active) continue;
      // Each edge pair in the group becomes a SeamInitData entry
      // The constraint builder handles proportional matching
      for (let i = 0; i < Math.max(group.edgesA.length, group.edgesB.length); i++) {
        const edgeA = group.edgesA[Math.min(i, group.edgesA.length - 1)];
        const edgeB = group.edgesB[Math.min(i, group.edgesB.length - 1)];
        result.push({
          id: `${group.id}-${i}`,
          pieceAId: edgeA.pieceId,
          pieceAEdgeName: edgeA.edgeName,
          pieceARange: edgeA.tStart != null ? [edgeA.tStart, edgeA.tEnd ?? 1.0] : undefined,
          pieceBId: edgeB.pieceId,
          pieceBEdgeName: edgeB.edgeName,
          pieceBRange: edgeB.tStart != null ? [edgeB.tStart, edgeB.tEnd ?? 1.0] : undefined,
          type: group.type,
          tension: group.tension,
          strength: group.strength,
          active: true,
          taped: group.taped,
        });
      }
    }
  }
  return result;
}
```

Also update the `useMemo` call to include `seamGroups`:
```typescript
const seamGroups = useSelector((s: RootState) => s.project.seamGroups);
const seamInitData = useMemo(() => seamsToInitData(seams, seamGroups), [seams, seamGroups]);
```

Also filter inactive pieces before passing to `initMultiPiece`:
```typescript
const activePieces = pieces.filter(p => p.active !== false);
```

- [ ] **Step 2: Update SeamInitData type in clothWorker.ts**

Read `src/utils/cloth/clothWorker.ts`. Find `SeamInitData` interface. Extend it:

```typescript
export interface SeamInitData {
  id: string;
  pieceAId: string;
  pieceAEdgeName: string;
  pieceARange?: [number, number];
  pieceBId: string;
  pieceBEdgeName: string;
  pieceBRange?: [number, number];
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';
  tension: number;
  strength: number;
  active: boolean;
  taped: boolean;
}
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(sewing): pass extended SeamInitData with tension/strength/range through worker bridge"
```

---

### Task 5: SeamPropertiesPanel UI

**Files:**
- Create: `src/components/PropertiesPanel/SeamPropertiesPanel.tsx`
- Modify: `src/components/PropertiesPanel/PropertiesPanel.tsx`

- [ ] **Step 1: Create SeamPropertiesPanel**

Read `src/components/PropertiesPanel/PieceProperties.tsx` for the pattern. Create a similar component for seam editing:

```typescript
// src/components/PropertiesPanel/SeamPropertiesPanel.tsx
import { useDispatch } from 'react-redux';
import { updateSeam, setSeamTension, deactivateSeam, removeSeam, reverseSeam } from '../../store/projectSlice';
import type { Seam } from '../../types/types';
import PropertySection from './PropertySection';

interface SeamPropertiesPanelProps {
  seam: Seam;
  collapsed: boolean;
  onToggle: (id: string) => void;
}

export default function SeamPropertiesPanel({ seam, collapsed, onToggle }: SeamPropertiesPanelProps) {
  const dispatch = useDispatch();

  return (
    <>
      <PropertySection id="seam-props" title="SEAM" collapsed={collapsed} onToggle={onToggle}>
        {/* Type dropdown */}
        <div className="panel-field">
          <label>Type</label>
          <select
            className="panel-input"
            value={seam.type}
            onChange={e => dispatch(updateSeam({ ...seam, type: e.target.value as Seam['type'] }))}
          >
            <option value="standard">Standard</option>
            <option value="french">French</option>
            <option value="flat-felled">Flat-felled</option>
            <option value="overlock">Overlock</option>
          </select>
        </div>

        {/* Tension slider */}
        <div className="panel-field">
          <label>Tension {seam.tension < 100 ? '(Gathering)' : seam.tension > 100 ? '(Easing)' : ''}</label>
          <input
            type="range" className="panel-slider"
            min={10} max={200} value={seam.tension}
            onChange={e => dispatch(setSeamTension({ seamId: seam.id, tension: Number(e.target.value) }))}
          />
          <span className="panel-value">{seam.tension}%</span>
        </div>

        {/* Strength slider */}
        <div className="panel-field">
          <label>Strength</label>
          <input
            type="range" className="panel-slider"
            min={1} max={100} value={Math.round(seam.strength * 100)}
            onChange={e => dispatch(setSeamTension({ seamId: seam.id, tension: seam.tension, strength: Number(e.target.value) / 100 }))}
          />
          <span className="panel-value">{seam.strength.toFixed(2)}</span>
        </div>

        {/* Tape toggle */}
        <div className="panel-field">
          <label>
            <input
              type="checkbox" checked={seam.taped}
              onChange={e => dispatch(updateSeam({ ...seam, taped: e.target.checked }))}
            /> Taped
          </label>
          {seam.taped && (
            <input
              type="number" className="panel-input narrow"
              value={seam.tapeWidth} min={3} max={30}
              onChange={e => dispatch(updateSeam({ ...seam, tapeWidth: Number(e.target.value) }))}
            />
          )}
        </div>

        {/* Action buttons */}
        <div className="panel-actions">
          <button className="panel-btn" onClick={() => dispatch(deactivateSeam({ seamId: seam.id, active: !seam.active }))}>
            {seam.active ? 'Deactivate' : 'Activate'}
          </button>
          <button className="panel-btn" onClick={() => dispatch(reverseSeam(seam.id))}>Reverse</button>
          <button className="panel-btn panel-btn-danger" onClick={() => dispatch(removeSeam(seam.id))}>Delete</button>
        </div>
      </PropertySection>
    </>
  );
}
```

- [ ] **Step 2: Wire into PropertiesPanel**

Read `src/components/PropertiesPanel/PropertiesPanel.tsx`. Add rendering of `SeamPropertiesPanel` when a seam is selected. The `editorSlice` has `selectedSeamId`. When set, find the seam and render the panel.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(sewing): add SeamPropertiesPanel with tension, strength, tape, deactivation controls"
```

---

### Task 6: Piece deactivation UI + seam rendering updates

**Files:**
- Modify: `src/components/PatternEditor/ContextMenu.tsx`
- Modify: `src/components/Viewport3D/ContextMenu3D.tsx`
- Modify: `src/components/PatternEditor/renderers/SeamRenderer.tsx`
- Modify: `src/components/PatternEditor/renderers/PieceRenderer.tsx`

- [ ] **Step 1: Add "Deactivate Piece" to 2D context menu**

In `ContextMenu.tsx`, add a menu item when `menu.pieceId` is set:

```typescript
import { deactivatePiece } from '../../store/projectSlice';

// In piece menu items:
{
  label: piece.active !== false ? 'Deactivate Piece' : 'Activate Piece',
  icon: piece.active !== false ? '⏸' : '▶',
  action: () => dispatch(deactivatePiece({ pieceId: menu.pieceId!, active: piece.active === false })),
}
```

- [ ] **Step 2: Add to 3D context menu**

Same pattern in `ContextMenu3D.tsx` — add `onDeactivatePiece` prop and wire it.

- [ ] **Step 3: Update SeamRenderer for inactive/taped/tension**

Read `src/components/PatternEditor/renderers/SeamRenderer.tsx`. Add visual changes:
- Inactive seams: `strokeDasharray="4 3"` and `stroke="#666"` (gray dashed)
- Taped seams: `strokeWidth` doubled (e.g., 3 instead of 1.5)
- Tension label: when `seam.tension !== 100`, show a small `<text>` element near midpoint with `{seam.tension}%`

- [ ] **Step 4: Update PieceRenderer for inactive pieces**

Read `PieceRenderer.tsx`. When `piece.active === false`, render with `opacity={0.3}` and gray fill override.

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(sewing): piece deactivation UI + seam rendering (inactive/taped/tension label)"
```

---

### Task 7: Copilot tools — 8 sewing enhancement tools

**Files:**
- Create: `src/copilot/action/tools/definitions/sewingEnhancementTools.ts`
- Modify: `src/copilot/action/tools/registry.ts`

- [ ] **Step 1: Create sewingEnhancementTools.ts**

Read `src/copilot/action/tools/definitions/pieceTools.ts` for the pattern. Create 8 tools:

1. **setSeamTension** — `{ seamId, tension, strength? }` → dispatch setSeamTension
2. **setSeamRange** — `{ seamId, side, tStart, tEnd }` → dispatch updateSeam with modified tStart/tEnd
3. **setSeamTape** — `{ seamId, taped, tapeWidth? }` → dispatch updateSeam
4. **setSeamActive** — `{ seamId, active }` → dispatch deactivateSeam
5. **setPieceActive** — `{ pieceId, active }` → dispatch deactivatePiece
6. **createSeamGroup** — `{ edgesA[], edgesB[], type, tension? }` → dispatch addSeamGroup
7. **getSeamInfo** — `{ seamId? }` → read-only, return seam properties
8. **analyzeGathering** — `{ seamId }` → compute edge lengths, suggest tension

Each tool has: name, description (bilingual), parameters (JSON Schema), execute function, rollback where applicable.

The `analyzeGathering` tool is the intelligent one — it reads both edges' lengths from piece outlines and suggests optimal tension:
```typescript
// Compute lengths
const lengthA = computeEdgeLength(pieceA, edgeA);
const lengthB = computeEdgeLength(pieceB, edgeB);
const ratio = Math.round((lengthB / lengthA) * 100);
return {
  success: true,
  data: {
    edgeALength: lengthA,
    edgeBLength: lengthB,
    suggestedTension: ratio,
    analysis: `Edge A is ${lengthA.toFixed(1)}mm, Edge B is ${lengthB.toFixed(1)}mm. Suggested tension: ${ratio}% for natural match.`,
  },
};
```

- [ ] **Step 2: Register tools**

Read `src/copilot/action/tools/registry.ts`. Import and register `sewingEnhancementTools`. Follow the pattern used for `layerTools`.

- [ ] **Step 3: Update tool count tests**

Update `src/copilot/__tests__/compoundTools.test.ts` and `toolsE2E.test.ts` — increment expected tool count by 8 (135 → 143). Add new tool names to the expected list.

- [ ] **Step 4: Run type check + tests**

Run: `npx tsc --noEmit && npx vitest run src/copilot/__tests__/`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sewing): register 8 copilot tools (tension, range, tape, active, seamGroup, analyze)"
```

---

### Task 8: Diagnostic inspector integration

**Files:**
- Modify: `src/diagnostics/types.ts`
- Modify: `src/diagnostics/dataCollector.ts`
- Modify: `src/diagnostics/ruleEngine.ts`

- [ ] **Step 1: Extend InspectionSeamData**

In `src/diagnostics/types.ts`, add to `InspectionSeamData`:

```typescript
tension?: number;
strength?: number;
active?: boolean;
taped?: boolean;
```

- [ ] **Step 2: Update dataCollector**

In `src/diagnostics/dataCollector.ts`, update the seam mapping to include new fields:

```typescript
// In the seams mapping:
tension: s.tension,
strength: s.strength,
active: s.active,
taped: s.taped,
```

Also add `pieceActive: piece.active` to the returned InspectionData (or include in the existing piece data).

- [ ] **Step 3: Add sewing diagnostic rules**

In `src/diagnostics/ruleEngine.ts`, add rules:

```typescript
// Extreme tension
for (const seam of data.seams) {
  if (seam.tension !== undefined && seam.tension < 50) {
    diags.push({ severity: 'warning', category: 'sewing', message: `Seam to ${seam.partnerPieceName}: extreme gathering (${seam.tension}%)` });
  }
  if (seam.tension !== undefined && seam.tension > 150) {
    diags.push({ severity: 'warning', category: 'sewing', message: `Seam to ${seam.partnerPieceName}: extreme easing (${seam.tension}%)` });
  }
}

// Inactive piece with active seams
if (data.piece && (data as any).pieceActive === false) {
  const activeSeams = data.seams.filter(s => s.active !== false);
  if (activeSeams.length > 0) {
    diags.push({ severity: 'info', category: 'sewing', message: 'Inactive piece has active seam connections' });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/diagnostics/`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sewing): add tension/deactivation rules to diagnostic inspector"
```

---

### Task 9: Final type check + full test suite

**Files:** None (verification only)

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 3: Manual smoke test checklist**

1. Create two pieces with a seam → select seam → SeamPropertiesPanel appears
2. Adjust tension slider to 80% → "Gathering" label shows
3. Adjust strength slider → verify control works
4. Toggle tape checkbox → verify tape width input appears
5. Click "Deactivate" → seam renders dashed/gray
6. Right-click piece → "Deactivate Piece" → piece grays out, excluded from sim
7. Copilot: "set the armhole seam to 90% tension" → setSeamTension executes
8. Copilot: "analyze gathering on this seam" → analyzeGathering returns suggestion

- [ ] **Step 4: Commit if adjustments needed**

```bash
git commit -m "feat(sewing): Sewing Enhancements (#368) — final adjustments"
```
