import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setViewMode, setActiveTool, toggleSeamAllowance, toggleGrainlines, toggleSnapToGrid, undo, redo } from '../../store/editorSlice';
import { setActiveTool2D, setActiveTool3D } from '../../store/toolSlice';
import { cycleCopilotPosition, setSplitRatio } from '../../store/layoutSlice';
import { loadProject } from '../../store/projectSlice';
import PatternEditor from '../PatternEditor/PatternEditor';
import Viewport3D, { Viewport3DErrorBoundary } from '../Viewport3D/Viewport3D';
import Toolbar2D from '../Toolbar2D/Toolbar2D';
import Toolbar3D from '../Toolbar3D/Toolbar3D';
import AvatarPanel from '../Viewport3D/AvatarPanel';
import TemplateLibrary from '../TemplateLibrary/TemplateLibrary';
import CopilotPanel from '../CopilotPanel/CopilotPanel';
import CopilotSidePanel from '../CopilotPanel/CopilotSidePanel';
import ActivityBar from '../ActivityBar/ActivityBar';
import type { SidebarView } from '../ActivityBar/ActivityBar';
import Sidebar from '../Sidebar/Sidebar';
import CommandPalette from '../CommandPalette/CommandPalette';
import type { Command } from '../CommandPalette/CommandPalette';
import StatusBar from '../StatusBar/StatusBar';
import BottomPanel from '../BottomPanel/BottomPanel';
import ToolOptions from '../ToolOptions/ToolOptions';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { createCopilotKeyHandler } from '../../copilot/keyboardShortcuts';
import { saveToLocalStorage, loadFromLocalStorage } from '../../utils/projectIO';
import { canUndo, canRedo } from '../../store/undoMiddleware';
import { downloadDXF } from '../../utils/exportDXF';
import { downloadPDF } from '../../utils/exportPDF';
import { toolRegistry } from '../../tools';
import MarkerEditor from '../MarkerEditor/MarkerEditor';
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
 * VS Code-style view management:
 * - Both 2D and 3D views are ALWAYS mounted (never unmounted/remounted)
 * - Views resize via CSS width transitions (0% ↔ 50% ↔ 100%)
 * - Three.js WebGL context is preserved across view switches
 * - No phase/fade transitions — just smooth CSS width changes
 */
export default function Workspace() {
  const dispatch = useDispatch();
  const { viewMode } = useSelector((s: RootState) => s.editor);
  const { copilotPosition, splitRatio: layoutSplitRatio } = useSelector((s: RootState) => s.layout);
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

  // ─── 3D Toolbar ───
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const [avatarPanelOpen, setAvatarPanelOpen] = useState(false);

  // ─── Split ratio (draggable divider) ───
  const editorsRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleViewModeChange = useCallback((newMode: '2d' | 'split' | '3d') => {
    if (newMode === viewMode) return;
    dispatch(setViewMode(newMode));
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
  const commands: Command[] = useMemo(() => {
    const toolCommands = toolRegistry.getAllTools().map(tool => ({
      id: `tool-${tool.id}`,
      name: tool.name,
      category: 'Tools',
      shortcut: tool.shortcut?.toUpperCase(),
      action: () => {
        if (tool.context === '2d' || tool.context === 'both') {
          dispatch(setActiveTool(tool.id as any)); // Backward compatibility
          dispatch(setActiveTool2D(tool.id));
        }
        if (tool.context === '3d' || tool.context === 'both') {
          dispatch(setActiveTool3D(tool.id));
        }
      },
    }));

    return [
      ...toolCommands,

    // View
    { id: 'view-2d', name: 'Switch to 2D View', category: 'View', action: () => handleViewModeChange('2d') },
    { id: 'view-split', name: 'Switch to Split View', category: 'View', action: () => handleViewModeChange('split') },
    { id: 'view-3d', name: 'Switch to 3D View', category: 'View', action: () => handleViewModeChange('3d') },
    { id: 'view-sidebar', name: 'Toggle Sidebar', category: 'View', shortcut: '⌘B', action: () => setActiveView(v => v ? null : 'explorer') },
    { id: 'view-panel', name: 'Toggle Bottom Panel', category: 'View', shortcut: '⌘J', action: () => setBottomPanelOpen(v => !v) },
    { id: 'view-copilot-position', name: 'Cycle Copilot Position', category: 'View', action: () => dispatch(cycleCopilotPosition()) },

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
    ];
  }, [dispatch, handleViewModeChange, handleUndo, handleRedo, pieces]);

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

  // VS Code approach: both views always mounted, width controls visibility
  const get2dWidth = () => {
    if (viewMode === '2d') return '100%';
    if (viewMode === '3d') return '0%';
    return `${layoutSplitRatio * 100}%`; // split
  };
  const get3dWidth = () => {
    if (viewMode === '3d') return '100%';
    if (viewMode === '2d') return '0%';
    return `${(1 - layoutSplitRatio) * 100}%`; // split
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
        
        <div className="toolbar-separator" />
        
        {/* Copilot position toggle */}
        <button 
          className="toolbar-btn copilot-position-btn" 
          onClick={() => dispatch(cycleCopilotPosition())}
          title={`Copilot: ${copilotPosition} (click to cycle)`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3H13C13.55 3 14 3.45 14 4V10C14 10.55 13.55 11 13 11H5L2 14V4C2 3.45 2.45 3 3 3Z" fill="none" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>

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
        
        {/* Left copilot panel */}
        {copilotPosition === 'left' && (
          <CopilotSidePanel position="left" />
        )}

        <div className="editor-area">
          {/* Tool Options Bar */}
          <div className="tool-options-wrapper">
            {viewMode !== '3d' && <ToolOptions context="2d" />}
            {viewMode !== '2d' && <ToolOptions context="3d" />}
          </div>
          
          <div className="editors-with-toolbar">
            {/* Toolbar2D floating in 2D viewport area */}
            <div className={`toolbar2d-wrapper ${viewMode !== '3d' ? 'visible' : 'hidden'}`}>
              <Toolbar2D />
            </div>

            {/* Viewports — ALWAYS mounted, sized via CSS width (VS Code pattern) */}
            <div className="editors" ref={editorsRef}>
              <div
                className={`viewport viewport-2d ${viewMode === '3d' ? 'viewport-collapsed' : ''}`}
                style={{ width: get2dWidth() }}
              >
                <div className="viewport-label">PATTERN</div>
                <PatternEditor />
              </div>

              {viewMode === 'split' && (
                <div className="viewport-divider" onMouseDown={handleDividerMouseDown} />
              )}

              <div
                className={`viewport viewport-3d ${viewMode === '2d' ? 'viewport-collapsed' : ''}`}
                style={{ width: get3dWidth() }}
              >
                <div className="viewport-label">3D VIEW</div>
                <div className="viewport3d-with-toolbar">
                  <Viewport3DErrorBoundary>
                    <Viewport3D activeTool3D={activeTool3D as any} />
                  </Viewport3DErrorBoundary>
                  <AvatarPanel open={avatarPanelOpen} onClose={() => setAvatarPanelOpen(false)} />
                  <div className={`toolbar3d-wrapper ${viewMode !== '2d' ? 'visible' : 'hidden'}`}>
                    <Toolbar3D
                      avatarPanelOpen={avatarPanelOpen}
                      onToggleAvatarPanel={() => setAvatarPanelOpen(v => !v)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <BottomPanel
            isOpen={bottomPanelOpen}
            onToggle={() => setBottomPanelOpen(v => !v)}
          />
        </div>
        
        {/* Right copilot panel */}
        {copilotPosition === 'right' && (
          <CopilotSidePanel position="right" />
        )}
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
      <MarkerEditor />
    </div>
  );
}
