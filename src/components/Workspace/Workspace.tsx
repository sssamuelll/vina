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
  const [showCopilot, setShowCopilot] = useState(false);
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
        <div className="toolbar-separator" />
        <div className="undo-redo-toolbar">
          <button
            className="toolbar-btn undo-btn"
            onClick={handleUndo}
            disabled={!canUndo()}
            title="Undo (Ctrl+Z)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 7H12C13.105 7 14 7.895 14 9C14 10.105 13.105 11 12 11H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M6.5 4.5L4 7L6.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="toolbar-btn redo-btn"
            onClick={handleRedo}
            disabled={!canRedo()}
            title="Redo (Ctrl+Shift+Z)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 7H4C2.895 7 2 7.895 2 9C2 10.105 2.895 11 4 11H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M9.5 4.5L12 7L9.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="toolbar-separator" />
        <button
          className="toolbar-btn template-btn"
          onClick={() => setShowTemplates(true)}
          title="Pattern Templates"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Templates
        </button>
        <div className="toolbar-separator" />
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

        {/* Main content area */}
        <div className="workspace-main">
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

        {/* Copilot toggle */}
        <div className={`copilot-toggle-bar ${showCopilot ? 'hidden' : ''}`}>
          <button
            className="copilot-toggle-btn"
            onClick={() => setShowCopilot(true)}
            title="AI Copilot (Ctrl+K)"
          >
            AI
          </button>
        </div>

        {/* Copilot column */}
        <div className={`copilot-column ${showCopilot ? 'expanded' : 'collapsed'}`}>
          <CopilotPanel isColumn={true} onClose={() => setShowCopilot(false)} />
        </div>
      </div>

      {/* Template Library Modal */}
      <TemplateLibrary isOpen={showTemplates} onClose={() => setShowTemplates(false)} />
    </div>
  );
}
