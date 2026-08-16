import { useState, useRef, useCallback, lazy, Suspense } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { setSplitRatio } from '../../store/layoutSlice';
import { addPiece } from '../../store/projectSlice';
import { classifyImportedPieces } from '../../utils/geometricClassifier';
import { requestFitView } from '../../store/editorSlice';
import { showSuccessToast, showErrorToast, showInfoToast } from '../../store/copilotUISlice';
import { readAndParseDXFFile } from '../../utils/dxf';
import { dxfErrorMessage, piecesLabel } from './dxfImport';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useSchemeHeuristic } from '../../input/useSchemeHeuristic';
import TopBar from './TopBar';
import UnifiedBar from './UnifiedBar';
import LeftDock from './LeftDock';
import RightDock from './RightDock';
import PatternEditor from '../PatternEditor/PatternEditor';
import Viewport3D, { Viewport3DErrorBoundary } from '../Viewport3D/Viewport3D';
import ContextPanel from './ContextPanel';
import ToastContainer from './ToastContainer';
import ConfirmDialog from './ConfirmDialog';
import { usePanelHost } from '../../hooks/usePanelHost';
import type { Tool3D } from '../../types/types';

// Lazy-load panel content
const AvatarPanel = lazy(() => import('../Viewport3D/AvatarPanel'));
const BOMTab = lazy(() => import('../BottomPanel/BOMTab'));
const GradingTab = lazy(() => import('../BottomPanel/GradingTab'));
const InspectorTab = lazy(() => import('../BottomPanel/InspectorTab'));
const NestingTab = lazy(() => import('../BottomPanel/NestingTab'));
// ProblemsContent needs special handling — BottomPanel is a complex component.
// For now, problems are shown as a placeholder in the context panel.
const LayerPanel = lazy(() => import('../LayerPanel/LayerPanel'));
const PropertiesPanel = lazy(() => import('../PropertiesPanel/PropertiesPanel'));

const PanelLoading = () => (
  <div style={{ padding: 'var(--sp-4)', color: 'var(--text-ghost)', fontSize: '13px', textAlign: 'center' }}>
    Cargando...
  </div>
);

/** Nombre visible del panel. Las CLAVES (Properties, BOM...) no se tocan:
 * indexan renderPanelContent y getPanelSide; solo cambia el display. */
const PANEL_LABELS: Record<string, string> = {
  Avatar: 'Avatar',
  BOM: 'Lista de materiales',
  Grading: 'Escalado',
  Inspector: 'Inspector',
  Nesting: 'Marcada',
  Layers: 'Capas',
  Properties: 'Propiedades',
};

function renderPanelContent(name: string) {
  const fallback = <PanelLoading />;
  switch (name) {
    case 'Avatar':
      return <Suspense fallback={fallback}><AvatarPanel open /></Suspense>;
    case 'BOM':
      return <Suspense fallback={fallback}><BOMTab /></Suspense>;
    case 'Grading':
      return <Suspense fallback={fallback}><GradingTab /></Suspense>;
    case 'Inspector':
      return <Suspense fallback={fallback}><InspectorTab /></Suspense>;
    case 'Nesting':
      return <Suspense fallback={fallback}><NestingTab /></Suspense>;
    case 'Layers':
      return <Suspense fallback={fallback}><LayerPanel /></Suspense>;
    case 'Properties':
      return <Suspense fallback={fallback}><PropertiesPanel /></Suspense>;
    default:
      // Fase1-S2: murió el placeholder circular ("X — available via ⌘K").
      // Ya ningún opener vivo pasa nombres fuera del switch; si uno llega,
      // es un bug del opener, no una superficie que mostrar.
      return null;
  }
}

export default function AppShell() {
  const dispatch = useDispatch();
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const splitRatio = useSelector((s: RootState) => s.layout.splitRatio);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const { leftPanel, rightPanel, openPanel, togglePanel, closePanel } = usePanelHost();
  const canvasRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [dxfDragActive, setDxfDragActive] = useState(false);
  const dxfDragCounter = useRef(0);
  const dxfInputRef = useRef<HTMLInputElement>(null);

  // One-shot passive trackpad heuristic (ctrlKey+wheel → auto-detects trackpad).
  useSchemeHeuristic();

  // Register all keyboard shortcut handlers (file/edit/tools/sim/etc).
  // Without this, every shortcut in src/shortcuts/defaults.ts is a no-op.
  useKeyboardShortcuts();

  // ─── DXF drop-zone (M3) ─────────────────────────────────────────────
  // Dropping a .dxf anywhere on the canvas imports it immediately. This
  // is the ONLY file-entry surface — the browser sandbox forbids the AI
  // agent from reading files, so import is always a user gesture. The
  // agent operates downstream on the loaded pieces (sew / dress / sim).
  // See docs/superpowers/specs/2026-05-29-m3-dxf-agentic-load-design.md.
  const importDXFFile = useCallback(async (file: File) => {
    try {
      const { result } = await readAndParseDXFFile(file, { unit: 'auto', autoDetect: true });
      // Hybrid classification at import (camisa de María plan, M1): name
      // first, geometry for nameless CAD blocks ("PATRONES PARA SAMUEL-N").
      // With category/side set BEFORE dispatch, the addPiece reducer's
      // detectSemanticEdges pass emits role-bearing edges (armhole,
      // neckline, sleeveCap) instead of inert positional ones — the
      // missing link zero behind the alien-blob drape.
      const classification = classifyImportedPieces(result.pieces);
      for (const piece of result.pieces) dispatch(addPiece(piece));
      // Fase1-S5: sin auto-selección post-import — dejaba el gizmo de
      // transformación plantado sobre el avatar sin gesto del usuario.
      dispatch(requestFitView()); // frame the freshly imported pattern (no more blank/tiny canvas)
      dispatch(showSuccessToast(
        `Cargué tu patrón: ${piecesLabel(result.pieces.length)}` +
        (classification.classified > 0
          ? ` · ${classification.classified} clasificada${classification.classified === 1 ? '' : 's'} automáticamente`
          : ''),
      ));
      if (classification.unclassified > 0) {
        // Honest non-silence: the agent's classifyPiece tool is the override.
        dispatch(showInfoToast(
          `${classification.unclassified} pieza${classification.unclassified === 1 ? '' : 's'} sin clasificar — pide al copiloto que las clasifique`,
        ));
      }
    } catch (err) {
      dispatch(showErrorToast(dxfErrorMessage(err)));
    }
  }, [dispatch]);

  // Counter pattern: dragenter/dragleave bubble from children, so a
  // single boolean flickers. Balancing a counter is the known-correct fix.
  const handleDxfDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dxfDragCounter.current += 1;
    setDxfDragActive(true);
  }, []);

  const handleDxfDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault(); // required so the drop event fires
  }, []);

  const handleDxfDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dxfDragCounter.current -= 1;
    if (dxfDragCounter.current <= 0) {
      dxfDragCounter.current = 0;
      setDxfDragActive(false);
    }
  }, []);

  const handleDxfDrop = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dxfDragCounter.current = 0;
    setDxfDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) void importDXFFile(file);
  }, [importDXFFile]);

  // File-picker fallback (File ▸ Import DXF…) for keyboard/touch users who
  // cannot drag-drop. Resets value so re-selecting the same file re-fires.
  const handleDxfFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void importDXFFile(file);
    e.target.value = '';
  }, [importDXFFile]);

  // ─── Divider drag ───────────────────────────────────────────────────
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const ratio = Math.max(0.15, Math.min(0.85, x / rect.width));
      dispatch(setSplitRatio(ratio));
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [dispatch]);

  // ─── Flex-grow calculations ─────────────────────────────────────────
  const get2dFlexGrow = () => {
    if (viewMode === '2d') return 1;
    if (viewMode === '3d') return 0;
    return splitRatio;
  };
  const get3dFlexGrow = () => {
    if (viewMode === '3d') return 1;
    if (viewMode === '2d') return 0;
    return 1 - splitRatio;
  };

  return (
    <div className="app-shell">
      <TopBar
        onOpenPanel={togglePanel}
        onImportDXF={() => dxfInputRef.current?.click()}
      />
      <input
        ref={dxfInputRef}
        type="file"
        accept=".dxf"
        onChange={handleDxfFileInput}
        style={{ display: 'none' }}
      />
      <div
        ref={canvasRef}
        className="canvas-area"
        onDragEnter={handleDxfDragEnter}
        onDragOver={handleDxfDragOver}
        onDragLeave={handleDxfDragLeave}
        onDrop={handleDxfDrop}
      >
        {dxfDragActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 'var(--z-hint)',
              pointerEvents: 'none', // let the drop event pass through to canvas-area
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(99, 102, 241, 0.12)',
              border: '2px dashed var(--accent, #6366f1)',
              borderRadius: 8,
            }}
          >
            <div
              style={{
                background: 'var(--bg-elevated, #1e1e1e)',
                color: 'var(--text-primary, #fff)',
                padding: '14px 22px',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
              }}
            >
              Suelta tu archivo .dxf para importarlo
            </div>
          </div>
        )}
        {leftPanel && (
          <ContextPanel title={PANEL_LABELS[leftPanel] ?? leftPanel} onClose={() => closePanel(leftPanel)}>
            {renderPanelContent(leftPanel)}
          </ContextPanel>
        )}
        <div
          className="canvas-area__2d"
          style={{ flex: `${get2dFlexGrow()} 1 0px`, display: viewMode === '3d' ? 'none' : undefined }}
        >
          <LeftDock onOpenPanel={togglePanel} />
          <PatternEditor
            onImportDXF={() => dxfInputRef.current?.click()}
            onOpenPanel={openPanel}
          />
        </div>
        {viewMode === 'split' && (
          <div className="canvas-area__divider" onMouseDown={handleDividerMouseDown} />
        )}
        <div
          className="canvas-area__3d"
          data-shortcut-context="3d"
          style={{ flex: `${get3dFlexGrow()} 1 0px`, display: viewMode === '2d' ? 'none' : undefined }}
        >
          <RightDock onOpenPanel={togglePanel} />
          <Viewport3DErrorBoundary>
            <Viewport3D activeTool3D={activeTool3D as Tool3D} hideChrome />
          </Viewport3DErrorBoundary>
        </div>
        {rightPanel && (
          <ContextPanel title={PANEL_LABELS[rightPanel] ?? rightPanel} onClose={() => closePanel(rightPanel)}>
            {renderPanelContent(rightPanel)}
          </ContextPanel>
        )}
      </div>
      <UnifiedBar
        onOpenPanel={togglePanel}
      />
      <ToastContainer />
      {/* Enciende `copilotUI.pendingConfirmation`, que estuvo siendo una
          superficie oscura: useGuardedAction lo despachaba (Tijeras, Fusionar)
          y nada lo pintaba. Ver ConfirmDialog.tsx. */}
      <ConfirmDialog />
    </div>
  );
}
