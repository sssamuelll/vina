import { useState, lazy, Suspense } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import TopBar from './TopBar';
import UnifiedBar from './UnifiedBar';
import FloatingToolbar from './FloatingToolbar';
import FloatingControls3D from './FloatingControls3D';
import PatternEditor from '../PatternEditor/PatternEditor';
import Viewport3D, { Viewport3DErrorBoundary } from '../Viewport3D/Viewport3D';
import TemplateLibrary from '../TemplateLibrary/TemplateLibrary';
import ContextPanel from './ContextPanel';
import type { Tool3D } from '../Toolbar3D/Toolbar3D';

// Lazy-load panel content to avoid importing everything upfront
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

/** Map panel names to their lazy-loaded content */
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
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const [showTemplates, setShowTemplates] = useState(false);
  const [contextPanel, setContextPanel] = useState<string | null>(null);

  return (
    <div className="app-shell">
      <TopBar onOpenTemplates={() => setShowTemplates(true)} onOpenPanel={(name) => setContextPanel(prev => prev === name ? null : name)} />
      <div className={`canvas-area canvas-area--${viewMode}`}>
        <div className="canvas-area__2d">
          <FloatingToolbar />
          <PatternEditor />
        </div>
        {viewMode === 'split' && <div className="canvas-area__divider" />}
        <div className="canvas-area__3d">
          <FloatingControls3D />
          <Viewport3DErrorBoundary>
            <Viewport3D activeTool3D={activeTool3D as Tool3D} hideChrome />
          </Viewport3DErrorBoundary>
        </div>
        {/* Context panel floats over the canvas area */}
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
