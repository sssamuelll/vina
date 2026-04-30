/**
 * @module Workspace
 *
 * Shell-level integration: workspace root that wires global key shortcuts
 * including copilot ones. Import from `src/copilot/keyboardShortcuts` is
 * an explicit shell-feature integration per the **feature ownership** layer
 * policy (CLAUDE.md "Layer policy" + D5 ratification doc).
 */
import { Undo2, Redo2, Plus, MessageSquare, Search } from 'lucide-react';
import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import type { Tool2D } from '../../types/types';
import { setViewMode, setActiveTool, toggleSeamAllowance, toggleGrainlines, toggleSnapToGrid, undo, redo, setZoom2D, setPan2D, computeFitView } from '../../store/editorSlice';
import { setActiveTool2D, setActiveTool3D } from '../../store/toolSlice';
import { cycleCopilotPosition, setSplitRatio, setBottomPanelOpen, toggleBottomPanel, setBottomPanelTab } from '../../store/layoutSlice';
import { loadProject } from '../../store/projectSlice';
import PatternEditor from '../PatternEditor/PatternEditor';
import Viewport3D, { Viewport3DErrorBoundary } from '../Viewport3D/Viewport3D';
import Toolbar2D from '../Toolbar2D/Toolbar2D';
import Toolbar3D, { type Tool3D } from '../Toolbar3D/Toolbar3D';
import ToolOptionsBar from '../Toolbar3D/ToolOptionsBar';
import ToolOptionsBar2D from '../Toolbar2D/ToolOptionsBar2D';
import AvatarPanel from '../Viewport3D/AvatarPanel';
import TemplateLibrary from '../TemplateLibrary/TemplateLibrary';
import CopilotPanel from '../CopilotPanel/CopilotPanel';
import CopilotSidePanel from '../CopilotPanel/CopilotSidePanel';
import ActivityBar from '../ActivityBar/ActivityBar';
import type { SidebarView } from '../ActivityBar/ActivityBar';
import Sidebar from '../Sidebar/Sidebar';
import CommandPalette from '../CommandPalette/CommandPalette';
import ShortcutHelp from '../ShortcutHelp/ShortcutHelp';
import type { Command } from '../CommandPalette/CommandPalette';
import StatusBar from '../StatusBar/StatusBar';
import BottomPanel from '../BottomPanel/BottomPanel';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { createCopilotKeyHandler } from '../../copilot/keyboardShortcuts';
import { saveToStorage, loadFromStorage } from '../../utils/projectIO';
import { garbageCollect } from '../../utils/import/referenceImageStore';
import { canUndo, canRedo } from '../../store/undoMiddleware';
import { downloadDXF } from '../../utils/exportDXF';
import { downloadPDF } from '../../utils/exportPDF';
import { toolRegistry } from '../../tools';
import MarkerEditor from '../MarkerEditor/MarkerEditor';
import CopilotUIOverlay from '../CopilotPanel/CopilotUIOverlay';
import CommandBar from '../CommandBar/CommandBar';
import DisplayBar2D from '../DisplayBar2D/DisplayBar2D';
import DisplayBar3D from '../DisplayBar3D/DisplayBar3D';
import { PanelErrorBoundary } from '../ErrorBoundary/PanelErrorBoundary';
import './Workspace.css';

/**
 * Viewport-adaptive layout hook.
 * Returns size class and adjusts initial layout based on available space.
 * 
 * Breakpoints:
 *   mobile:  < 768px  → chat only
 *   compact: < 1200px → default to 2D view, no split (not enough room)
 *   medium:  < 1600px → split with 40/60 ratio favoring 3D
 *   large:   ≥ 1600px → split with 50/50
 */
type ViewportClass = 'mobile' | 'compact' | 'medium' | 'large';

function useViewportAdaptive() {
  const getClass = useCallback((): ViewportClass => {
    const w = window.innerWidth;
    if (w < 768) return 'mobile';
    if (w < 1200) return 'compact';
    if (w < 1600) return 'medium';
    return 'large';
  }, []);

  const [vpClass, setVpClass] = useState<ViewportClass>(getClass);

  useEffect(() => {
    const onResize = () => setVpClass(getClass());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [getClass]);

  return vpClass;
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
  const vpClass = useViewportAdaptive();
  const isMobile = vpClass === 'mobile';
  useKeyboardShortcuts();

  // ─── Adapt layout to viewport on mount ───
  const hasAdapted = useRef(false);
  useEffect(() => {
    if (hasAdapted.current) return;
    hasAdapted.current = true;
    
    if (vpClass === 'compact') {
      // Small screen: default to 2D, no split
      if (viewMode === 'split') dispatch(setViewMode('2d'));
    } else if (vpClass === 'medium') {
      // Medium: split favoring 3D (40/60)
      dispatch(setSplitRatio(0.4));
    }
    // Large: keep default 50/50 split
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Activity Bar & Sidebar ───
  const [activeView, setActiveView] = useState<SidebarView | null>(null);

  // ─── Layers panel shortcut (Ctrl+Shift+L) ───
  useEffect(() => {
    const handler = () => setActiveView(v => v === 'layers' ? null : 'layers');
    window.addEventListener('openclo:toggleLayersPanel', handler);
    return () => window.removeEventListener('openclo:toggleLayersPanel', handler);
  }, []);

  // ─── Bottom Panel ───
  const bottomPanelOpen = useSelector((s: RootState) => s.layout.bottomPanelOpen);
  const bottomPanelTab = useSelector((s: RootState) => s.layout.bottomPanelTab);

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
  }, [dispatch]);

  useEffect(() => {
    loadFromStorage().then(async result => {
      if (!result) return;
      if (!result.ok) {
        // Corrupt autosave was quarantined inside loadFromStorage. Start with
        // a fresh state instead of crashing on garbage data; the user's
        // pre-corruption blob is preserved under an
        // `openclo-autosave-quarantine-*` key for manual recovery.
        console.error('Autosave parse failed; starting fresh:', result.error);
        return;
      }
      const saved = result.project;
      if (result.warnings.length > 0) {
        console.warn('Autosave parse warnings:', result.warnings);
      }
      dispatch(loadProject(saved));
      // Garbage-collect orphaned IndexedDB image blobs after load
      const activeIds = (saved.referenceImages ?? []).map(i => i.id);
      garbageCollect(activeIds).catch(() => {});
      // Auto-center 2D viewport on loaded pieces
      if (saved.pieces.length > 0) {
        requestAnimationFrame(() => {
          const editor = document.querySelector('.pattern-editor');
          if (editor) {
            const fit = computeFitView(
              saved.pieces,
              editor.clientWidth,
              editor.clientHeight,
            );
            if (fit) {
              dispatch(setZoom2D(fit.zoom));
              dispatch(setPan2D(fit.pan));
            }
          }
        });
      }
    });
  }, [dispatch]);

  // ─── Auto-fit 2D viewport when pieces first appear (template load) ───
  const prevPieceCount = useRef(0);
  useEffect(() => {
    if (prevPieceCount.current === 0 && pieces.length > 0) {
      requestAnimationFrame(() => {
        const editor = document.querySelector('.pattern-editor');
        if (editor) {
          const fit = computeFitView(pieces, editor.clientWidth, editor.clientHeight);
          if (fit) {
            dispatch(setZoom2D(fit.zoom));
            dispatch(setPan2D(fit.pan));
          }
        }
      });
    }
    prevPieceCount.current = pieces.length;
  }, [pieces, dispatch]);

  useEffect(() => {
    // Debounced async save + periodic backup
    const debounce = setTimeout(() => { saveToStorage(project); }, 500);
    const interval = setInterval(() => { saveToStorage(project); }, 30000);
    return () => { clearTimeout(debounce); clearInterval(interval); };
  }, [project]);

  // ─── Copilot Keyboard Shortcuts ───
  useEffect(() => {
    const copilotHandler = createCopilotKeyHandler({
      onFocusInput: () => {
        // Ensure bottom panel is open
        dispatch(setBottomPanelOpen(true));
        // Focus the copilot input after a short delay to ensure DOM is ready
        setTimeout(() => {
          const copilotInput = document.querySelector('.copilot-input') as HTMLInputElement;
          if (copilotInput) {
            copilotInput.focus();
          }
        }, 100);
      },
      onTogglePanel: () => {
        dispatch(toggleBottomPanel());
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
  }, [dispatch]);

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
          dispatch(setActiveTool(tool.id as Tool2D)); // Backward compatibility
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
    { id: 'view-panel', name: 'Toggle Bottom Panel', category: 'View', shortcut: '⌘J', action: () => dispatch(toggleBottomPanel()) },
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
    { id: 'copilot-open', name: 'Open Copilot Panel', category: 'Copilot', action: () => { dispatch(setBottomPanelOpen(true)); } },
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
            <Undo2 size={16} />
          </button>
          <button className="toolbar-btn redo-btn" onClick={handleRedo} disabled={!canRedo()} title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={16} />
          </button>
        </div>
        <div className="toolbar-separator" />
        <button className="toolbar-btn template-btn" onClick={() => setShowTemplates(true)} title="Pattern Templates">
          <Plus size={12} />
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
          <MessageSquare size={16} />
        </button>

        <div className="toolbar-spacer" />

        {/* Command palette trigger */}
        <button
          className="toolbar-btn command-palette-trigger"
          onClick={() => setCommandPaletteOpen(true)}
          title="Command Palette (⌘K)"
        >
          <Search size={16} />
          <span className="command-palette-label">⌘K</span>
        </button>
      </header>

      {/* ─── Body ─── */}
      <div className="workspace-body">
        <ActivityBar activeView={activeView} onViewChange={setActiveView} />
        <Sidebar activeView={activeView} onClose={() => setActiveView(null)} />
        
        {/* Left copilot panel */}
        {copilotPosition === 'left' && (
          <PanelErrorBoundary panelName="Copilot">
            <CopilotSidePanel position="left" />
          </PanelErrorBoundary>
        )}

        <div className="editor-area">
          <div className="editors-with-toolbar">
            {/* Toolbar2D floating in 2D viewport area */}
            <div className={`toolbar2d-wrapper ${viewMode !== '3d' ? 'visible' : 'hidden'}`}>
              <PanelErrorBoundary panelName="2D Toolbar">
                <ToolOptionsBar2D />
                <Toolbar2D />
              </PanelErrorBoundary>
            </div>

            {/* Viewports — ALWAYS mounted, sized via CSS width (VS Code pattern) */}
            <div className="editors" ref={editorsRef}>
              <div
                className={`viewport viewport-2d ${viewMode === '3d' ? 'viewport-collapsed' : ''}`}
                style={{ width: get2dWidth() }}
              >
                <div className="viewport-label">PATTERN</div>
                <PanelErrorBoundary panelName="2D Editor">
                  <PatternEditor />
                </PanelErrorBoundary>
                <DisplayBar2D />
              </div>

              {viewMode === 'split' && (
                <div className="viewport-divider" onMouseDown={handleDividerMouseDown} />
              )}

              <div
                className={`viewport viewport-3d ${viewMode === '2d' ? 'viewport-collapsed' : ''}`}
                style={{ width: get3dWidth() }}
              >
                <div className="viewport-label">3D VIEW</div>
                <DisplayBar3D />
                <div className="viewport3d-with-toolbar">
                  <Viewport3DErrorBoundary>
                    <Viewport3D activeTool3D={activeTool3D as Tool3D} />
                  </Viewport3DErrorBoundary>
                  <AvatarPanel open={avatarPanelOpen} onClose={() => setAvatarPanelOpen(false)} />
                  <PanelErrorBoundary panelName="3D Toolbar">
                    <div className={`toolbar3d-wrapper ${viewMode !== '2d' ? 'visible' : 'hidden'}`}>
                      <Toolbar3D
                        avatarPanelOpen={avatarPanelOpen}
                        onToggleAvatarPanel={() => setAvatarPanelOpen(v => !v)}
                      />
                    </div>
                    <ToolOptionsBar />
                  </PanelErrorBoundary>
                </div>
              </div>
            </div>
          </div>

          <PanelErrorBoundary panelName="Bottom Panel">
            <BottomPanel
              isOpen={bottomPanelOpen}
              onToggle={() => dispatch(toggleBottomPanel())}
              activeTab={bottomPanelTab}
              onTabChange={(tab) => dispatch(setBottomPanelTab(tab))}
            />
          </PanelErrorBoundary>
        </div>
        
        {/* Right copilot panel */}
        {copilotPosition === 'right' && (
          <PanelErrorBoundary panelName="Copilot">
            <CopilotSidePanel position="right" />
          </PanelErrorBoundary>
        )}
      </div>

      {/* ─── Command Bar (AI input) ─── */}
      <CommandBar />

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
      <ShortcutHelp />
      <CopilotUIOverlay />
    </div>
  );
}
