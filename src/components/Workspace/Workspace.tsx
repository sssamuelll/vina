import { useEffect, useCallback, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setViewMode, undo, redo } from '../../store/editorSlice';
import { loadProject } from '../../store/projectSlice';
import PatternEditor from '../PatternEditor/PatternEditor';
import Viewport3D from '../Viewport3D/Viewport3D';
import Toolbar2D from '../Toolbar2D/Toolbar2D';
import PropertiesPanel from '../PropertiesPanel/PropertiesPanel';
import TemplateLibrary from '../TemplateLibrary/TemplateLibrary';
import CopilotPanel from '../CopilotPanel/CopilotPanel';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { saveToLocalStorage, loadFromLocalStorage } from '../../utils/projectIO';
import { canUndo, canRedo } from '../../store/undoMiddleware';
import './Workspace.css';

export default function Workspace() {
  const dispatch = useDispatch();
  const { viewMode } = useSelector((s: RootState) => s.editor);
  const project = useSelector((s: RootState) => s.project);
  const [, forceUpdate] = useState(0);
  const [showTemplates, setShowTemplates] = useState(false);
  useKeyboardShortcuts();

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadFromLocalStorage();
    if (saved) {
      dispatch(loadProject(saved));
    }
  }, [dispatch]);

  // Auto-save every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      saveToLocalStorage(project);
    }, 30000);
    return () => clearInterval(interval);
  }, [project]);

  const handleUndo = useCallback(() => { dispatch(undo()); forceUpdate(n => n + 1); }, [dispatch]);
  const handleRedo = useCallback(() => { dispatch(redo()); forceUpdate(n => n + 1); }, [dispatch]);

  return (
    <div className="workspace">
      {/* Top toolbar */}
      <header className="workspace-toolbar">
        <div className="workspace-logo">OpenClo</div>
        <div className="undo-redo-toolbar" style={{ display: 'flex', gap: 4 }}>
          <button
            className="toolbar-btn"
            onClick={handleUndo}
            disabled={!canUndo()}
            title="Undo (Ctrl+Z)"
            style={{ fontSize: 16, padding: '2px 6px', opacity: canUndo() ? 1 : 0.3 }}
          >↶</button>
          <button
            className="toolbar-btn"
            onClick={handleRedo}
            disabled={!canRedo()}
            title="Redo (Ctrl+Shift+Z)"
            style={{ fontSize: 16, padding: '2px 6px', opacity: canRedo() ? 1 : 0.3 }}
          >↷</button>
        </div>
        <button
          className="toolbar-btn template-btn"
          onClick={() => setShowTemplates(true)}
          title="Pattern Templates"
          style={{ fontSize: 13, padding: '4px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
        >
          + Template
        </button>
        <div className="view-toggle">
          <button
            className={viewMode === '2d' ? 'active' : ''}
            onClick={() => dispatch(setViewMode('2d'))}
          >
            2D
          </button>
          <button
            className={viewMode === 'split' ? 'active' : ''}
            onClick={() => dispatch(setViewMode('split'))}
          >
            Split
          </button>
          <button
            className={viewMode === '3d' ? 'active' : ''}
            onClick={() => dispatch(setViewMode('3d'))}
          >
            3D
          </button>
        </div>
      </header>

      <div className="workspace-body">
        {/* Left: 2D tools */}
        {viewMode !== '3d' && <Toolbar2D />}

        {/* Viewports */}
        <div className="viewports">
          {(viewMode === '2d' || viewMode === 'split') && (
            <div className={`viewport viewport-2d ${viewMode === 'split' ? 'half' : 'full'}`}>
              <div className="viewport-label">PATTERN</div>
              <PatternEditor />
            </div>
          )}
          {viewMode === 'split' && <div className="viewport-divider" />}
          {(viewMode === '3d' || viewMode === 'split') && (
            <div className={`viewport viewport-3d ${viewMode === 'split' ? 'half' : 'full'}`}>
              <div className="viewport-label">3D VIEW</div>
              <Viewport3D />
            </div>
          )}
        </div>

        {/* Right: Properties panel */}
        <PropertiesPanel />
      </div>

      {/* Template Library Modal */}
      <TemplateLibrary isOpen={showTemplates} onClose={() => setShowTemplates(false)} />

      {/* AI Copilot */}
      <CopilotPanel />
    </div>
  );
}
