# UI Layout Cleanup — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate all duplicated UI controls, reduce from 7→3 Properties Panel sections and 11→8 sidebar views, and default copilot to minimized.

**Architecture:** Contextual right panel (piece-specific: PIECE, MATERIAL, SEAMS) + global left sidebar (project navigation, avatar, simulation, etc.). Two new merged views (ProjectView, AvatarBodyView) replace multiple overlapping sources. Copilot defaults to closed.

**Tech Stack:** React, Redux Toolkit, lucide-react icons, Playwright E2E tests

---

### Task 1: Default Copilot to Minimized

**Files:**
- Modify: `src/store/layoutSlice.ts:32` (default) and `src/store/layoutSlice.ts:127` (resetLayout)

**Step 1: Write the failing test**

Create file `src/store/__tests__/layoutSlice.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage before importing the slice
const mockStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
});

import layoutReducer, { resetLayout } from '../layoutSlice';

describe('layoutSlice', () => {
  beforeEach(() => {
    // Clear mock storage so defaults are used
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  it('defaults copilotOpen to false', () => {
    // Re-import to get fresh initialState (localStorage empty)
    const state = layoutReducer(undefined, { type: '@@INIT' });
    expect(state.copilotOpen).toBe(false);
  });

  it('resetLayout sets copilotOpen to false', () => {
    const state = layoutReducer({ copilotOpen: true, copilotPosition: 'right', copilotSize: 340, primaryView: '2d', splitRatio: 0.5 }, resetLayout());
    expect(state.copilotOpen).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/layoutSlice.test.ts`
Expected: FAIL — `copilotOpen` is `true` in both cases

**Step 3: Implement the changes**

In `src/store/layoutSlice.ts`:

Change line 32 from:
```typescript
    copilotOpen: true,
```
to:
```typescript
    copilotOpen: false,
```

Change line 127 (inside `resetLayout`) from:
```typescript
        copilotOpen: true,
```
to:
```typescript
        copilotOpen: false,
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/__tests__/layoutSlice.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/store/layoutSlice.ts src/store/__tests__/layoutSlice.test.ts
git commit -m "feat: default copilot to minimized on load and reset"
```

---

### Task 2: Slim Down PropertiesPanel to 3 Sections

**Files:**
- Modify: `src/components/PropertiesPanel/PropertiesPanel.tsx`

**Step 1: Write the failing E2E test**

Add to `tests/e2e/layout-cleanup.spec.ts`:

```typescript
import { test, expect, Page } from '@playwright/test';

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function drawAndSelectPiece(page: Page) {
  await page.click('button:has-text("2D")');
  await page.waitForTimeout(300);
  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  const svg = page.locator('svg.pattern-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('Pattern SVG not found');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 80, cy - 60);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await expect(page.locator('.status-bar')).toContainText(/Pieces.*[1-9]/, { timeout: 5000 });
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
}

test.describe('UI Layout Cleanup', () => {
  test.setTimeout(120_000);

  test('PropertiesPanel shows only PIECE, MATERIAL, SEAMS when piece selected', async ({ page }) => {
    await waitForApp(page);
    await drawAndSelectPiece(page);

    // These sections SHOULD exist
    await expect(page.locator('text=MATERIAL')).toBeVisible({ timeout: 5000 });

    // These sections should NOT exist (removed)
    await expect(page.locator('.properties-panel >> text=PROJECT')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.properties-panel >> text=AVATAR')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.properties-panel >> text=DISPLAY')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.properties-panel >> text=EXPORT')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.properties-panel >> text=SIMULATION')).not.toBeVisible({ timeout: 2000 });
  });

  test('PropertiesPanel shows empty state without piece selection', async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('text=Select a piece to edit')).toBeVisible({ timeout: 5000 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/layout-cleanup.spec.ts --headed`
Expected: FAIL — PROJECT, AVATAR, DISPLAY, EXPORT, SIMULATION sections still visible

**Step 3: Implement the changes**

Replace `src/components/PropertiesPanel/PropertiesPanel.tsx` with:

```typescript
import { ChevronLeft, ChevronRight, Box, Minus } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { removeSeam, selectSeam } from '../../store/editorSlice';
import PropertySection from './PropertySection';
import PieceProperties from './PieceProperties';
import MaterialTab from './MaterialTab';
import { X } from 'lucide-react';
import './PropertiesPanel.css';

export default function PropertiesPanel() {
  const dispatch = useDispatch();
  const { pieces, seams } = useSelector((s: RootState) => s.project);
  const editor = useSelector((s: RootState) => s.editor);
  const selectedPiece = pieces.find(p => editor.selectedPieceIds.includes(p.id));
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    piece: false,
    material: false,
    seams: false,
  });

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  }, []);

  return (
    <div className={`properties-panel ${isPanelCollapsed ? 'collapsed' : 'expanded'}`}>
      {/* Toggle button */}
      <button
        className="panel-toggle-btn"
        onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
        title={isPanelCollapsed ? 'Expand properties panel' : 'Collapse properties panel'}
      >
        {isPanelCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {isPanelCollapsed && (
        <div className="panel-icons">
          {selectedPiece && (
            <button className="panel-icon-shortcut" title="Piece" onClick={() => { setIsPanelCollapsed(false); setCollapsedSections(prev => ({ ...prev, piece: false })); }}>
              <Box size={16} />
            </button>
          )}
          {seams.length > 0 && (
            <button className="panel-icon-shortcut" title="Seams" onClick={() => { setIsPanelCollapsed(false); setCollapsedSections(prev => ({ ...prev, seams: false })); }}>
              <Minus size={16} />
            </button>
          )}
        </div>
      )}

      {!isPanelCollapsed && (
        <div className="panel-content">
          {!selectedPiece ? (
            <div style={{ padding: 16, color: '#888', fontSize: 12, textAlign: 'center' }}>
              Select a piece to edit
            </div>
          ) : (
            <>
              {/* Piece properties */}
              <PieceProperties piece={selectedPiece} collapsed={!!collapsedSections.piece} onToggle={toggleSection} />

              {/* Material */}
              <PropertySection id="material" title="MATERIAL" collapsed={!!collapsedSections.material} onToggle={toggleSection}>
                <MaterialTab />
              </PropertySection>

              {/* Seams */}
              {seams.length > 0 && (
                <PropertySection id="seams" title={`SEAMS (${seams.length})`} collapsed={!!collapsedSections.seams} onToggle={toggleSection}>
                  {seams.map(seam => {
                    const pA = pieces.find(p => p.id === seam.pieceA.pieceId);
                    const pB = pieces.find(p => p.id === seam.pieceB.pieceId);
                    const isSelected = editor.selectedSeamId === seam.id;
                    return (
                      <div
                        key={seam.id}
                        className={`seam-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => dispatch(selectSeam(seam.id))}
                      >
                        <span className="seam-label">
                          {pA?.name || '?'} ↔ {pB?.name || '?'}
                        </span>
                        <span className="seam-type">{seam.type}</span>
                        <button
                          className="seam-delete"
                          onClick={(e) => { e.stopPropagation(); dispatch(removeSeam(seam.id)); }}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    );
                  })}
                </PropertySection>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Run E2E test to verify it passes**

Run: `npx playwright test tests/e2e/layout-cleanup.spec.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/components/PropertiesPanel/PropertiesPanel.tsx tests/e2e/layout-cleanup.spec.ts
git commit -m "feat: slim PropertiesPanel to PIECE/MATERIAL/SEAMS only"
```

---

### Task 3: Create ProjectView (Merged Explorer + Files + Project)

**Files:**
- Create: `src/components/views/ProjectView.tsx`

**Step 1: Create the merged ProjectView**

This merges:
1. Project header: name input, Save/Open/New buttons (from PropertiesPanel PROJECT section and FileExplorerView)
2. Piece list with visibility/lock toggles (from PatternExplorerView)
3. Import/Export sections (from FileExplorerView — all formats)
4. Cutting Layout section (from FileExplorerView)

Create `src/components/views/ProjectView.tsx`:

```typescript
import { useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { selectPiece } from '../../store/editorSlice';
import { addPiece, loadProject, addSeam, updateAvatar, updateMeasurements, setProjectName } from '../../store/projectSlice';
import { parseDXF, dxfToPatternPieces, downloadDXFAAMA } from '../../utils/dxf';
import type { DXFDocument } from '../../utils/dxf/types';
import { downloadPDF } from '../../utils/exportPDF';
import { downloadOBJ } from '../../utils/export/exportOBJ';
import ImportDXFDialog from '../ImportDXFDialog/ImportDXFDialog';
import type { ImportDXFOptions } from '../ImportDXFDialog/ImportDXFDialog';
import ExportSkillModal from '../ExportSkillModal/ExportSkillModal';
import { importZprj } from '../../utils/formats/zprjImport';
import { downloadZprj } from '../../utils/formats/zprjExport';
import { importSVG } from '../../utils/formats/svgImport';
import { importGerber } from '../../utils/formats/gerberImport';
import { downloadGerber } from '../../utils/formats/gerberExport';
import { computeCuttingLayout, DEFAULT_CONFIG } from '../../utils/export/cuttingLayout';
import type { PaperSize, CuttingLayoutConfig } from '../../utils/export/cuttingLayout';
import { exportCuttingPDF } from '../../utils/export/pdfCuttingExport';
import { PAPER_SIZES } from '../../utils/export/cuttingLayout';
import { openMarker } from '../../store/markerSlice';
import type { OpenCloProject, PatternPiece } from '../../types/types';
import './views.css';

// ─── Collapsible Section ───

interface SectionProps {
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, badge, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sidebar-section">
      <button className="sidebar-section-header" onClick={() => setOpen(!open)}>
        <span className="sidebar-section-toggle">{open ? '▾' : '▸'}</span>
        <span className="sidebar-section-title">{title}</span>
        {badge != null && <span className="sidebar-section-badge">({badge})</span>}
      </button>
      <div className={`sidebar-section-body${open ? '' : ' collapsed'}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Piece Visibility / Lock State (local UI state) ───

interface PieceUIState {
  visible: boolean;
  locked: boolean;
}

function getUIFromMap(map: Record<string, PieceUIState>, id: string): PieceUIState {
  return map[id] ?? { visible: true, locked: false };
}

// ─── Main Component ───

export default function ProjectView() {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);
  const fabrics = useSelector((s: RootState) => s.project.fabrics);
  const avatar = useSelector((s: RootState) => s.project.avatar);
  const projectName = useSelector((s: RootState) => s.project.name);
  const projectId = useSelector((s: RootState) => s.project.id);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const construction = useSelector((s: RootState) => s.construction);
  const hasConstruction = construction?.points?.length > 0;

  // ─── Local UI State ───
  const [pieceUI, setPieceUI] = useState<Record<string, PieceUIState>>({});
  const [lastExport, setLastExport] = useState<{ filename: string; date: string } | null>(null);
  const [showExportSkillModal, setShowExportSkillModal] = useState(false);
  const [dxfDialogDoc, setDxfDialogDoc] = useState<DXFDocument | null>(null);
  const [clPaperSize, setClPaperSize] = useState<PaperSize>('A0');
  const [clIncludeSA, setClIncludeSA] = useState(true);
  const [clIncludeGrainline, setClIncludeGrainline] = useState(true);
  const [clTileToA4, setClTileToA4] = useState(false);
  const [clScale, setClScale] = useState(1.0);
  const [clUtilization, setClUtilization] = useState<number | null>(null);

  // ─── File Refs ───
  const dxfInputRef = useRef<HTMLInputElement>(null);
  const zprjInputRef = useRef<HTMLInputElement>(null);
  const svgInputRef = useRef<HTMLInputElement>(null);
  const gerberInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  // ─── Piece UI Helpers ───
  const getUI = (id: string): PieceUIState => pieceUI[id] ?? { visible: true, locked: false };

  const toggleVisibility = useCallback((id: string) => {
    setPieceUI(prev => ({
      ...prev,
      [id]: { ...getUIFromMap(prev, id), visible: !getUIFromMap(prev, id).visible },
    }));
  }, []);

  const toggleLock = useCallback((id: string) => {
    setPieceUI(prev => ({
      ...prev,
      [id]: { ...getUIFromMap(prev, id), locked: !getUIFromMap(prev, id).locked },
    }));
  }, []);

  const handleSelectPiece = useCallback((id: string) => {
    dispatch(selectPiece(id));
  }, [dispatch]);

  const handleAddPiece = useCallback(() => {
    const newPiece: PatternPiece = {
      id: `piece-${Date.now()}`,
      name: `Piece ${pieces.length + 1}`,
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
      internals: [],
      position: { x: 50, y: 50 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    dispatch(addPiece(newPiece));
  }, [dispatch, pieces.length]);

  // ─── Import Handlers ───

  const handleDXFFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const doc = parseDXF(text);
    setDxfDialogDoc(doc);
    if (dxfInputRef.current) dxfInputRef.current.value = '';
  }, []);

  const handleDXFDialogImport = useCallback((options: ImportDXFOptions) => {
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
        avatar: {
          id: 'default', name: 'Default Avatar', modelUrl: '',
          measurements: { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    } else {
      for (const piece of dxfPieces) dispatch(addPiece(piece));
    }
    setDxfDialogDoc(null);
  }, [dxfDialogDoc, dispatch]);

  const handleSVGFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = importSVG(text);
    for (const piece of result.pieces) dispatch(addPiece(piece));
    if (result.warnings.length > 0) console.warn('SVG import warnings:', result.warnings);
    if (svgInputRef.current) svgInputRef.current.value = '';
  }, [dispatch]);

  const handleZprjFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importZprj(file);
      for (const piece of result.pieces) dispatch(addPiece(piece));
      for (const seam of result.seams) dispatch(addSeam(seam));
      if (result.projectName) dispatch(setProjectName(result.projectName));
      if (result.avatar?.measurements) dispatch(updateMeasurements(result.avatar.measurements));
      if (result.avatar?.modelUrl) dispatch(updateAvatar({ modelUrl: result.avatar.modelUrl }));
    } catch (err) {
      console.error('Failed to import .zprj:', err);
      alert('Failed to import .zprj file. Check console for details.');
    }
    if (zprjInputRef.current) zprjInputRef.current.value = '';
  }, [dispatch]);

  const handleGerberFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importGerber(file);
      for (const piece of result.pieces) dispatch(addPiece(piece));
      if (result.warnings.length > 0) console.warn('Gerber import warnings:', result.warnings);
    } catch (err) {
      console.error('Failed to import Gerber:', err);
      alert('Failed to import Gerber AccuMark file. Check console for details.');
    }
    if (gerberInputRef.current) gerberInputRef.current.value = '';
  }, [dispatch]);

  // ─── Export Handlers ───

  const handleExportDXFAAMA = useCallback(() => {
    const filename = `${projectName || 'pattern'}-aama.dxf`;
    downloadDXFAAMA(pieces, filename);
    setLastExport({ filename, date: new Date().toLocaleString() });
  }, [pieces, projectName]);

  const handleExportPDF = useCallback(() => {
    const filename = `${projectName || 'pattern'}.pdf`;
    downloadPDF(pieces, filename);
    setLastExport({ filename, date: new Date().toLocaleString() });
  }, [pieces, projectName]);

  const handleExportOBJ = useCallback(() => {
    const filename = `${projectName || 'pattern'}.obj`;
    downloadOBJ(pieces, filename);
    setLastExport({ filename, date: new Date().toLocaleString() });
  }, [pieces, projectName]);

  const handleExportZprj = useCallback(() => {
    downloadZprj(
      { pieces, seams, fabrics, avatar, projectName },
      { projectName: projectName || 'project' },
    );
    setLastExport({ filename: `${projectName || 'project'}.zprj`, date: new Date().toLocaleString() });
  }, [pieces, seams, fabrics, avatar, projectName]);

  const handleExportGerber = useCallback(() => {
    downloadGerber(pieces, seams, projectName || 'accumark-export');
    setLastExport({ filename: `${projectName || 'accumark-export'}.zip`, date: new Date().toLocaleString() });
  }, [pieces, seams, projectName]);

  const handleExportCuttingLayout = useCallback(async () => {
    const config: CuttingLayoutConfig = {
      ...DEFAULT_CONFIG, paperSize: clPaperSize, scale: clScale,
      includeSeamAllowance: clIncludeSA, includeGrainline: clIncludeGrainline, tileToA4: clTileToA4,
    };
    const layout = computeCuttingLayout(pieces, seams, config);
    setClUtilization(layout.fabricUtilization);
    const filename = `${projectName || 'pattern'}-cutting-layout.pdf`;
    await exportCuttingPDF(layout, config, filename);
    setLastExport({ filename, date: new Date().toLocaleString() });
  }, [pieces, seams, projectName, clPaperSize, clScale, clIncludeSA, clIncludeGrainline, clTileToA4]);

  const handleEditLayout = useCallback(() => {
    const config: CuttingLayoutConfig = {
      ...DEFAULT_CONFIG, paperSize: clPaperSize, scale: clScale,
      includeSeamAllowance: clIncludeSA, includeGrainline: clIncludeGrainline, tileToA4: false,
    };
    const layout = computeCuttingLayout(pieces, seams, config);
    const paperDims = clPaperSize === 'CUSTOM' ? { width: 841, height: 1189 } : PAPER_SIZES[clPaperSize]!;
    dispatch(openMarker({
      layout, paperSize: clPaperSize, paperWidth: paperDims.width, paperHeight: paperDims.height,
      scale: clScale, margin: config.margin, includeSeamAllowance: clIncludeSA,
    }));
  }, [dispatch, pieces, seams, clPaperSize, clScale, clIncludeSA, clIncludeGrainline]);

  // ─── Project Save / Load ───

  const handleSaveProject = useCallback(() => {
    const project: OpenCloProject = {
      id: projectId, name: projectName, pieces, seams, fabrics, avatar,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName || 'project'}.openclo.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLastExport({ filename: `${projectName || 'project'}.openclo.json`, date: new Date().toLocaleString() });
  }, [projectId, projectName, pieces, seams, fabrics, avatar]);

  const handleLoadProject = useCallback(() => {
    projectInputRef.current?.click();
  }, []);

  const handleProjectFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const project = JSON.parse(text) as OpenCloProject;
      dispatch(loadProject(project));
    } catch (err) {
      console.error('Failed to load project:', err);
    }
    if (projectInputRef.current) projectInputRef.current.value = '';
  }, [dispatch]);

  const handleNewProject = useCallback(() => {
    if (window.confirm('Create a new project? Unsaved changes will be lost.')) {
      import('../../utils/projectIO').then(m => m.clearStorageProject());
      import('../../store/actions').then(m => dispatch(m.NEW_PROJECT()));
    }
  }, [dispatch]);

  return (
    <div className="sidebar-view">
      {/* Hidden file inputs */}
      <input ref={dxfInputRef} type="file" accept=".dxf" style={{ display: 'none' }} onChange={handleDXFFileChange} />
      <input ref={zprjInputRef} type="file" accept=".zprj" style={{ display: 'none' }} onChange={handleZprjFileChange} />
      <input ref={svgInputRef} type="file" accept=".svg" style={{ display: 'none' }} onChange={handleSVGFileChange} />
      <input ref={gerberInputRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={handleGerberFileChange} />
      <input ref={projectInputRef} type="file" accept=".json,.openclo.json" style={{ display: 'none' }} onChange={handleProjectFileChange} />

      <div className="sidebar-view-content">
        {/* Project Header */}
        <Section title="Project">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="sidebar-field-row">
              <span className="sidebar-label">Name</span>
              <input
                type="text"
                className="sidebar-input"
                value={projectName}
                onChange={e => dispatch(setProjectName(e.target.value))}
              />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="sidebar-btn sidebar-btn-primary" style={{ flex: 1 }} onClick={handleSaveProject}>Save</button>
              <button className="sidebar-btn" style={{ flex: 1 }} onClick={handleLoadProject}>Open</button>
              <button className="sidebar-btn" style={{ flex: 1 }} onClick={handleNewProject}>New</button>
            </div>
          </div>
        </Section>

        {/* Pieces */}
        <Section title="Pieces" badge={pieces.length}>
          <div className="sidebar-view-header-actions" style={{ marginBottom: 4 }}>
            <button onClick={handleAddPiece} title="Add Piece">+</button>
          </div>
          {pieces.length === 0 ? (
            <div className="sidebar-info">No pieces yet. Add a piece or import a file.</div>
          ) : (
            pieces.map(piece => {
              const ui = getUI(piece.id);
              const isSelected = selectedPieceIds.includes(piece.id);
              return (
                <div key={piece.id}>
                  <div
                    className={`sidebar-list-item${isSelected ? ' selected' : ''}`}
                    onClick={() => handleSelectPiece(piece.id)}
                  >
                    <span className="sidebar-list-item-label">{piece.name}</span>
                    <div className="sidebar-list-item-actions" style={{ opacity: 1 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleVisibility(piece.id); }}
                        title={ui.visible ? 'Hide' : 'Show'}
                        style={{ opacity: ui.visible ? 1 : 0.4 }}
                      >
                        👁
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLock(piece.id); }}
                        title={ui.locked ? 'Unlock' : 'Lock'}
                        style={{ opacity: ui.locked ? 1 : 0.4 }}
                      >
                        🔒
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </Section>

        {/* Import */}
        <Section title="Import" defaultOpen={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button className="sidebar-btn sidebar-btn-full" onClick={() => dxfInputRef.current?.click()}>Import DXF</button>
            <button className="sidebar-btn sidebar-btn-full" onClick={() => svgInputRef.current?.click()}>Import SVG</button>
            <button className="sidebar-btn sidebar-btn-full" onClick={() => zprjInputRef.current?.click()}>Import .zprj</button>
            <button className="sidebar-btn sidebar-btn-full" onClick={() => gerberInputRef.current?.click()}>Import Gerber</button>
          </div>
        </Section>

        {/* Export */}
        <Section title="Export" defaultOpen={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleExportDXFAAMA} disabled={pieces.length === 0}>Export DXF (AAMA)</button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleExportPDF} disabled={pieces.length === 0}>Export PDF</button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleExportOBJ} disabled={pieces.length === 0}>Export OBJ</button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleExportZprj} disabled={pieces.length === 0}>Export .zprj (CLO3D)</button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleExportGerber} disabled={pieces.length === 0}>Export Gerber</button>
            <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '8px 0' }} />
            <button className="sidebar-btn sidebar-btn-full" onClick={() => setShowExportSkillModal(true)} disabled={!hasConstruction} title={hasConstruction ? 'Export as reusable skill' : 'Create a parametric pattern first'}>Export as Skill</button>
          </div>
        </Section>

        {/* Cutting Layout */}
        <Section title="Cutting Layout" defaultOpen={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11 }}>
              Paper Size
              <select value={clPaperSize} onChange={e => setClPaperSize(e.target.value as PaperSize)} style={{ width: '100%', marginTop: 2 }}>
                <option value="A0">A0 (841x1189mm)</option>
                <option value="A1">A1 (594x841mm)</option>
                <option value="A4">A4 (210x297mm)</option>
              </select>
            </label>
            <label style={{ fontSize: 11 }}>
              Scale
              <select value={clScale} onChange={e => setClScale(Number(e.target.value))} style={{ width: '100%', marginTop: 2 }}>
                <option value={1}>1:1</option>
                <option value={0.5}>1:2</option>
                <option value={0.2}>1:5</option>
              </select>
            </label>
            <label style={{ fontSize: 11 }}>
              <input type="checkbox" checked={clIncludeSA} onChange={e => setClIncludeSA(e.target.checked)} /> Include Seam Allowance
            </label>
            <label style={{ fontSize: 11 }}>
              <input type="checkbox" checked={clIncludeGrainline} onChange={e => setClIncludeGrainline(e.target.checked)} /> Include Grainline
            </label>
            <label style={{ fontSize: 11 }}>
              <input type="checkbox" checked={clTileToA4} onChange={e => setClTileToA4(e.target.checked)} disabled={clPaperSize === 'A4'} /> Tile to A4
            </label>
            {clUtilization !== null && (
              <div style={{ fontSize: 11, color: '#888' }}>Fabric utilization: {(clUtilization * 100).toFixed(1)}%</div>
            )}
            <button className="sidebar-btn sidebar-btn-primary sidebar-btn-full" onClick={handleExportCuttingLayout} disabled={pieces.length === 0}>Export Cutting Layout</button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleEditLayout} disabled={pieces.length === 0}>Edit Layout</button>
          </div>
        </Section>

        {/* Last Export Info */}
        {lastExport && (
          <Section title="Last Export" defaultOpen={false}>
            <div className="sidebar-info">
              <div>{lastExport.filename}</div>
              <div style={{ color: '#666', marginTop: 2 }}>{lastExport.date}</div>
            </div>
          </Section>
        )}
      </div>

      {/* Dialogs */}
      {dxfDialogDoc && (
        <ImportDXFDialog doc={dxfDialogDoc} onImport={handleDXFDialogImport} onCancel={() => setDxfDialogDoc(null)} />
      )}
      <ExportSkillModal isOpen={showExportSkillModal} onClose={() => setShowExportSkillModal(false)} />
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/views/ProjectView.tsx
git commit -m "feat: create merged ProjectView (explorer + files + project)"
```

---

### Task 4: Create AvatarBodyView (Merged Avatar + Measurements)

**Files:**
- Create: `src/components/views/AvatarBodyView.tsx`

**Step 1: Create the merged AvatarBodyView**

This merges:
1. Avatar mode toggle: Dress Form vs 3D Model (from AvatarProperties)
2. Model upload: GLB/GLTF file picker, URL input (from AvatarProperties)
3. Body measurements: all measurement inputs organized by category (from MeasurementsView)

Create `src/components/views/AvatarBodyView.tsx`:

```typescript
import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { updateMeasurements, setAvatarMode, setAvatarModelUrl } from '../../store/projectSlice';
import type { BodyMeasurements } from '../../types/types';
import './views.css';

// ─── Measurement Categories ───

interface MeasurementField {
  key: keyof BodyMeasurements;
  label: string;
}

interface MeasurementCategory {
  name: string;
  fields: MeasurementField[];
}

const CATEGORIES: MeasurementCategory[] = [
  {
    name: 'Head & Neck',
    fields: [
      { key: 'neckCirc', label: 'Neck Circumference' },
      { key: 'neckBackHeight', label: 'Neck Back Height' },
    ],
  },
  {
    name: 'Torso',
    fields: [
      { key: 'chest', label: 'Chest' },
      { key: 'highBust', label: 'High Bust' },
      { key: 'lowBust', label: 'Low Bust' },
      { key: 'ribCirc', label: 'Rib Circumference' },
      { key: 'waist', label: 'Waist' },
      { key: 'hips', label: 'Hips' },
      { key: 'highHip', label: 'High Hip' },
      { key: 'shoulder', label: 'Shoulder' },
      { key: 'shoulderWidth', label: 'Shoulder Width' },
      { key: 'bustWidth', label: 'Bust Width' },
      { key: 'waistWidth', label: 'Waist Width' },
      { key: 'hipWidth', label: 'Hip Width' },
      { key: 'neckToWaistFront', label: 'Neck to Waist (Front)' },
      { key: 'neckToWaistBack', label: 'Neck to Waist (Back)' },
      { key: 'shoulderToWaistFront', label: 'Shoulder to Waist (Front)' },
      { key: 'shoulderToWaistBack', label: 'Shoulder to Waist (Back)' },
      { key: 'waistToHipFront', label: 'Waist to Hip (Front)' },
      { key: 'waistToHipBack', label: 'Waist to Hip (Back)' },
      { key: 'crotchLength', label: 'Crotch Length' },
      { key: 'bustPointToBustPoint', label: 'Bust Point to Bust Point' },
      { key: 'bustPointToNeckSide', label: 'Bust Point to Neck Side' },
      { key: 'dartWidthBust', label: 'Dart Width (Bust)' },
      { key: 'dartWidthWaist', label: 'Dart Width (Waist)' },
    ],
  },
  {
    name: 'Arms',
    fields: [
      { key: 'armLength', label: 'Arm Length' },
      { key: 'upperArmCirc', label: 'Upper Arm Circ.' },
      { key: 'elbowCirc', label: 'Elbow Circ.' },
      { key: 'wristCirc', label: 'Wrist Circ.' },
      { key: 'shoulderToElbow', label: 'Shoulder to Elbow' },
      { key: 'elbowToWrist', label: 'Elbow to Wrist' },
      { key: 'armscyeDepth', label: 'Armscye Depth' },
    ],
  },
  {
    name: 'Legs',
    fields: [
      { key: 'inseam', label: 'Inseam' },
      { key: 'thighCirc', label: 'Thigh Circ.' },
      { key: 'kneeCirc', label: 'Knee Circ.' },
      { key: 'calfCirc', label: 'Calf Circ.' },
      { key: 'ankleCirc', label: 'Ankle Circ.' },
      { key: 'waistToKnee', label: 'Waist to Knee' },
      { key: 'waistToFloor', label: 'Waist to Floor' },
      { key: 'kneeHeight', label: 'Knee Height' },
      { key: 'hipHeight', label: 'Hip Height' },
      { key: 'waistHeight', label: 'Waist Height' },
    ],
  },
  {
    name: 'Misc',
    fields: [
      { key: 'height', label: 'Height' },
    ],
  },
];

// ─── Collapsible Section ───

interface SectionProps {
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, badge, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sidebar-section">
      <button className="sidebar-section-header" onClick={() => setOpen(!open)}>
        <span className="sidebar-section-toggle">{open ? '▾' : '▸'}</span>
        <span className="sidebar-section-title">{title}</span>
        {badge != null && <span className="sidebar-section-badge">({badge})</span>}
      </button>
      <div className={`sidebar-section-body${open ? '' : ' collapsed'}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Main Component ───

export default function AvatarBodyView() {
  const dispatch = useDispatch();
  const { avatar, avatarMode, avatarModelUrl } = useSelector((s: RootState) => s.project);
  const measurements = avatar.measurements;

  const handleMeasurementChange = useCallback(
    (key: keyof BodyMeasurements, value: number) => {
      dispatch(updateMeasurements({ [key]: value }));
    },
    [dispatch],
  );

  return (
    <div className="sidebar-view">
      <div className="sidebar-view-content">
        {/* Avatar Mode Toggle */}
        <Section title="Avatar Mode" defaultOpen={true}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <button
              className={`sidebar-btn ${avatarMode === 'dressform' ? 'sidebar-btn-primary' : ''}`}
              style={{ flex: 1 }}
              onClick={() => dispatch(setAvatarMode('dressform'))}
            >
              Dress Form
            </button>
            <button
              className={`sidebar-btn ${avatarMode === 'model' ? 'sidebar-btn-primary' : ''}`}
              style={{ flex: 1, opacity: avatarModelUrl ? 1 : 0.4 }}
              onClick={() => { if (avatarModelUrl) dispatch(setAvatarMode('model')); }}
            >
              3D Model
            </button>
          </div>

          {/* Load GLB/GLTF */}
          <div style={{ marginBottom: 8 }}>
            <div className="sidebar-label" style={{ marginBottom: 4 }}>Load GLB / GLTF / VRM avatar</div>
            <input
              type="file"
              accept=".glb,.gltf,.vrm"
              style={{ fontSize: 11, width: '100%' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                  const url = URL.createObjectURL(file);
                  dispatch(setAvatarModelUrl(url));
                }
              }}
            />
            {avatarModelUrl && (
              <div style={{ fontSize: 10, color: '#4a9eff', marginTop: 2 }}>Model loaded</div>
            )}
          </div>

          {/* URL input for remote models */}
          <div>
            <div className="sidebar-label" style={{ marginBottom: 4 }}>Or paste URL (ReadyPlayerMe, MakeHuman...)</div>
            <input
              type="text"
              className="sidebar-input"
              placeholder="https://...model.glb"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const url = (e.target as HTMLInputElement).value.trim();
                  if (url) dispatch(setAvatarModelUrl(url));
                }
              }}
            />
          </div>
        </Section>

        {/* Measurement Categories */}
        {CATEGORIES.map(cat => (
          <Section
            key={cat.name}
            title={cat.name}
            badge={cat.fields.length}
            defaultOpen={cat.name === 'Torso'}
          >
            {cat.fields.map(field => {
              const val = measurements[field.key];
              return (
                <div key={field.key} className="sidebar-field-row">
                  <span className="sidebar-label">{field.label}</span>
                  <input
                    type="number"
                    className="sidebar-input sidebar-input-sm"
                    step={0.5}
                    value={val ?? ''}
                    placeholder="—"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) handleMeasurementChange(field.key, v);
                    }}
                  />
                </div>
              );
            })}
          </Section>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/views/AvatarBodyView.tsx
git commit -m "feat: create merged AvatarBodyView (avatar + measurements)"
```

---

### Task 5: Update ActivityBar (6 top + 3 bottom, add copilot toggle)

**Files:**
- Modify: `src/components/ActivityBar/ActivityBar.tsx`

**Step 1: Implement the changes**

Replace `src/components/ActivityBar/ActivityBar.tsx` with:

```typescript
import { FileText, User, Play, SlidersHorizontal, Layers, History, Plug, Settings, MessageSquare } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { toggleCopilot } from '../../store/layoutSlice';
import './ActivityBar.css';

export type SidebarView =
  | 'explorer'
  | 'avatar'
  | 'grading'
  | 'simulation'
  | 'parametric'
  | 'history'
  | 'plugins'
  | 'settings';

interface ActivityBarProps {
  activeView: SidebarView | null;
  onViewChange: (view: SidebarView | null) => void;
}

interface ActivityItem {
  id: SidebarView;
  label: string;
  icon: JSX.Element;
  position: 'top' | 'bottom';
}

const items: ActivityItem[] = [
  { id: 'explorer', label: 'Project', position: 'top', icon: <FileText size={20} /> },
  { id: 'avatar', label: 'Avatar & Body', position: 'top', icon: <User size={20} /> },
  { id: 'simulation', label: 'Simulation', position: 'top', icon: <Play size={20} /> },
  { id: 'parametric', label: 'Parametric', position: 'top', icon: <SlidersHorizontal size={20} /> },
  { id: 'grading', label: 'Grading', position: 'top', icon: <Layers size={20} /> },
  { id: 'history', label: 'History', position: 'top', icon: <History size={20} /> },
  { id: 'plugins', label: 'Plugins', position: 'bottom', icon: <Plug size={20} /> },
  { id: 'settings', label: 'Settings', position: 'bottom', icon: <Settings size={20} /> },
];

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  const dispatch = useDispatch();
  const copilotOpen = useSelector((s: RootState) => s.layout.copilotOpen);
  const topItems = items.filter(i => i.position === 'top');
  const bottomItems = items.filter(i => i.position === 'bottom');

  const handleClick = (id: SidebarView) => {
    if (activeView === id) {
      onViewChange(null);
    } else {
      onViewChange(id);
    }
  };

  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
        {topItems.map(item => (
          <button
            key={item.id}
            className={`activity-bar-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => handleClick(item.id)}
            title={item.label}
          >
            <span className="activity-bar-icon">{item.icon}</span>
          </button>
        ))}
      </div>
      <div className="activity-bar-bottom">
        {bottomItems.map(item => (
          <button
            key={item.id}
            className={`activity-bar-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => handleClick(item.id)}
            title={item.label}
          >
            <span className="activity-bar-icon">{item.icon}</span>
          </button>
        ))}
        <button
          className={`activity-bar-item ${copilotOpen ? 'active' : ''}`}
          onClick={() => dispatch(toggleCopilot())}
          title="Copilot"
        >
          <span className="activity-bar-icon"><MessageSquare size={20} /></span>
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (may have errors from Sidebar.tsx still referencing old views — that's Task 6)

**Step 3: Commit**

```bash
git add src/components/ActivityBar/ActivityBar.tsx
git commit -m "feat: reduce ActivityBar to 6+3 items, add copilot toggle"
```

---

### Task 6: Update Sidebar Routing

**Files:**
- Modify: `src/components/Sidebar/Sidebar.tsx`

**Step 1: Implement the changes**

Replace `src/components/Sidebar/Sidebar.tsx` with:

```typescript
import { X } from 'lucide-react';
import type { SidebarView } from '../ActivityBar/ActivityBar';
import { GradingView, SettingsView } from '../views';
import ProjectView from '../views/ProjectView';
import AvatarBodyView from '../views/AvatarBodyView';
import PluginManager from '../PluginManager/PluginManager';
import SimulationView from './SimulationView';
import ParametricView from './ParametricView';
import HistoryView from '../views/HistoryView';
import '../views/views.css';
import './Sidebar.css';

interface SidebarProps {
  activeView: SidebarView | null;
  onClose: () => void;
}

const viewTitles: Record<SidebarView, string> = {
  explorer: 'Project',
  avatar: 'Avatar & Body',
  grading: 'Grading',
  simulation: 'Simulation',
  parametric: 'Parametric',
  history: 'History',
  plugins: 'Plugins',
  settings: 'Settings',
};

export default function Sidebar({ activeView, onClose }: SidebarProps) {
  const isOpen = activeView !== null;

  return (
    <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      {activeView && (
        <>
          <div className="sidebar-header">
            <span className="sidebar-title">{viewTitles[activeView]}</span>
            <button className="sidebar-close" onClick={onClose} title="Close Sidebar">
              <X size={14} />
            </button>
          </div>
          <div className="sidebar-content">
            {activeView === 'explorer' && <ProjectView />}
            {activeView === 'avatar' && <AvatarBodyView />}
            {activeView === 'grading' && <GradingView />}
            {activeView === 'simulation' && <SimulationView />}
            {activeView === 'parametric' && <ParametricView />}
            {activeView === 'history' && <HistoryView />}
            {activeView === 'plugins' && <PluginManager />}
            {activeView === 'settings' && <SettingsView />}
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/Sidebar/Sidebar.tsx
git commit -m "feat: update Sidebar routing for 8 consolidated views"
```

---

### Task 7: Update Barrel Exports and Delete Dead Files

**Files:**
- Modify: `src/components/views/index.ts`
- Delete: `src/components/PropertiesPanel/AvatarProperties.tsx`
- Delete: `src/components/PropertiesPanel/SimulationProperties.tsx`

**Step 1: Update barrel exports**

Replace `src/components/views/index.ts` with:

```typescript
export { default as PatternExplorerView } from './PatternExplorerView';
export { default as MeasurementsView } from './MeasurementsView';
export { default as GradingView } from './GradingView';
export { default as NestingView } from './NestingView';
export { default as FileExplorerView } from './FileExplorerView';
export { default as SettingsView } from './SettingsView';
export { default as ProjectView } from './ProjectView';
export { default as AvatarBodyView } from './AvatarBodyView';
```

Note: We keep old exports (PatternExplorerView, MeasurementsView, FileExplorerView, NestingView) because they might still be imported elsewhere. They can be removed in a follow-up if no imports remain.

**Step 2: Delete dead files**

```bash
rm src/components/PropertiesPanel/AvatarProperties.tsx
rm src/components/PropertiesPanel/SimulationProperties.tsx
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors. If there are errors about missing imports of deleted files, fix them (the PropertiesPanel.tsx from Task 2 already removed those imports).

**Step 4: Run unit tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: update barrel exports, delete AvatarProperties and SimulationProperties"
```

---

### Task 8: E2E Tests for New Layout

**Files:**
- Modify: `tests/e2e/layout-cleanup.spec.ts` (extend from Task 2)
- Modify: `tests/e2e/materials.spec.ts` (fix any broken selectors)

**Step 1: Extend E2E tests**

Add to `tests/e2e/layout-cleanup.spec.ts`:

```typescript
  test('copilot starts minimized', async ({ page }) => {
    await waitForApp(page);
    // The copilot side panel should not be expanded by default
    // CopilotSidePanel renders a collapsed tab when copilotOpen is false
    const copilotExpanded = page.locator('.copilot-side-panel.expanded');
    await expect(copilotExpanded).not.toBeVisible({ timeout: 3000 });
  });

  test('Activity Bar has correct icon count', async ({ page }) => {
    await waitForApp(page);
    const activityItems = page.locator('.activity-bar-item');
    // 6 top + 2 bottom + 1 copilot toggle = 9 total
    await expect(activityItems).toHaveCount(9, { timeout: 5000 });
  });

  test('Project view has save/open/new and piece list', async ({ page }) => {
    await waitForApp(page);
    // Click the Project icon in ActivityBar (first item)
    await page.click('.activity-bar-item[title="Project"]');
    await page.waitForTimeout(300);

    // Sidebar should show Project title
    await expect(page.locator('.sidebar-title')).toHaveText('Project');

    // Save/Open/New buttons should be visible
    await expect(page.locator('button:has-text("Save")')).toBeVisible();
    await expect(page.locator('button:has-text("Open")')).toBeVisible();
    await expect(page.locator('button:has-text("New")')).toBeVisible();
  });

  test('Avatar & Body view has mode toggle and measurements', async ({ page }) => {
    await waitForApp(page);
    // Click the Avatar icon in ActivityBar
    await page.click('.activity-bar-item[title="Avatar & Body"]');
    await page.waitForTimeout(300);

    // Sidebar should show Avatar & Body title
    await expect(page.locator('.sidebar-title')).toHaveText('Avatar & Body');

    // Mode toggle buttons
    await expect(page.locator('button:has-text("Dress Form")')).toBeVisible();
    await expect(page.locator('button:has-text("3D Model")')).toBeVisible();
  });
```

**Step 2: Run all E2E tests**

Run: `npx playwright test tests/e2e/layout-cleanup.spec.ts`
Expected: All PASS

**Step 3: Run the materials E2E tests to verify no regressions**

Run: `npx playwright test tests/e2e/materials.spec.ts`
Expected: All PASS (material tests should still work since MATERIAL section is still in PropertiesPanel)

**Step 4: Run full test suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All pass, no type errors

**Step 5: Commit**

```bash
git add tests/e2e/layout-cleanup.spec.ts
git commit -m "test: add E2E tests for layout cleanup (copilot, activity bar, views)"
```

---

### Task 9: Final Cleanup — Remove Unused PropertiesPanel CSS and Verify

**Files:**
- Modify: `src/components/PropertiesPanel/PropertiesPanel.css` (remove styles for deleted sections)

**Step 1: Check for unused CSS classes**

Look for CSS classes that were only used by the removed sections (PROJECT, AVATAR, DISPLAY, EXPORT, SIMULATION). Remove any styles for:
- `.avatar-mode-toggle`, `.mode-btn`
- `.sim-button`
- `.export-buttons`, `.export-btn`
- `.file-field`, `.file-input`, `.file-status`, `.file-label`
- `.url-field`, `.url-input`, `.url-label`
- `.measurements-section`
- `.panel-button-row`, `.panel-labeled-btn`

**Step 2: Verify nothing else uses these classes**

Run: `grep -r "avatar-mode-toggle\|sim-button\|export-buttons\|export-btn\|panel-button-row\|panel-labeled-btn" src/`

If any matches outside deleted files, keep those styles. Otherwise, remove them from PropertiesPanel.css.

**Step 3: Run full E2E suite**

Run: `npx playwright test`
Expected: All pass

**Step 4: Commit**

```bash
git add src/components/PropertiesPanel/PropertiesPanel.css
git commit -m "chore: remove unused CSS for deleted PropertiesPanel sections"
```

---

## Summary

| Task | Description | Creates | Modifies | Deletes |
|------|-------------|---------|----------|---------|
| 1 | Copilot default minimized | layoutSlice.test.ts | layoutSlice.ts | — |
| 2 | Slim PropertiesPanel to 3 sections | layout-cleanup.spec.ts | PropertiesPanel.tsx | — |
| 3 | Merged ProjectView | ProjectView.tsx | — | — |
| 4 | Merged AvatarBodyView | AvatarBodyView.tsx | — | — |
| 5 | Update ActivityBar 6+3 | — | ActivityBar.tsx | — |
| 6 | Update Sidebar routing | — | Sidebar.tsx | — |
| 7 | Barrel exports + cleanup | — | views/index.ts | AvatarProperties.tsx, SimulationProperties.tsx |
| 8 | E2E tests | — | layout-cleanup.spec.ts | — |
| 9 | CSS cleanup | — | PropertiesPanel.css | — |

**Before:** 7 PropertiesPanel sections, 11 sidebar views, 11 activity bar items, copilot always open
**After:** 3 PropertiesPanel sections, 8 sidebar views, 9 activity bar items (6+2+copilot), copilot minimized
