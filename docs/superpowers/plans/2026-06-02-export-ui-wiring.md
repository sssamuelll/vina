# Export UI Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect María's dead export egress by wiring the existing `File ▸ Export DXF/PDF/BOM` menu items (and the ⌘K `export-dxf` command) to the existing export functions, verified at the content level with a DXF round-trip.

**Architecture:** A single self-contained orchestrator `runUiExport(format, project, dispatch)` reads the project slice, guards empty-pieces, calls the matching existing `download*` function with a name-derived filename, and dispatches a success/error toast. The menu items and the command call it directly (export needs no AppShell ref/callback — unlike DXF import). The agentic `exportTools.ts` and AppShell are untouched.

**Tech Stack:** React + TypeScript, Redux Toolkit, Vitest (jsdom + node), Playwright (live verification). Existing export functions: `generateDXFAAMA`/`downloadDXFAAMA`, `generatePDF`/`downloadPDF`, `generateBOM`/`downloadBOM`.

**Spec:** `docs/superpowers/specs/2026-06-02-export-ui-wiring-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/utils/export/uiExport.ts` | The UI export orchestrator (`runUiExport`) | Create |
| `src/utils/export/__tests__/exportContent.test.ts` | Content proof: DXF round-trip + BOM + PDF | Create |
| `src/utils/export/__tests__/uiExport.test.ts` | Orchestration: dispatch + filename + empty guard | Create |
| `src/components/shell/LogoMenu.tsx` | Wire the 3 `File ▸ Export *` items | Modify |
| `src/components/shell/UnifiedBarCommands.tsx` | Wire the ⌘K `export-dxf` command | Modify |

Spanish toast strings mirror the established in-repo voice (`AppShell.importDXFFile` → "Cargué tu patrón…"): no emoji, no exclamation, plain — solace-wren-compliant. A formal solace-wren pass on these four status strings is available if desired but not required (they follow the existing pattern).

---

## Task 1: Content proof — DXF round-trip, BOM, PDF

This task proves the export *functions* produce usable artifacts before any UI is wired (Voronov's rule: a download is an event, not a deliverable). It tests existing functions — no new `src` code. **If the DXF round-trip fails, that is a real export↔import gap: report it as a concern, do NOT weaken the assertion to pass.**

**Files:**
- Create: `src/utils/export/__tests__/exportContent.test.ts`

- [ ] **Step 1: Write the content tests**

Create `src/utils/export/__tests__/exportContent.test.ts`:

```ts
/**
 * Content-level acceptance proof for the three flat-pattern exports.
 * The DXF round-trip is the spine: we own both the AAMA exporter and the
 * importer, so we export and re-import and assert the pattern survives usable.
 */
import { describe, it, expect } from 'vitest';
import { generateDXFAAMA } from '../../dxf/exportAAMA';
import { parseDXF, dxfToPatternPieces } from '../../dxf';
import { generateBOM } from '../bomExport';
import { generatePDF } from '../../exportPDF';
import type { PatternPiece } from '../../../types/types';

function makePiece(overrides?: Partial<PatternPiece>): PatternPiece {
  return {
    id: 'p1',
    name: 'Front',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 150] },
      { type: 'L', values: [0, 150] },
      { type: 'Z', values: [] },
    ],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    internals: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as PatternPiece;
}

function bboxOf(pieces: { outline: PatternPiece['outline'] }[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pieces) {
    for (const cmd of p.outline) {
      for (let i = 0; i < cmd.values.length; i += 2) {
        const x = cmd.values[i], y = cmd.values[i + 1];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return { w: maxX - minX, h: maxY - minY };
}

describe('DXF export round-trips through the importer (the spine)', () => {
  it('preserves piece count and overall geometry within tolerance', () => {
    const pieces = [
      makePiece({ id: 'p1', name: 'Front' }),
      makePiece({
        id: 'p2', name: 'Back',
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [120, 0] },
          { type: 'L', values: [120, 160] },
          { type: 'L', values: [0, 160] },
          { type: 'Z', values: [] },
        ],
      }),
    ];

    const dxf = generateDXFAAMA(pieces);
    const doc = parseDXF(dxf);
    const reimported = dxfToPatternPieces(doc);

    expect(reimported.length).toBe(pieces.length);
    for (const p of reimported) {
      expect(p.outline.length).toBeGreaterThan(0);
    }
    // AAMA export may re-segment; assert overall geometry survives, not bytes.
    const before = bboxOf(pieces);
    const after = bboxOf(reimported);
    expect(Math.abs(after.w - before.w)).toBeLessThan(1); // mm
    expect(Math.abs(after.h - before.h)).toBeLessThan(1);
    // AAMA CUT layer present (layer "1").
    expect(dxf).toContain('8\n1\n');
  });
});

describe('BOM export content', () => {
  it('has a header, one row per piece, and a TOTAL summary', () => {
    const csv = generateBOM([makePiece({ id: 'p1' }), makePiece({ id: 'p2' })], [], []);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(4);               // header + 2 pieces + TOTAL
    expect(lines[0]).toContain(',');            // header row
    expect(lines[lines.length - 1].startsWith('TOTAL')).toBe(true);
  });
});

describe('PDF export content', () => {
  it('produces non-empty raw PDF bytes (1:1 physical scale verified manually)', () => {
    const pdf = generatePDF([makePiece()]);
    expect(pdf.startsWith('%PDF')).toBe(true);
    expect(pdf.length).toBeGreaterThan(500);
  });
});
```

- [ ] **Step 2: Run the content tests**

Run: `npm run test -- src/utils/export/__tests__/exportContent.test.ts`
Expected: PASS — all three describes green.
**If the DXF round-trip fails** (piece count or bbox mismatch), STOP and report it: the export does not produce a re-importable pattern, which is a real egress defect that must be fixed in the export/import code, not by relaxing the test. The exact CUT-layer marker (`'8\n1\n'`) may need adjusting to the real AAMA layer encoding — verify against `src/utils/dxf/exportAAMA.ts` if that single assertion fails while the geometry assertions pass.

- [ ] **Step 3: Commit**

```
git add src/utils/export/__tests__/exportContent.test.ts
git commit -m "test(export): content proof for DXF round-trip, BOM, PDF"
```

---

## Task 2: `runUiExport` orchestrator

**Files:**
- Create: `src/utils/export/uiExport.ts`
- Create: `src/utils/export/__tests__/uiExport.test.ts`

- [ ] **Step 1: Write the failing orchestration test**

Create `src/utils/export/__tests__/uiExport.test.ts`:

```ts
/**
 * @vitest-environment jsdom
 *
 * Orchestration of runUiExport: routes to the right download function with a
 * name-derived filename, toasts success, and guards the empty-pieces case.
 * Download modules are mocked so no real blob/anchor fires.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../dxf/exportAAMA', () => ({ downloadDXFAAMA: vi.fn() }));
vi.mock('../../exportPDF', () => ({ downloadPDF: vi.fn() }));
vi.mock('../bomExport', () => ({ downloadBOM: vi.fn() }));

import { runUiExport } from '../uiExport';
import { downloadDXFAAMA } from '../../dxf/exportAAMA';
import { downloadPDF } from '../../exportPDF';
import { downloadBOM } from '../bomExport';
import { showSuccessToast, showErrorToast } from '../../../store/copilotUISlice';
import type { PatternPiece } from '../../../types/types';

const piece = { id: 'p1', name: 'Front', outline: [{ type: 'M', values: [0, 0] }], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0 } as PatternPiece;
const project = (pieces: PatternPiece[], name = 'Tee') => ({ pieces, seams: [], fabrics: [], name });

beforeEach(() => vi.clearAllMocks());

describe('runUiExport', () => {
  it('exports DXF with a name-derived filename and toasts success', () => {
    const dispatch = vi.fn();
    runUiExport('dxf', project([piece]), dispatch);
    expect(downloadDXFAAMA).toHaveBeenCalledWith([piece], 'Tee.dxf');
    expect(dispatch).toHaveBeenCalledWith(showSuccessToast('Exporté tu patrón en DXF.'));
  });

  it('exports PDF', () => {
    const dispatch = vi.fn();
    runUiExport('pdf', project([piece]), dispatch);
    expect(downloadPDF).toHaveBeenCalledWith([piece], 'Tee.pdf');
    expect(dispatch).toHaveBeenCalledWith(showSuccessToast('Exporté tu patrón en PDF.'));
  });

  it('exports BOM with seams and fabrics', () => {
    const dispatch = vi.fn();
    runUiExport('bom', project([piece]), dispatch);
    expect(downloadBOM).toHaveBeenCalledWith([piece], [], [], 'Tee-bom.csv');
    expect(dispatch).toHaveBeenCalledWith(showSuccessToast('Exporté la lista de materiales.'));
  });

  it('falls back to "patron" when the project name is empty', () => {
    const dispatch = vi.fn();
    runUiExport('dxf', project([piece], ''), dispatch);
    expect(downloadDXFAAMA).toHaveBeenCalledWith([piece], 'patron.dxf');
  });

  it('shows an error toast and downloads nothing with zero pieces', () => {
    const dispatch = vi.fn();
    runUiExport('dxf', project([]), dispatch);
    expect(downloadDXFAAMA).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(showErrorToast('No hay piezas que exportar.'));
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `npm run test -- src/utils/export/__tests__/uiExport.test.ts`
Expected: FAIL — cannot resolve `../uiExport`.

- [ ] **Step 3: Create the orchestrator**

Create `src/utils/export/uiExport.ts`:

```ts
import type { AppDispatch } from '../../store';
import type { PatternPiece, Seam, Fabric } from '../../types/types';
import { showSuccessToast, showErrorToast } from '../../store/copilotUISlice';
import { downloadDXFAAMA } from '../dxf/exportAAMA';
import { downloadPDF } from '../exportPDF';
import { downloadBOM } from './bomExport';

export type UiExportFormat = 'dxf' | 'pdf' | 'bom';

/** The subset of the project slice an export needs. */
interface ExportProject {
  pieces: PatternPiece[];
  seams: Seam[];
  fabrics: Fabric[];
  name?: string;
}

const SUCCESS: Record<UiExportFormat, string> = {
  dxf: 'Exporté tu patrón en DXF.',
  pdf: 'Exporté tu patrón en PDF.',
  bom: 'Exporté la lista de materiales.',
};

const ERR_NOUN: Record<UiExportFormat, string> = {
  dxf: 'el DXF',
  pdf: 'el PDF',
  bom: 'la lista de materiales',
};

/**
 * Run a UI-initiated export. Self-contained: reads the passed project slice,
 * guards empty patterns, triggers the browser download, and toasts the result.
 * Callers pass `store.getState().project`.
 */
export function runUiExport(format: UiExportFormat, project: ExportProject, dispatch: AppDispatch): void {
  const { pieces, seams, fabrics, name } = project;
  if (!pieces || pieces.length === 0) {
    dispatch(showErrorToast('No hay piezas que exportar.'));
    return;
  }
  const base = (name && name.trim()) || 'patron';
  try {
    if (format === 'dxf') downloadDXFAAMA(pieces, `${base}.dxf`);
    else if (format === 'pdf') downloadPDF(pieces, `${base}.pdf`);
    else downloadBOM(pieces, seams, fabrics, `${base}-bom.csv`);
    dispatch(showSuccessToast(SUCCESS[format]));
  } catch (err) {
    dispatch(showErrorToast(`No pude exportar ${ERR_NOUN[format]}: ${(err as Error).message}`));
  }
}
```

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `npm run test -- src/utils/export/__tests__/uiExport.test.ts`
Expected: PASS — 5 tests. (If TS complains that `PatternPiece[]` is not assignable to `downloadBOM`'s `BOMPiece[]` param, it will not — `exportTools.ts` already passes `state.project.pieces` to `downloadBOM`; the types are structurally compatible.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```
git add src/utils/export/uiExport.ts src/utils/export/__tests__/uiExport.test.ts
git commit -m "feat(export): runUiExport orchestrator (guard + download + toast)"
```

---

## Task 3: Wire the menu and the command

**Files:**
- Modify: `src/components/shell/LogoMenu.tsx`
- Modify: `src/components/shell/UnifiedBarCommands.tsx`

- [ ] **Step 1: Import the orchestrator in `LogoMenu.tsx`**

`LogoMenu.tsx` already imports the `store` singleton (line 11). Add the orchestrator import after it:

```tsx
import { runUiExport } from '../../utils/export/uiExport';
```

- [ ] **Step 2: Wire the three File-menu export items**

In `LogoMenu.tsx`, in `FILE_MENU`, replace the three dead export entries (currently lines 35, 36, 44) with wired actions:

```tsx
  { label: 'Export DXF', action: (d) => runUiExport('dxf', store.getState().project, d) },
  { label: 'Export PDF (1:1)', action: (d) => runUiExport('pdf', store.getState().project, d) },
```
and (currently line 44):
```tsx
  { label: 'Export BOM (CSV)', action: (d) => runUiExport('bom', store.getState().project, d) },
```
Leave `Export Tech Pack`, `Export 3D Model` (and its submenu) unchanged — out of scope.

- [ ] **Step 3: Wire the ⌘K `export-dxf` command**

In `src/components/shell/UnifiedBarCommands.tsx`, add two imports near the top (after the existing `import type { AppDispatch } from '../../store';` on line 3):

```tsx
import { store } from '../../store';
import { runUiExport } from '../../utils/export/uiExport';
```

Then change the `export-dxf` command (currently line 48) from `action: (_d, cb) => cb.onOpenPanel('Export')` to:

```tsx
  { id: 'export-dxf', name: 'Export DXF', description: 'Export patterns as DXF files', icon: FileText, action: (d) => runUiExport('dxf', store.getState().project, d) },
```

Leave `export-techpack` (line 47) unchanged — Tech Pack is undefined future work.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: all pass (including Task 1 + Task 2 tests).

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: clean (0 errors).

- [ ] **Step 7: Commit**

```
git add src/components/shell/LogoMenu.tsx src/components/shell/UnifiedBarCommands.tsx
git commit -m "feat(export): wire File-menu exports + the K export-dxf command to runUiExport"
```

---

## Task 4: Live verification with María's real DXF

Confirm the wiring is live end-to-end: import the real DXF, export via the actual File menu, and confirm a real file comes out (the egress is connected). Scaffolding stays untracked, like the other `scripts/capture-*.mjs` / `walk-*.mjs`.

**Files:**
- Create (untracked): `scripts/verify-export.mjs`

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-export.mjs`:

```js
/**
 * Live proof that María's egress is connected: import her real DXF, then
 * File ▸ Export DXF, and confirm a real, re-parseable file downloads.
 * Run:  node scripts/verify-export.mjs [baseURL] [dxfPath]
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.argv[2] || 'http://localhost:5183';
const DXF = process.argv[3] || 'C:\\Users\\simon\\Desktop\\temp.dxf';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app-shell', { timeout: 20000 });
  await page.waitForTimeout(1200);

  // Import María's real DXF.
  await page.locator('input[type="file"][accept=".dxf"]').setInputFiles(DXF);
  await page.waitForTimeout(2500);
  const pieces = await page.evaluate(() => window.__OPENCLO_STORE__?.getState?.()?.project?.pieces?.length ?? -1);
  console.log('  imported pieces:', pieces);

  // File ▸ Export DXF (mirror the capture-canvas2d menu pattern; force past RAF stability).
  await page.click('.logo-menu__trigger', { force: true });
  await page.waitForSelector('.logo-menu', { timeout: 5000 });
  await page.hover('.logo-menu__item:has-text("File")');
  await page.waitForTimeout(300);
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('.logo-menu__item:has-text("Export DXF")', { force: true }),
  ]);
  const path = await dl.path();
  const bytes = readFileSync(path, 'utf8');
  console.log('  downloaded:', dl.suggestedFilename(), bytes.length, 'bytes');
  console.log('  looks like DXF:', /\bSECTION\b/.test(bytes) && /\bENTITIES\b/.test(bytes));

  await browser.close();
  console.log('done');
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
```

- [ ] **Step 2: Start the dev server**

Run (background): `npm run dev -- --port 5183 --strictPort`
Wait until it logs `Local: http://localhost:5183/`.

- [ ] **Step 3: Run the verification**

Run: `node scripts/verify-export.mjs http://localhost:5183 "C:\\Users\\simon\\Desktop\\temp.dxf"`
Expected output: `imported pieces: 5`, a `downloaded: temp.dxf` (or `<projectName>.dxf`) line with a multi-thousand byte count, and `looks like DXF: true`. Stop the dev server afterward.

- [ ] **Step 4: Final gate**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: all green.

(No commit — verification only. Leave `scripts/verify-export.mjs` untracked.)

---

## Self-Review

**Spec coverage** (against `2026-06-02-export-ui-wiring-design.md`):
- AC1/2/3 (File-menu DXF/PDF/BOM download, name-derived) → Task 2 (orchestrator filename) + Task 3 (wiring) + Task 4 (live).
- AC4 (⌘K export-dxf real) → Task 3 Step 3.
- AC5 (zero pieces → error toast, no download) → Task 2 Step 1 (last test).
- AC6 (success toast) → Task 2 Step 1.
- AC7 (DXF round-trip holds) → Task 1 (the spine test).
- AC8 (gates) → Task 3 Steps 4–6 + Task 4 Step 4.
- §5 architecture (runUiExport, no AppShell change, exportTools untouched) → Tasks 2–3.
- §7 testing (round-trip spine + BOM + PDF + orchestration) → Tasks 1–2.
- §9 out of scope (3D, tech pack, multisize, ⌘K PDF/BOM parity, agentic unification) → not implemented (correct).

**Placeholder scan:** No TBD/TODO. Task 1 Step 2 names a concrete fallback if the single CUT-layer marker assertion needs adjusting — that is guidance, not a placeholder; the geometry assertions stand on their own.

**Type consistency:** `runUiExport(format: UiExportFormat, project: ExportProject, dispatch: AppDispatch)` is consistent across Task 2 (definition), Task 3 (callers pass `store.getState().project`), and the test. `ExportProject` is a structural subset of the real project slice (extra fields are fine). `downloadDXFAAMA(pieces, filename)` / `downloadPDF(pieces, filename)` / `downloadBOM(pieces, seams, fabrics, filename)` match `exportTools.ts` usage. Toast creators `showSuccessToast`/`showErrorToast` imported from `../../store/copilotUISlice` (matching `AppShell.tsx:7`).
