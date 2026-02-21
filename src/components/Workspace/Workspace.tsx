import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setViewMode, setActiveTool, toggleSeamAllowance, toggleGrainlines, toggleSnapToGrid, undo, redo } from '../../store/editorSlice';
import { loadProject } from '../../store/projectSlice';
import PatternEditor from '../PatternEditor/PatternEditor';
import Viewport3D, { Viewport3DErrorBoundary } from '../Viewport3D/Viewport3D';
import Toolbar2D from '../Toolbar2D/Toolbar2D';
import TemplateLibrary from '../TemplateLibrary/TemplateLibrary';
import CopilotPanel from '../CopilotPanel/CopilotPanel';
import ActivityBar from '../ActivityBar/ActivityBar';
import type { SidebarView } from '../ActivityBar/ActivityBar';
import Sidebar from '../Sidebar/Sidebar';
import CommandPalette from '../CommandPalette/CommandPalette';
import type { Command } from '../CommandPalette/CommandPalette';
import StatusBar from '../StatusBar/StatusBar';
import BottomPanel from '../BottomPanel/BottomPanel';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { createCopilotKeyHandler } from '../../copilot/keyboardShortcuts';
import { saveToLocalStorage, loadFromLocalStorage } from '../../utils/projectIO';
import { canUndo, canRedo } from '../../store/undoMiddleware';
import { downloadDXF } from '../../utils/exportDXF';
import { downloadPDF } from '../../utils/exportPDF';
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

/**
 * Sequenced view transition:
 *   1. Fade out 3D (300ms)
 *   2. Wait until fade complete
 *   3. Change layout (viewMode)
 *   4. Wait for Three.js to recalculate (150ms)
 *   5. Fade in 3D (300ms)
 */
type TransitionPhase = 'idle' | 'fading-out' | 'switching' | 'resizing' | 'fading-in';

export default function Workspace() {
  const dispatch = useDispatch();
  const { viewMode } = useSelector((s: RootState) => s.editor);
  const project = useSelector((s: RootState) => s.project);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const [, forceUpdate] = useState(0);
  const [showTemplates, setShowTemplates] = useState(false);
  const isMobile = useIsMobile();
  useKeyboardShortcuts();

  // ─── Activity Bar & Sidebar ───
  const [activeView, setActiveView] = useState<SidebarView | null>('explorer');

  // ─── Bottom Panel ───
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);

  // ─── Command Palette ───
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // ─── Split ratio (draggable divider) ───
  const [splitRatio, setSplitRatio] = useState(0.5);
  const editorsRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // ─── Sequenced 3D transition ───
  const [phase, setPhase] = useState<TransitionPhase>('idle');
  const [pendingMode, setPendingMode] = useState<'2d' | 'split' | '3d' | null>(null);

  const handleViewModeChange = useCallback((newMode: '2d' | 'split' | '3d') => {
    if (newMode === viewMode || phase !== 'idle') return;

    const has3dNow = viewMode === '3d' || viewMode === 'split';
    const will3d = newMode === '3d' || newMode === 'split';

    if (has3dNow || will3d) {
      setPendingMode(newMode);
      setPhase('fading-out');
    } else {
      dispatch(setViewMode(newMode));
    }
  }, [viewMode, phase, dispatch]);

  useEffect(() => {
    if (phase === 'fading-out') {
      const t = setTimeout(() => setPhase('switching'), 320);
      return () => clearTimeout(t);
    }
    if (phase === 'switching' && pendingMode) {
      dispatch(setViewMode(pendingMode));
      const t = setTimeout(() => setPhase('resizing'), 20);
      return () => clearTimeout(t);
    }
    if (phase === 'resizing') {
      const t = setTimeout(() => setPhase('fading-in'), 750);
      return () => clearTimeout(t);
    }
    if (phase === 'fading-in') {
      const t = setTimeout(() => {
        setPhase('idle');
        setPendingMode(null);
      }, 320);
      return () => clearTimeout(t);
    }
  }, [phase, pendingMode, dispatch]);

  const show3d = phase === 'idle' || phase === 'fading-in';

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
    // Debounced save on every change + periodic backup
    const debounce = setTimeout(() => saveToLocalStorage(project), 500);
    const interval = setInterval(() => saveToLocalStorage(project), 30000);
    return () => { clearTimeout(debounce); clearInterval(interval); };
  }, [project]);

  // ─── Copilot Keyboard Shortcuts ───
  useEffect(() => {
    const copilotHandler = createCopilotKeyHandler({
      onFocusInput: () => {
        // Open bottom panel and set to copilot tab if not already open
        if (!bottomPanelOpen) {
          setBottomPanelOpen(true);
        }
        // Focus the copilot input after a short delay to ensure DOM is ready
        setTimeout(() => {
          const copilotInput = document.querySelector('.copilot-input') as HTMLInputElement;
          if (copilotInput) {
            copilotInput.focus();
          }
        }, 100);
      },
      onTogglePanel: () => {
        setBottomPanelOpen(prev => !prev);
      },
      onBlurInput: () => {
        const copilotInput = document.querySelector('.copilot-input') as HTMLInputElement;
        if (copilotInput) {
          copilotInput.blur();
        }
      },
    });

    document.addEventListener('keydown', copilotHandler);
    return () => document.removeEventListener('keydown', copilotHandler);
  }, [bottomPanelOpen]);

  const handleUndo = useCallback(() => { dispatch(undo()); forceUpdate(n => n + 1); }, [dispatch]);
  const handleRedo = useCallback(() => { dispatch(redo()); forceUpdate(n => n + 1); }, [dispatch]);

  // ─── Command Palette keyboard shortcut ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ⌘K (Mac) or Ctrl+Shift+P
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(v => !v);
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setCommandPaletteOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── Command list for palette ───
  const commands: Command[] = useMemo(() => [
    // Tools
    { id: 'tool-select', name: 'Select Tool', category: 'Tools', shortcut: 'V', action: () => dispatch(setActiveTool('select')) },
    { id: 'tool-pen', name: 'Pen Tool', category: 'Tools', shortcut: 'P', action: () => dispatch(setActiveTool('pen')) },
    { id: 'tool-line', name: 'Line Tool', category: 'Tools', shortcut: 'L', action: () => dispatch(setActiveTool('line')) },
    { id: 'tool-rectangle', name: 'Rectangle Tool', category: 'Tools', shortcut: 'R', action: () => dispatch(setActiveTool('rectangle')) },
    { id: 'tool-seam', name: 'Seam Tool', category: 'Tools', shortcut: 'S', action: () => dispatch(setActiveTool('seam')) },
    { id: 'tool-notch', name: 'Notch Tool', category: 'Tools', shortcut: 'N', action: () => dispatch(setActiveTool('notch')) },
    { id: 'tool-grainline', name: 'Grainline Tool', category: 'Tools', shortcut: 'G', action: () => dispatch(setActiveTool('grainline')) },
    { id: 'tool-measure', name: 'Measure Tool', category: 'Tools', shortcut: 'M', action: () => dispatch(setActiveTool('measure')) },
    { id: 'tool-hand', name: 'Hand Tool', category: 'Tools', shortcut: 'H', action: () => dispatch(setActiveTool('hand')) },

    // View
    { id: 'view-2d', name: 'Switch to 2D View', category: 'View', action: () => handleViewModeChange('2d') },
    { id: 'view-split', name: 'Switch to Split View', category: 'View', action: () => handleViewModeChange('split') },
    { id: 'view-3d', name: 'Switch to 3D View', category: 'View', action: () => handleViewModeChange('3d') },
    { id: 'view-sidebar', name: 'Toggle Sidebar', category: 'View', shortcut: '⌘B', action: () => setActiveView(v => v ? null : 'explorer') },
    { id: 'view-panel', name: 'Toggle Bottom Panel', category: 'View', shortcut: '⌘J', action: () => setBottomPanelOpen(v => !v) },

    // File
    { id: 'file-templates', name: 'Add Template', category: 'File', action: () => setShowTemplates(true) },
    { id: 'file-export-dxf', name: 'Export DXF', category: 'File', action: () => { if (pieces.length > 0) downloadDXF(pieces); } },
    { id: 'file-export-pdf', name: 'Export PDF', category: 'File', action: () => { if (pieces.length > 0) downloadPDF(pieces); } },

    // Edit
    { id: 'edit-undo', name: 'Undo', category: 'Edit', shortcut: '⌘Z', action: handleUndo },
    { id: 'edit-redo', name: 'Redo', category: 'Edit', shortcut: '⌘⇧Z', action: handleRedo },

    // Pattern
    { id: 'pattern-sa-toggle', name: 'Toggle Seam Allowance', category: 'Pattern', action: () => dispatch(toggleSeamAllowance()) },
    { id: 'pattern-grainline-toggle', name: 'Toggle Grainlines', category: 'Pattern', action: () => dispatch(toggleGrainlines()) },
    { id: 'pattern-grid-toggle', name: 'Toggle Snap to Grid', category: 'Pattern', action: () => dispatch(toggleSnapToGrid()) },

    // Copilot
    { id: 'copilot-open', name: 'Open Copilot Panel', category: 'Copilot', action: () => { setBottomPanelOpen(true); } },
  ], [dispatch, handleViewModeChange, handleUndo, handleRedo, pieces]);

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

  // Explicit widths so CSS can transition between states
  const getViewportWidth = (which: '2d' | '3d') => {
    if (viewMode === 'split') {
      return which === '2d' ? `${splitRatio * 100}%` : `${(1 - splitRatio) * 100}%`;
    }
    if (viewMode === '2d') return which === '2d' ? '100%' : '0%';
    if (viewMode === '3d') return which === '2d' ? '0%' : '100%';
    return '0%';
  };

  return (
    <div className="workspace">
      {/* ─── Title Bar ─── */}
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

        <div className="toolbar-spacer" />

        {/* Command palette trigger */}
        <button
          className="toolbar-btn command-palette-trigger"
          onClick={() => setCommandPaletteOpen(true)}
          title="Command Palette (⌘K)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span className="command-palette-label">⌘K</span>
        </button>
      </header>

      {/* ─── Body ─── */}
      <div className="workspace-body">
        <ActivityBar activeView={activeView} onViewChange={setActiveView} />
        <Sidebar activeView={activeView} onClose={() => setActiveView(null)} />

        <div className="editor-area">
          <div className="editors-with-toolbar">
            {/* Toolbar2D floating in 2D viewport area */}
            <div className={`toolbar2d-wrapper ${viewMode !== '3d' ? 'visible' : 'hidden'}`}>
              <Toolbar2D />
            </div>

            {/* Viewports */}
            <div className="editors" ref={editorsRef}>
              <div
                className={`viewport viewport-2d ${viewMode === '2d' || viewMode === 'split' ? '' : 'hidden-viewport'}`}
                style={{ width: getViewportWidth('2d') }}
              >
                <div className="viewport-label">PATTERN</div>
                <PatternEditor />
              </div>

              {viewMode === 'split' && (
                <div className="viewport-divider" onMouseDown={handleDividerMouseDown} />
              )}

              <div
                className={`viewport viewport-3d ${viewMode === '3d' || viewMode === 'split' ? '' : 'hidden-viewport'}`}
                style={{ width: getViewportWidth('3d') }}
              >
                <div className="viewport-label">3D VIEW</div>
                <div className={`viewport-3d-content ${show3d ? 'visible' : 'hidden'}`}>
                  <Viewport3DErrorBoundary><Viewport3D /></Viewport3DErrorBoundary>
                </div>
              </div>
            </div>
          </div>

          <BottomPanel
            isOpen={bottomPanelOpen}
            onToggle={() => setBottomPanelOpen(v => !v)}
          />
        </div>
      </div>

      {/* ─── Status Bar ─── */}
      <StatusBar />

      {/* ─── Overlays ─── */}
      <CommandPalette
        commands={commands}
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
      <TemplateLibrary isOpen={showTemplates} onClose={() => setShowTemplates(false)} />
    </div>
  );
}
