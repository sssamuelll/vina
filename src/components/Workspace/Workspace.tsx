import { useEffect, useCallback, useState, useRef } from 'react';
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

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}

export default function Workspace() {
  const dispatch = useDispatch();
  const { viewMode } = useSelector((s: RootState) => s.editor);
  const project = useSelector((s: RootState) => s.project);
  const [, forceUpdate] = useState(0);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCopilot, setShowCopilot] = useState(false);
  const isMobile = useIsMobile();
  useKeyboardShortcuts();

  // ─── Split ratio (draggable divider) ───
  const [splitRatio, setSplitRatio] = useState(0.5); // 0..1, fraction for 2D
  const editorsRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // ─── Sequenced view mode transitions: hide 3D → change layout → show 3D ───
  const [viewport3dVisible, setViewport3dVisible] = useState(true);
  const transitioningRef = useRef(false);

  const handleViewModeChange = useCallback((newMode: '2d' | 'split' | '3d') => {
    if (newMode === viewMode || transitioningRef.current) return;

    const involves3d = viewMode !== '2d' || newMode !== '2d';
    if (!involves3d) {
      dispatch(setViewMode(newMode));
      return;
    }

    transitioningRef.current = true;
    // Step 1: hide 3D
    setViewport3dVisible(false);

    // Step 2: after fade out completes, change layout
    setTimeout(() => {
      dispatch(setViewMode(newMode));

      // Step 3: after layout settles, show 3D
      setTimeout(() => {
        setViewport3dVisible(true);
        transitioningRef.current = false;
      }, 100);
    }, 180);
  }, [viewMode, dispatch]);

  // ─── Divider drag handlers ───
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !editorsRef.current) return;
      const rect = editorsRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const ratio = Math.max(0.15, Math.min(0.85, x / rect.width));
      setSplitRatio(ratio);
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
  }, []);

  useEffect(() => {
    const saved = loadFromLocalStorage();
    if (saved) dispatch(loadProject(saved));
  }, [dispatch]);

  useEffect(() => {
    const interval = setInterval(() => saveToLocalStorage(project), 30000);
    return () => clearInterval(interval);
  }, [project]);

  const handleUndo = useCallback(() => { dispatch(undo()); forceUpdate(n => n + 1); }, [dispatch]);
  const handleRedo = useCallback(() => { dispatch(redo()); forceUpdate(n => n + 1); }, [dispatch]);

  // Ctrl+K to toggle copilot
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCopilot(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (isMobile) {
    return (
      <div className="workspace mobile">
        <header className="workspace-toolbar mobile-toolbar">
          <div className="workspace-logo">OpenClo</div>
        </header>
        <div className="mobile-chat">
          <CopilotPanel isColumn={true} />
        </div>
      </div>
    );
  }

  // Calculate viewport styles for split mode
  const splitStyle2D = viewMode === 'split' ? { width: `${splitRatio * 100}%` } : undefined;
  const splitStyle3D = viewMode === 'split' ? { width: `${(1 - splitRatio) * 100}%` } : undefined;

  return (
    <div className="workspace">
      {/* ─── Top Toolbar ─── */}
      <header className="workspace-toolbar">
        <div className="workspace-logo">OpenClo</div>
        <div className="toolbar-separator" />
        <div className="undo-redo-toolbar">
          <button className="toolbar-btn undo-btn" onClick={handleUndo} disabled={!canUndo()} title="Undo (Ctrl+Z)">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 7H12C13.1 7 14 7.9 14 9C14 10.1 13.1 11 12 11H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M6.5 4.5L4 7L6.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="toolbar-btn redo-btn" onClick={handleRedo} disabled={!canRedo()} title="Redo (Ctrl+Shift+Z)">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 7H4C2.9 7 2 7.9 2 9C2 10.1 2.9 11 4 11H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M9.5 4.5L12 7L9.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="toolbar-separator" />
        <button className="toolbar-btn template-btn" onClick={() => setShowTemplates(true)} title="Pattern Templates">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Templates
        </button>
        <div className="toolbar-separator" />
        <div className="view-toggle">
          {(['2d', 'split', '3d'] as const).map(v => (
            <button key={v} className={viewMode === v ? 'active' : ''} onClick={() => handleViewModeChange(v)}>
              {v === '2d' ? '2D' : v === 'split' ? 'Split' : '3D'}
            </button>
          ))}
        </div>

        {/* Right side of toolbar */}
        <div className="toolbar-spacer" />
        <button
          className={`toolbar-btn copilot-toolbar-btn ${showCopilot ? 'active' : ''}`}
          onClick={() => setShowCopilot(v => !v)}
          title="Chat (Ctrl+K)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3H13C13.55 3 14 3.45 14 4V10C14 10.55 13.55 11 13 11H5L2 14V4C2 3.45 2.45 3 3 3Z" stroke="currentColor" strokeWidth="1.2" fill={showCopilot ? 'currentColor' : 'none'}/>
          </svg>
          Chat
        </button>
      </header>

      {/* ─── Body: Activity Bar | Editors | Properties | Copilot ─── */}
      <div className="workspace-body">
        {/* Activity Bar (left tools) — always in DOM, animated */}
        <div className={`toolbar2d-wrapper ${viewMode !== '3d' ? 'visible' : 'hidden'}`}>
          <Toolbar2D />
        </div>

        {/* Editors (viewports) with draggable divider */}
        <div className="editors" ref={editorsRef}>
          {(viewMode === '2d' || viewMode === 'split') && (
            <div
              className={`viewport viewport-2d ${viewMode === 'split' ? 'half' : 'full'}`}
              style={splitStyle2D}
            >
              <div className="viewport-label">PATTERN</div>
              <PatternEditor />
            </div>
          )}
          {viewMode === 'split' && (
            <div
              className="viewport-divider"
              onMouseDown={handleDividerMouseDown}
            />
          )}
          {(viewMode === '3d' || viewMode === 'split') && (
            <div
              className={`viewport viewport-3d ${viewMode === 'split' ? 'half' : 'full'}`}
              style={splitStyle3D}
            >
              <div className="viewport-label">3D VIEW</div>
              <div
                className="viewport-3d-content"
                style={{
                  opacity: viewport3dVisible ? 1 : 0,
                  transition: viewport3dVisible ? 'opacity 0.2s ease' : 'opacity 0.12s ease',
                  width: '100%',
                  height: '100%',
                }}
              >
                <Viewport3D />
              </div>
            </div>
          )}
        </div>

        {/* Properties Panel (right sidebar) */}
        <PropertiesPanel />

        {/* Copilot Panel (far right, toggleable) — always in DOM */}
        <div className={`copilot-column ${showCopilot ? 'open' : 'closed'}`}>
          <CopilotPanel isColumn={true} onClose={() => setShowCopilot(false)} />
        </div>
      </div>

      <TemplateLibrary isOpen={showTemplates} onClose={() => setShowTemplates(false)} />
    </div>
  );
}
