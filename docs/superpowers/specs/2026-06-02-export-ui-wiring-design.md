# Export UI Wiring — Connect María's Egress (DXF + PDF + BOM)

**Date:** 2026-06-02
**Branch:** `feat/canvas-2d-redesign`
**Source:** Traversal-walk finding (export = the only fully-dead link on María's path) + Voronov's reframe (connect the path vs populate the catalog)
**Status:** Design approved (scope A), ready for implementation plan

---

## 1. Context (one line)

A live traversal walk of María's path proved import → frame → read → 3D-sew → simulate all work, but **every conventional UI export entry point is dead**: the `File ▸ Export *` menu items are `action: () => {}` no-ops, and the ⌘K "Export DXF" command opens a stub panel. The export *logic* already exists and the *agentic* (AI-chat) export works; only the conventional UI is unwired. The path has no exit.

## 2. Goal

Connect María's egress by wiring the existing export functions to the existing dead menu items, for the three formats that constitute a patternmaker's production handoff: **DXF (AAMA)**, **PDF (1:1)**, **BOM (CSV)**.

This is scope **A** from brainstorming, chosen via Voronov's governing rule: *wire the exits whose success you can prove from the caller, and verify each on its own terms.* DXF/PDF/BOM are pure functions of Redux state — observable, verifiable. The 3D exports (OBJ/glTF/FBX/USDZ) are a different category (fire a `window` event and return `success` before anything is written — unverifiable from the caller) and are **not** on María's flat-pattern path; they are out of scope.

**The criterion is content, not the click.** A download is an event, not a deliverable. "A file was produced" does not prove "María got a usable pattern out." Acceptance is verified per format at the content level (see §7), with a **DXF round-trip** as the spine: we own both the AAMA exporter and the importer, so we can export and re-import and assert the pieces survive.

## 3. Acceptance criteria

1. `File ▸ Export DXF` downloads an AAMA DXF of all current pieces; filename derives from the project name.
2. `File ▸ Export PDF (1:1)` downloads a 1:1 PDF of all current pieces.
3. `File ▸ Export BOM (CSV)` downloads a BOM CSV (pieces, fabrics, areas, seam allowance).
4. The ⌘K `export-dxf` command performs the real DXF export (no longer opens the stub panel).
5. With zero pieces, every export path shows an error toast ("no pieces") and downloads nothing.
6. A successful export shows a success toast naming the file.
7. **DXF round-trip holds:** `generateDXFAAMA(pieces)` re-parsed through `parseDXF` + `dxfToPatternPieces` yields the same piece count with outline geometry preserved (within tolerance) and the AAMA layers present.
8. Gates green: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 4. Existing surface (verified)

**Export functions (all present; string generator + download wrapper per format):**
- `generateDXFAAMA(pieces, options?): string` and `downloadDXFAAMA(pieces, filename?, options?)` — `src/utils/dxf/exportAAMA.ts:808,830`
- `generatePDF(pieces): string` and `downloadPDF(pieces, filename?)` — `src/utils/exportPDF.ts:76,201`
- `generateBOM(...)` and `downloadBOM(pieces, seams, fabrics, filename?)` — `src/utils/export/bomExport.ts:115,197`

**Dead UI entry points:**
- `src/components/shell/LogoMenu.tsx:35,36,44` — `Export DXF` / `Export PDF (1:1)` / `Export BOM (CSV)` items, all `action: () => {}`. `handleItemClick` (line 165) already runs `item.action(dispatch)` for non-special items, and the file already imports the `store` singleton (line 11, used by "Select All" at line 56).
- `src/components/shell/UnifiedBarCommands.tsx:47,48` — `export-techpack` and `export-dxf` commands, both `action: (_d, cb) => cb.onOpenPanel('Export')`. AppShell's `renderPanelContent` has no `'Export'` case → falls to the default stub ("{name} — available via ⌘K", `AppShell.tsx:52-57`).

**Toast actions:** `showSuccessToast` / `showErrorToast` (already used by `AppShell.importDXFFile`, `AppShell.tsx:90,92`).

## 5. Architecture

Export needs no AppShell ref/callback (unlike DXF import, which needed the hidden file-input ref). It is pure state → download. So a single self-contained orchestrator, called directly from each entry point, is cleaner than threading callbacks.

### New: `src/utils/export/uiExport.ts`

```
type UiExportFormat = 'dxf' | 'pdf' | 'bom';

runUiExport(format, project, dispatch): void
```

- Reads `project.pieces` / `project.seams` / `project.fabrics` / `project.name` from the passed project slice (caller supplies `store.getState().project`, keeping this module free of the store singleton and trivially testable).
- Guards `pieces.length === 0` → `dispatch(showErrorToast('No hay piezas que exportar.'))` and returns.
- Derives `base` filename from `project.name` (fallback `'patron'`).
- Calls the matching download function (`downloadDXFAAMA` / `downloadPDF` / `downloadBOM`) with `${base}.dxf` / `${base}.pdf` / `${base}-bom.csv`.
- On success → `dispatch(showSuccessToast(...))`; on throw → `dispatch(showErrorToast(...))`.

This is the single UI-export surface. It deliberately does **not** unify with the agentic `exportTools.ts` (that cross-surface unification is a larger refactor, out of scope) — it mirrors the same call shape for the three flat-pattern formats.

### Modified: `src/components/shell/LogoMenu.tsx`

The three export items' `action`s change from `() => {}` to call the orchestrator with the live project:
```
action: (d) => runUiExport('dxf', store.getState().project, d)   // and 'pdf', 'bom'
```
No `handleItemClick` change is needed — these items already flow through `item.action(dispatch)`.

### Modified: `src/components/shell/UnifiedBarCommands.tsx`

The `export-dxf` command's action changes from `cb.onOpenPanel('Export')` to `runUiExport('dxf', store.getState().project, dispatch)`. (`export-techpack` is left unchanged — Tech Pack is undefined future work, not a format we support, so its stub is honest deferral, not a lie about DXF.)

### Unchanged
- `AppShell.tsx` — no new callback; the `renderPanelContent` default stub stays (still used by `export-techpack` and other not-yet-built panels).
- The agentic `exportTools.ts` — untouched.

## 6. Data flow

`File ▸ Export DXF` (or ⌘K export-dxf) → `runUiExport('dxf', project, dispatch)` → guard pieces → `downloadDXFAAMA(pieces, \`${name}.dxf\`)` (blob + anchor download) → success/error toast. Identical shape for PDF and BOM.

## 7. Testing (content-level, per format)

Per Voronov's rule, each exit is verified on its own terms; "a file appeared" is not accepted as proof.

**`src/utils/export/__tests__/uiExport.roundtrip.test.ts` — the spine (DXF):**
- Build a small set of `PatternPiece`s (reuse the construction pattern from `exportAAMA.metadata.test.ts` / `exportAAMA.multisize.test.ts`).
- `generateDXFAAMA(pieces)` → `parseDXF(str)` → `dxfToPatternPieces(doc)`.
- Assert: same piece count; each re-imported piece has a non-empty outline whose bounding box / key dimensions are preserved within tolerance (AAMA export may re-segment curves, so assert geometry survival, not byte-identical vertex counts); the AAMA layers present in the document (CUT / GRAINLINE at minimum). This proves the pattern survives the exit usable, not just that bytes were written.

**BOM content:**
- `generateBOM(pieces, seams, fabrics)` → assert the CSV has the expected header columns and one row per piece, with area populated.

**PDF content (lighter — physical 1:1 proof is manual):**
- `generatePDF(pieces)` → assert non-empty output and presence of the 1:1 scale markers the generator emits. A note records that true 1:1 verification is a manual print check (a different category of proof).

**`uiExport` orchestration (`uiExport.test.ts`):**
- With a fake project (≥1 piece) + spy `dispatch`, mock the `download*` modules; assert the correct one is called with the name-derived filename and a success toast is dispatched.
- With zero pieces, assert no download call and an error toast.

**Wiring:** the LogoMenu/⌘K actions are one-liners verified by `tsc` + the live verification step (§ acceptance). No full-LogoMenu render test (the menu mounts the whole app state; not worth the brittleness for a one-line action).

Full gate before commit: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 8. Edge cases

- **Zero pieces:** error toast, no download (criterion 5).
- **Filename:** `project.name` may be empty → fallback `'patron'`.
- **Large pattern:** the existing download functions already handle María's 5-piece pattern (and bigger via the agentic path); no new perf concern introduced here.
- **Units:** exports use the functions' existing defaults (AAMA standard); not parameterized in this slice.

## 9. Out of scope

- 3D model export (OBJ/glTF/FBX/USDZ) — different category (event-dispatch, success unverifiable from caller), not on María's flat-pattern path. Separate slice with its own verification design.
- Tech Pack — undefined; left deferred (its ⌘K command keeps the honest stub).
- Multi-size DXF, export dialogs/options (piece selection, SA toggle, units) — YAGNI for this slice; one-click defaults only.
- ⌘K parity for PDF/BOM (this slice repoints only the ⌘K DXF command, the worst stub lie; PDF/BOM are reachable via the File menu). Trivial follow-up.
- Unifying the agentic (`exportTools.ts`) and UI export surfaces behind one implementation — larger refactor.
- 2D-sew discoverability and `computeFitView` rotated-bounds — separate backlog items.
