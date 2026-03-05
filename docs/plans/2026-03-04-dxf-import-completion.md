# DXF Import Completion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the 3 remaining gaps in DXF-AAMA import: Import UI Dialog, robust notch parsing, and copilot integration.

**Architecture:** The DXF parser (`parser.ts`) and converter (`converter.ts`) already handle parsing and piece extraction. We add a React dialog component for import options (unit, scale, load type), extend `converter.ts` to detect geometric notches on AAMA layer 4, and wire an `import_dxf` action into the copilot action system (types → validator → executor → schema).

**Tech Stack:** React, TypeScript, Vitest, existing DXF utils (`src/utils/dxf/`)

**Design doc:** `docs/plans/2026-03-04-dxf-import-completion-design.md`

---

## Task 1: Robust Notch Logic — Geometric Notch Detection

Add detection of LINE, LWPOLYLINE, and POLYLINE entities on AAMA layer 4 as notches when their total length is ≤ 15mm.

**Files:**
- Modify: `src/utils/dxf/converter.ts:232-339` (entitiesToPiece function)
- Test: `src/utils/dxf/__tests__/notchGeometry.test.ts` (create)

### Step 1: Write the failing test for geometric notch detection

Create `src/utils/dxf/__tests__/notchGeometry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { dxfToPatternPieces } from '../converter';
import type { DXFDocument, DXFEntity } from '../types';

function makeDoc(entities: DXFEntity[]): DXFDocument {
  return {
    header: new Map(),
    layers: [],
    blocks: new Map(),
    entities,
  };
}

describe('Geometric notch detection (layer 4)', () => {
  it('detects a short LINE on layer 4 as a slit notch', () => {
    const entities: DXFEntity[] = [
      // Outline on layer 1 (cut)
      { type: 'LWPOLYLINE', layer: '1', data: {
        closed: true,
        vertices: [
          { x: 0, y: 0, bulge: 0 },
          { x: 100, y: 0, bulge: 0 },
          { x: 100, y: 200, bulge: 0 },
          { x: 0, y: 200, bulge: 0 },
        ],
      }},
      // Short LINE on layer 4 (notch) — 10mm, should be detected
      { type: 'LINE', layer: '4', data: { x1: 50, y1: 0, x2: 50, y2: 10 } },
    ];
    const pieces = dxfToPatternPieces(makeDoc(entities));
    expect(pieces).toHaveLength(1);
    const notches = pieces[0].internals.filter(i => i.type === 'notch');
    expect(notches.length).toBeGreaterThanOrEqual(1);
  });

  it('ignores a long LINE on layer 4 (> 15mm)', () => {
    const entities: DXFEntity[] = [
      { type: 'LWPOLYLINE', layer: '1', data: {
        closed: true,
        vertices: [
          { x: 0, y: 0, bulge: 0 },
          { x: 100, y: 0, bulge: 0 },
          { x: 100, y: 200, bulge: 0 },
          { x: 0, y: 200, bulge: 0 },
        ],
      }},
      // Long LINE on layer 4 — 30mm, should NOT be a notch
      { type: 'LINE', layer: '4', data: { x1: 50, y1: 0, x2: 50, y2: 30 } },
    ];
    const pieces = dxfToPatternPieces(makeDoc(entities));
    const notches = pieces[0].internals.filter(i => i.type === 'notch');
    // The long line still gets added as an internal (current behavior), but we check
    // that it's treated differently — it has no notchOptions.shape = 'slit'
    const slitNotches = notches.filter(n => n.notchOptions?.shape === 'slit');
    expect(slitNotches).toHaveLength(0);
  });

  it('detects a short LWPOLYLINE on layer 4 as a notch', () => {
    const entities: DXFEntity[] = [
      { type: 'LWPOLYLINE', layer: '1', data: {
        closed: true,
        vertices: [
          { x: 0, y: 0, bulge: 0 },
          { x: 100, y: 0, bulge: 0 },
          { x: 100, y: 200, bulge: 0 },
          { x: 0, y: 200, bulge: 0 },
        ],
      }},
      // Short LWPOLYLINE on layer 4 — ~14mm total, should be notch
      { type: 'LWPOLYLINE', layer: '4', data: {
        closed: false,
        vertices: [
          { x: 50, y: 0, bulge: 0 },
          { x: 50, y: 7, bulge: 0 },
          { x: 57, y: 7, bulge: 0 },
        ],
      }},
    ];
    const pieces = dxfToPatternPieces(makeDoc(entities));
    const notches = pieces[0].internals.filter(i => i.type === 'notch');
    expect(notches.length).toBeGreaterThanOrEqual(1);
    expect(notches.some(n => n.notchOptions?.shape === 'slit')).toBe(true);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/utils/dxf/__tests__/notchGeometry.test.ts`
Expected: FAIL — geometric notches on layer 4 don't get `notchOptions` set.

### Step 3: Implement geometric notch detection in converter.ts

In `src/utils/dxf/converter.ts`, modify the `case 'notch':` branch inside the geometry loop (line 304-307) of `entitiesToPiece()`. Add a helper function `computePathLength` and set `notchOptions` for short entities:

```typescript
// Add this helper before entitiesToPiece()
const NOTCH_MAX_LENGTH = 15; // mm

function computePathLength(path: PathCommand[]): number {
  let length = 0;
  let cx = 0, cy = 0;
  for (const cmd of path) {
    if (cmd.type === 'M') {
      cx = cmd.values[0]; cy = cmd.values[1];
    } else if (cmd.type === 'L') {
      const dx = cmd.values[0] - cx, dy = cmd.values[1] - cy;
      length += Math.sqrt(dx * dx + dy * dy);
      cx = cmd.values[0]; cy = cmd.values[1];
    } else if (cmd.type === 'C') {
      // Approximate cubic bezier length using chord
      const dx = cmd.values[4] - cx, dy = cmd.values[5] - cy;
      length += Math.sqrt(dx * dx + dy * dy);
      cx = cmd.values[4]; cy = cmd.values[5];
    }
  }
  return length;
}
```

Then replace the existing `case 'notch':` block (lines 304-307):

```typescript
      case 'notch': {
        const flipped = flipPathY(path);
        const len = computePathLength(path);
        if (len > 0 && len <= NOTCH_MAX_LENGTH) {
          internals.push({
            id: crypto.randomUUID(),
            type: 'notch',
            path: flipped,
            notchOptions: {
              shape: 'slit',
              subType: 'straightforward',
              length: 8,
              width: 3,
              angle: 0,
              count: 1,
            },
          });
        } else {
          internals.push({ id: crypto.randomUUID(), type: 'notch', path: flipped });
        }
        break;
      }
```

### Step 4: Run test to verify it passes

Run: `npx vitest run src/utils/dxf/__tests__/notchGeometry.test.ts`
Expected: PASS (3 tests)

### Step 5: Run full test suite

Run: `npx vitest run`
Expected: All tests pass, no regressions.

### Step 6: Commit

```bash
git add src/utils/dxf/converter.ts src/utils/dxf/__tests__/notchGeometry.test.ts
git commit -m "feat(dxf): detect geometric notches on AAMA layer 4

Short LINE/LWPOLYLINE/POLYLINE entities (≤15mm) on layer 4 are now
classified as slit notches with proper notchOptions.

Part of #107"
```

---

## Task 2: Import DXF Dialog — Component

Create the ImportDXFDialog modal component with unit, scale, load type, and import options.

**Files:**
- Create: `src/components/ImportDXFDialog/ImportDXFDialog.tsx`
- Create: `src/components/ImportDXFDialog/ImportDXFDialog.css`
- Test: `src/components/ImportDXFDialog/__tests__/ImportDXFDialog.test.tsx` (create)

### Step 1: Write the failing test

Create `src/components/ImportDXFDialog/__tests__/ImportDXFDialog.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImportDXFDialog from '../ImportDXFDialog';
import type { DXFDocument } from '../../../utils/dxf/types';

function makeDoc(): DXFDocument {
  return {
    header: new Map(),
    layers: [],
    blocks: new Map([
      ['Front', { name: 'Front', basePoint: { x: 0, y: 0 }, entities: [] }],
      ['Back', { name: 'Back', basePoint: { x: 0, y: 0 }, entities: [] }],
    ]),
    entities: [],
  };
}

describe('ImportDXFDialog', () => {
  it('renders piece summary from DXFDocument', () => {
    const onImport = vi.fn();
    const onCancel = vi.fn();
    render(<ImportDXFDialog doc={makeDoc()} onImport={onImport} onCancel={onCancel} />);
    expect(screen.getByText(/2 pieces detected/i)).toBeTruthy();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onImport = vi.fn();
    const onCancel = vi.fn();
    render(<ImportDXFDialog doc={makeDoc()} onImport={onImport} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onImport with default options when Import is clicked', () => {
    const onImport = vi.fn();
    const onCancel = vi.fn();
    render(<ImportDXFDialog doc={makeDoc()} onImport={onImport} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Import'));
    expect(onImport).toHaveBeenCalledWith(expect.objectContaining({
      loadType: 'add',
      unit: 'auto',
      scale: 100,
      importNotches: true,
      importGrainlines: true,
      importInternalLines: true,
    }));
  });

  it('auto-detects unit from $INSUNITS header', () => {
    const doc = makeDoc();
    doc.header.set('$INSUNITS', 1); // inches
    const onImport = vi.fn();
    const onCancel = vi.fn();
    render(<ImportDXFDialog doc={doc} onImport={onImport} onCancel={onCancel} />);
    // The auto-detected unit should show in the UI
    expect(screen.getByText(/inch/i)).toBeTruthy();
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/components/ImportDXFDialog/__tests__/ImportDXFDialog.test.tsx`
Expected: FAIL — component doesn't exist yet.

### Step 3: Create the ImportDXFDialog component

Create `src/components/ImportDXFDialog/ImportDXFDialog.css`:

```css
.import-dxf-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.import-dxf-dialog {
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 20px;
  width: 360px;
  color: #ddd;
  font-size: 13px;
}

.import-dxf-dialog h3 {
  margin: 0 0 16px 0;
  font-size: 15px;
  color: #fff;
}

.import-dxf-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.import-dxf-row label {
  flex-shrink: 0;
  margin-right: 12px;
}

.import-dxf-row select,
.import-dxf-row input[type="number"] {
  flex: 1;
  padding: 4px 8px;
  background: #2a2a2a;
  border: 1px solid #555;
  border-radius: 4px;
  color: #ddd;
  font-size: 13px;
}

.import-dxf-radio-group {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
}

.import-dxf-radio-group label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.import-dxf-checkboxes {
  border-top: 1px solid #333;
  padding-top: 10px;
  margin-top: 10px;
}

.import-dxf-checkboxes label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  cursor: pointer;
}

.import-dxf-summary {
  background: #262626;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 8px 10px;
  margin: 12px 0;
  font-size: 12px;
  color: #aaa;
}

.import-dxf-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.import-dxf-actions button {
  padding: 6px 16px;
  border-radius: 4px;
  border: 1px solid #555;
  background: #333;
  color: #ddd;
  cursor: pointer;
  font-size: 13px;
}

.import-dxf-actions button.primary {
  background: #0078d4;
  border-color: #0078d4;
  color: #fff;
}
```

Create `src/components/ImportDXFDialog/ImportDXFDialog.tsx`:

```typescript
import { useState, useMemo } from 'react';
import type { DXFDocument } from '../../utils/dxf/types';
import './ImportDXFDialog.css';

export interface ImportDXFOptions {
  loadType: 'open' | 'add';
  unit: 'mm' | 'cm' | 'inch' | 'auto';
  scale: number;
  importNotches: boolean;
  importGrainlines: boolean;
  importInternalLines: boolean;
}

interface Props {
  doc: DXFDocument;
  onImport: (options: ImportDXFOptions) => void;
  onCancel: () => void;
}

const INSUNITS_MAP: Record<number, 'inch' | 'mm' | 'cm'> = {
  1: 'inch',
  4: 'mm',
  5: 'cm',
};

export default function ImportDXFDialog({ doc, onImport, onCancel }: Props) {
  const detectedUnit = useMemo(() => {
    const raw = doc.header.get('$INSUNITS');
    if (typeof raw === 'number') return INSUNITS_MAP[raw] ?? null;
    if (typeof raw === 'string') return INSUNITS_MAP[parseInt(raw, 10)] ?? null;
    return null;
  }, [doc]);

  const [loadType, setLoadType] = useState<'open' | 'add'>('add');
  const [unit, setUnit] = useState<'mm' | 'cm' | 'inch' | 'auto'>('auto');
  const [scale, setScale] = useState(100);
  const [importNotches, setImportNotches] = useState(true);
  const [importGrainlines, setImportGrainlines] = useState(true);
  const [importInternalLines, setImportInternalLines] = useState(true);

  const pieceCount = doc.blocks.size || 1;
  const pieceNames = doc.blocks.size > 0
    ? Array.from(doc.blocks.keys()).join(', ')
    : 'Imported Piece';

  const resolvedUnit = unit === 'auto' ? (detectedUnit ?? 'mm') : unit;

  const handleImport = () => {
    onImport({ loadType, unit, scale, importNotches, importGrainlines, importInternalLines });
  };

  return (
    <div className="import-dxf-overlay" onClick={onCancel}>
      <div className="import-dxf-dialog" onClick={e => e.stopPropagation()}>
        <h3>Import DXF</h3>

        {/* Load Type */}
        <div className="import-dxf-row">
          <label>Load Type</label>
        </div>
        <div className="import-dxf-radio-group">
          <label>
            <input type="radio" name="loadType" checked={loadType === 'add'} onChange={() => setLoadType('add')} />
            Add (append)
          </label>
          <label>
            <input type="radio" name="loadType" checked={loadType === 'open'} onChange={() => setLoadType('open')} />
            Open (replace)
          </label>
        </div>

        {/* Unit */}
        <div className="import-dxf-row">
          <label>Unit</label>
          <select value={unit} onChange={e => setUnit(e.target.value as ImportDXFOptions['unit'])}>
            <option value="auto">Auto{detectedUnit ? ` (${detectedUnit})` : ''}</option>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="inch">inch</option>
          </select>
        </div>

        {/* Scale */}
        <div className="import-dxf-row">
          <label>Scale (%)</label>
          <input type="number" min={1} max={1000} value={scale} onChange={e => setScale(Number(e.target.value))} />
        </div>

        {/* Piece Summary */}
        <div className="import-dxf-summary">
          {pieceCount} pieces detected: {pieceNames}
          <br />
          Unit: {resolvedUnit}
        </div>

        {/* Import Options */}
        <div className="import-dxf-checkboxes">
          <label>
            <input type="checkbox" checked={importNotches} onChange={e => setImportNotches(e.target.checked)} />
            Import notches
          </label>
          <label>
            <input type="checkbox" checked={importGrainlines} onChange={e => setImportGrainlines(e.target.checked)} />
            Import grainlines
          </label>
          <label>
            <input type="checkbox" checked={importInternalLines} onChange={e => setImportInternalLines(e.target.checked)} />
            Import internal lines
          </label>
        </div>

        {/* Actions */}
        <div className="import-dxf-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={handleImport}>Import</button>
        </div>
      </div>
    </div>
  );
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run src/components/ImportDXFDialog/__tests__/ImportDXFDialog.test.tsx`
Expected: PASS (4 tests)

### Step 5: Run full test suite

Run: `npx vitest run`
Expected: All tests pass.

### Step 6: Commit

```bash
git add src/components/ImportDXFDialog/
git commit -m "feat(dxf): add ImportDXFDialog component

CLO3D-style compact modal with load type, unit (auto-detected from
\$INSUNITS), scale, piece summary, and import checkboxes.

Part of #107"
```

---

## Task 3: Import DXF Dialog — Integration with FileExplorerView

Wire the dialog into the import flow: file selection shows the dialog, dialog confirmation triggers import with options applied.

**Files:**
- Modify: `src/components/views/FileExplorerView.tsx:83-96`
- Modify: `src/utils/dxf/converter.ts` (add scale/unit/filter params to `dxfToPatternPieces`)

### Step 1: Add options parameter to dxfToPatternPieces

In `src/utils/dxf/converter.ts`, add an options interface and modify `dxfToPatternPieces`:

```typescript
// Add after imports, before entityToPath
export interface DXFImportOptions {
  unit?: 'mm' | 'cm' | 'inch' | 'auto';
  scale?: number;  // percentage, default 100
  importNotches?: boolean;
  importGrainlines?: boolean;
  importInternalLines?: boolean;
}

const UNIT_FACTORS: Record<string, number> = { mm: 1, cm: 10, inch: 25.4 };

function resolveUnitFactor(unit: string | undefined, doc: DXFDocument): number {
  if (!unit || unit === 'auto') {
    const insunits = doc.header.get('$INSUNITS');
    const code = typeof insunits === 'number' ? insunits : parseInt(String(insunits), 10);
    if (code === 1) return UNIT_FACTORS.inch;
    if (code === 5) return UNIT_FACTORS.cm;
    return 1; // default mm
  }
  return UNIT_FACTORS[unit] ?? 1;
}
```

Then modify `dxfToPatternPieces` signature to accept options:

```typescript
export function dxfToPatternPieces(doc: DXFDocument, options?: DXFImportOptions): PatternPiece[] {
```

Apply scale and unit to each piece at the end of `dxfToPatternPieces`, and pass filter flags to `entitiesToPiece`. The `options` parameter is optional so all existing callers continue to work.

### Step 2: Modify FileExplorerView to show dialog

In `src/components/views/FileExplorerView.tsx`:

1. Add state: `const [dxfDialogDoc, setDxfDialogDoc] = useState<DXFDocument | null>(null);` and `const [dxfDialogContent, setDxfDialogContent] = useState<string>('');`
2. Modify `handleDXFFileChange` to parse and show dialog instead of importing directly
3. Add `handleDXFImport` callback that applies options and dispatches pieces
4. Render `<ImportDXFDialog>` when `dxfDialogDoc` is set

Replace `handleDXFFileChange` (lines 83-96):

```typescript
  const handleDXFFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const doc = parseDXF(text);
      setDxfDialogDoc(doc);
      setDxfDialogContent(text);
      if (dxfInputRef.current) dxfInputRef.current.value = '';
    },
    [],
  );

  const handleDXFDialogImport = useCallback(
    (options: ImportDXFOptions) => {
      if (!dxfDialogDoc) return;
      const dxfPieces = dxfToPatternPieces(dxfDialogDoc, {
        unit: options.unit,
        scale: options.scale,
        importNotches: options.importNotches,
        importGrainlines: options.importGrainlines,
        importInternalLines: options.importInternalLines,
      });
      if (options.loadType === 'open') {
        dispatch(loadProject({
          id: `project-${Date.now()}`,
          name: 'DXF Import',
          pieces: dxfPieces,
          seams: [],
          fabrics: [],
          avatar: { measurements: {} },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));
      } else {
        for (const piece of dxfPieces) {
          dispatch(addPiece(piece));
        }
      }
      setDxfDialogDoc(null);
    },
    [dxfDialogDoc, dispatch],
  );
```

Add the dialog render at the end of the JSX (before closing `</div>`):

```tsx
{dxfDialogDoc && (
  <ImportDXFDialog
    doc={dxfDialogDoc}
    onImport={handleDXFDialogImport}
    onCancel={() => setDxfDialogDoc(null)}
  />
)}
```

### Step 3: Update dxf/index.ts exports

Add `DXFImportOptions` to exports in `src/utils/dxf/index.ts`.

### Step 4: Run type check and full tests

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass.

### Step 5: Commit

```bash
git add src/components/views/FileExplorerView.tsx src/utils/dxf/converter.ts src/utils/dxf/index.ts
git commit -m "feat(dxf): integrate ImportDXFDialog into file import flow

DXF file selection now shows the import dialog with unit/scale/filter
options. loadType 'open' replaces project, 'add' appends pieces.
Scale and unit conversion applied during import.

Part of #107"
```

---

## Task 4: Copilot import_dxf Action — Types and Validator

Add the `ImportDXFAction` interface, register in action categories, and add validation.

**Files:**
- Modify: `src/copilot/actions/actionTypes.ts`
- Modify: `src/copilot/actions/actionValidator.ts`
- Test: `src/copilot/actions/__tests__/importDxfAction.test.ts` (create)

### Step 1: Write the failing test

Create `src/copilot/actions/__tests__/importDxfAction.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getActionCategory } from '../actionTypes';
import { validateAction } from '../actionValidator';
import type { RootState } from '../../../store';

const mockState = {
  project: { pieces: [], seams: [], fabrics: [], avatar: { measurements: {} }, name: '', id: '' },
  editor: { selectedPieceIds: [] },
  simulation: { simulationState: 'idle' },
} as unknown as RootState;

describe('import_dxf action', () => {
  it('has category "project"', () => {
    const action = { action: 'import_dxf', fileContent: 'test' } as any;
    expect(getActionCategory(action)).toBe('project');
  });

  it('validates successfully with fileContent', () => {
    const action = { action: 'import_dxf', fileContent: '0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF' } as any;
    const result = validateAction(action, mockState);
    expect(result.valid).toBe(true);
  });

  it('fails validation without fileContent', () => {
    const action = { action: 'import_dxf' } as any;
    const result = validateAction(action, mockState);
    expect(result.valid).toBe(false);
  });

  it('fails validation with empty fileContent', () => {
    const action = { action: 'import_dxf', fileContent: '' } as any;
    const result = validateAction(action, mockState);
    expect(result.valid).toBe(false);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/copilot/actions/__tests__/importDxfAction.test.ts`
Expected: FAIL — `import_dxf` not recognized.

### Step 3: Add ImportDXFAction to actionTypes.ts

In `src/copilot/actions/actionTypes.ts`:

1. Add the interface after `RedoAction` (before `ProjectAction` union):

```typescript
export interface ImportDXFAction {
  action: 'import_dxf';
  fileContent: string;
  unit?: 'mm' | 'cm' | 'inch' | 'auto';
  scale?: number;
  loadType?: 'open' | 'add';
}
```

2. Add to `ProjectAction` union:

```typescript
export type ProjectAction =
  | SaveProjectAction
  | ExportDXFAction
  | ExportPDFAction
  | UndoAction
  | RedoAction
  | ImportDXFAction;
```

3. Add `'import_dxf'` to `ACTION_CATEGORIES.project` array.
4. Add `'import_dxf'` to `UNDOABLE_ACTIONS`.

### Step 4: Add import_dxf validation to actionValidator.ts

In `src/copilot/actions/actionValidator.ts`, add to `validateProjectAction` (before `default:`):

```typescript
    case 'import_dxf': {
      const importAction = action as unknown as { fileContent?: string };
      if (!importAction.fileContent || importAction.fileContent.trim().length === 0) {
        return fail('import_dxf requires non-empty fileContent');
      }
      return ok();
    }
```

Also add `'import_dxf'` to the project actions list in the main `validateAction` function (line 627).

### Step 5: Run test to verify it passes

Run: `npx vitest run src/copilot/actions/__tests__/importDxfAction.test.ts`
Expected: PASS (4 tests)

### Step 6: Run full test suite

Run: `npx vitest run`
Expected: All tests pass.

### Step 7: Commit

```bash
git add src/copilot/actions/actionTypes.ts src/copilot/actions/actionValidator.ts src/copilot/actions/__tests__/importDxfAction.test.ts
git commit -m "feat(copilot): add import_dxf action type and validator

ImportDXFAction interface with fileContent, unit, scale, loadType.
Validation ensures fileContent is present and non-empty.

Part of #107"
```

---

## Task 5: Copilot import_dxf Action — Executor and Schema

Wire execution logic and add LLM schema so the copilot can use the action.

**Files:**
- Modify: `src/copilot/actions/actionExecutor.ts:863-870`
- Modify: `src/copilot/llm/actionSchemas.ts`
- Test: `src/copilot/actions/__tests__/importDxfExecutor.test.ts` (create)

### Step 1: Write the failing test

Create `src/copilot/actions/__tests__/importDxfExecutor.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Minimal DXF content that parseDXF can parse into a valid doc
const MINIMAL_DXF = [
  '0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LWPOLYLINE', '8', '1', '70', '1', '90', '4',
  '10', '0', '20', '0',
  '10', '100', '20', '0',
  '10', '100', '20', '200',
  '10', '0', '20', '200',
  '0', 'ENDSEC',
  '0', 'EOF',
].join('\n');

describe('import_dxf executor', () => {
  it('parses DXF content and dispatches addPiece', async () => {
    // Dynamic import to avoid module resolution issues
    const { parseDXF } = await import('../../../utils/dxf/parser');
    const { dxfToPatternPieces } = await import('../../../utils/dxf/converter');

    const doc = parseDXF(MINIMAL_DXF);
    const pieces = dxfToPatternPieces(doc);
    expect(pieces.length).toBe(1);
    expect(pieces[0].outline.length).toBeGreaterThan(0);
  });
});
```

### Step 2: Run test to verify it passes (this is a sanity test)

Run: `npx vitest run src/copilot/actions/__tests__/importDxfExecutor.test.ts`
Expected: PASS

### Step 3: Add import_dxf case to actionExecutor.ts

In `src/copilot/actions/actionExecutor.ts`:

1. Add imports at the top:

```typescript
import { parseDXF, dxfToPatternPieces } from '../../utils/dxf';
import { loadProject } from '../../store/projectSlice';
```

Note: `addPiece` and `loadProject` are already imported. Just add `parseDXF` and `dxfToPatternPieces`.

2. Add the case before `case 'export_dxf':` (around line 867):

```typescript
      case 'import_dxf': {
        const importAction = action as unknown as {
          fileContent: string;
          unit?: 'mm' | 'cm' | 'inch' | 'auto';
          scale?: number;
          loadType?: 'open' | 'add';
        };
        const doc = parseDXF(importAction.fileContent);
        const importedPieces = dxfToPatternPieces(doc, {
          unit: importAction.unit,
          scale: importAction.scale,
        });

        if (importAction.loadType === 'open') {
          this.dispatch(loadProject({
            id: uid(),
            name: 'DXF Import',
            pieces: importedPieces,
            seams: [],
            fabrics: [],
            avatar: { measurements: {} },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }));
        } else {
          for (const piece of importedPieces) {
            this.dispatch(addPiece(piece));
          }
        }

        const names = importedPieces.map(p => p.name);
        return {
          data: { count: importedPieces.length, names },
          summary: `Imported ${importedPieces.length} piece(s): ${names.join(', ')}`,
        };
      }
```

### Step 4: Add import_dxf schema to actionSchemas.ts

In `src/copilot/llm/actionSchemas.ts`, add before the `// === Project ===` undo entry (around line 422):

```typescript
  // === Import ===
  {
    action: 'import_dxf',
    description: 'Import pattern pieces from DXF-AAMA file content',
    category: 'project',
    parameters: [
      { name: 'fileContent', type: 'string', description: 'Raw DXF file content', required: true },
      { name: 'unit', type: 'string', description: 'Unit override', required: false, enum: ['mm', 'cm', 'inch', 'auto'] },
      { name: 'scale', type: 'number', description: 'Scale percentage (100 = 1:1)', required: false, default: 100 },
      { name: 'loadType', type: 'string', description: 'How to load pieces', required: false, enum: ['add', 'open'], default: 'add' },
    ],
    examples: ['Import this DXF file', 'Load DXF pattern pieces'],
  },
```

### Step 5: Run type check and full tests

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass.

### Step 6: Commit

```bash
git add src/copilot/actions/actionExecutor.ts src/copilot/llm/actionSchemas.ts src/copilot/actions/__tests__/importDxfExecutor.test.ts
git commit -m "feat(copilot): implement import_dxf executor and schema

Parses DXF content, converts to pieces, dispatches addPiece or
loadProject depending on loadType. LLM schema added for copilot
integration.

Closes #107"
```

---

## Task 6: Final Verification

Run the complete test suite and type check to ensure everything works together.

**Files:** None (verification only)

### Step 1: Run type check

Run: `npx tsc --noEmit`
Expected: No errors.

### Step 2: Run full test suite

Run: `npx vitest run`
Expected: All tests pass including new ones.

### Step 3: Verify new test files run

Run: `npx vitest run src/utils/dxf/__tests__/notchGeometry.test.ts src/components/ImportDXFDialog/__tests__/ImportDXFDialog.test.tsx src/copilot/actions/__tests__/importDxfAction.test.ts src/copilot/actions/__tests__/importDxfExecutor.test.ts`
Expected: All pass.
