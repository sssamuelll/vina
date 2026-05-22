import { useState, useRef, useCallback, lazy, Suspense } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { setSplitRatio } from '../../store/layoutSlice';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import TopBar from './TopBar';
import UnifiedBar from './UnifiedBar';
import FloatingToolbar from './FloatingToolbar';
import FloatingControls3D from './FloatingControls3D';
import PatternEditor from '../PatternEditor/PatternEditor';
import Viewport3D, { Viewport3DErrorBoundary } from '../Viewport3D/Viewport3D';
import TemplateLibrary from '../TemplateLibrary/TemplateLibrary';
import ContextPanel from './ContextPanel';
import type { Tool3D } from '../Toolbar3D/Toolbar3D';

// Lazy-load panel content
const AvatarPanel = lazy(() => import('../Viewport3D/AvatarPanel'));
const BOMTab = lazy(() => import('../BottomPanel/BOMTab'));
const GradingTab = lazy(() => import('../BottomPanel/GradingTab'));
const InspectorTab = lazy(() => import('../BottomPanel/InspectorTab'));
const NestingTab = lazy(() => import('../BottomPanel/NestingTab'));
// ProblemsContent needs special handling — BottomPanel is a complex component.
// For now, problems are shown as a placeholder in the context panel.
const LayerPanel = lazy(() => import('../LayerPanel/LayerPanel'));

const PanelLoading = () => (
  <div style={{ padding: 'var(--sp-4)', color: 'var(--text-ghost)', fontSize: '13px', textAlign: 'center' }}>
    Loading...
  </div>
);

function renderPanelContent(name: string, onClose: () => void) {
  const fallback = <PanelLoading />;
  switch (name) {
    case 'Avatar':
      return <Suspense fallback={fallback}><AvatarPanel open onClose={onClose} /></Suspense>;
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
    default:
      return (
        <div style={{ padding: 'var(--sp-4)', color: 'var(--text-muted)', fontSize: '13px' }}>
          {name} — available via ⌘K
        </div>
      );
  }
}

export default function AppShell() {
  const dispatch = useDispatch();
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const splitRatio = useSelector((s: RootState) => s.layout.splitRatio);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const [showTemplates, setShowTemplates] = useState(false);
  const [contextPanel, setContextPanel] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Register all keyboard shortcut handlers (file/edit/tools/sim/etc).
  // Without this, every shortcut in src/shortcuts/defaults.ts is a no-op.
  useKeyboardShortcuts();

  // ─── Divider drag (same logic as old Workspace) ─────────────────────
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

  // ─── Width calculations ─────────────────────────────────────────────
  const get2dWidth = () => {
    if (viewMode === '2d') return '100%';
    if (viewMode === '3d') return '0%';
    return `${splitRatio * 100}%`;
  };
  const get3dWidth = () => {
    if (viewMode === '3d') return '100%';
    if (viewMode === '2d') return '0%';
    return `${(1 - splitRatio) * 100}%`;
  };

  return (
    <div className="app-shell">
      <TopBar
        onOpenTemplates={() => setShowTemplates(true)}
        onOpenPanel={(name) => setContextPanel(prev => prev === name ? null : name)}
      />
      <div ref={canvasRef} className="canvas-area">
        <div
          className="canvas-area__2d"
          style={{ width: get2dWidth(), display: viewMode === '3d' ? 'none' : undefined }}
        >
          <FloatingToolbar />
          <PatternEditor />
        </div>
        {viewMode === 'split' && (
          <div className="canvas-area__divider" onMouseDown={handleDividerMouseDown} />
        )}
        <div
          className="canvas-area__3d"
          style={{ width: get3dWidth(), display: viewMode === '2d' ? 'none' : undefined }}
        >
          <FloatingControls3D />
          <Viewport3DErrorBoundary>
            <Viewport3D activeTool3D={activeTool3D as Tool3D} hideChrome />
          </Viewport3DErrorBoundary>
        </div>
        {contextPanel && (
          <ContextPanel title={contextPanel} onClose={() => setContextPanel(null)}>
            {renderPanelContent(contextPanel, () => setContextPanel(null))}
          </ContextPanel>
        )}
      </div>
      <UnifiedBar
        onOpenTemplates={() => setShowTemplates(true)}
        onOpenPanel={(name) => setContextPanel(prev => prev === name ? null : name)}
      />
      <TemplateLibrary isOpen={showTemplates} onClose={() => setShowTemplates(false)} />
    </div>
  );
}
