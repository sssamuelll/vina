import { useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import TopBar from './TopBar';
import UnifiedBar from './UnifiedBar';
import FloatingToolbar from './FloatingToolbar';
import FloatingControls3D from './FloatingControls3D';
import PatternEditor from '../PatternEditor/PatternEditor';
import Viewport3D, { Viewport3DErrorBoundary } from '../Viewport3D/Viewport3D';
import TemplateLibrary from '../TemplateLibrary/TemplateLibrary';
import type { Tool3D } from '../Toolbar3D/Toolbar3D';

export default function AppShell() {
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const [showTemplates, setShowTemplates] = useState(false);

  return (
    <div className="app-shell">
      <TopBar />
      <div className={`canvas-area canvas-area--${viewMode}`}>
        <div className="canvas-area__2d">
          <FloatingToolbar />
          <PatternEditor />
        </div>
        {viewMode === 'split' && <div className="canvas-area__divider" />}
        <div className="canvas-area__3d">
          <FloatingControls3D />
          <Viewport3DErrorBoundary>
            <Viewport3D activeTool3D={activeTool3D as Tool3D} />
          </Viewport3DErrorBoundary>
        </div>
      </div>
      <UnifiedBar />
      <TemplateLibrary isOpen={showTemplates} onClose={() => setShowTemplates(false)} />
    </div>
  );
}
