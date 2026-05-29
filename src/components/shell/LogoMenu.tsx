import { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  setViewMode, undo, redo, toggleSnapToGrid, toggleSeamAllowance,
  toggleGrainlines, togglePieceNames, toggleSewingLines,
  clearSelection, setZoom2D,
} from '../../store/editorSlice';
import { startSimulation, pauseSimulation, resetSimulation, setViewMode3D } from '../../store/simulationSlice';
import { canUndo, canRedo } from '../../store/undoMiddleware';
import { store } from '../../store';
import { ChevronRight, ChevronDown } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: (dispatch: AppDispatch) => void;
  checked?: (state: RootState) => boolean;
  disabled?: (state: RootState) => boolean;
  separator?: boolean;
  submenu?: MenuItem[];
}

// ─── Submenu Definitions ─────────────────────────────────────────────────────

const FILE_MENU: MenuItem[] = [
  { label: 'New Project', shortcut: '⌘N', action: () => { if (confirm('Create new project? Unsaved changes will be lost.')) window.location.reload(); } },
  { separator: true, label: '' },
  { label: 'Import Seamly2D Pattern...', action: () => {} }, // wired via callback
  { label: 'Import DXF...', action: () => {} }, // wired via callback (opens file picker)
  { label: 'Import Reference Image...', action: () => {} },
  { separator: true, label: '' },
  { label: 'Export DXF', action: () => {} },
  { label: 'Export PDF (1:1)', action: () => {} },
  { label: 'Export Tech Pack', action: () => {} },
  { label: 'Export 3D Model', submenu: [
    { label: 'OBJ', action: () => {} },
    { label: 'glTF / GLB', action: () => {} },
    { label: 'FBX', action: () => {} },
    { label: 'USDZ', action: () => {} },
  ]},
  { label: 'Export BOM (CSV)', action: () => {} },
  { separator: true, label: '' },
  { label: 'Project Settings...', action: () => {} },
];

const EDIT_MENU: MenuItem[] = [
  { label: 'Undo', shortcut: '⌘Z', action: (d) => d(undo()), disabled: () => !canUndo() },
  { label: 'Redo', shortcut: '⌘⇧Z', action: (d) => d(redo()), disabled: () => !canRedo() },
  { separator: true, label: '' },
  { label: 'Duplicate', shortcut: '⌘D', action: () => {} },
  { label: 'Delete', shortcut: '⌫', action: () => {} },
  { separator: true, label: '' },
  { label: 'Select All', shortcut: '⌘A', action: (d) => { const ids = store.getState().project.pieces.map(p => p.id); d({ type: 'editor/selectAllPieces', payload: ids }); } },
  { label: 'Select None', shortcut: '⌘⇧A', action: (d) => d(clearSelection()) },
];

const VIEW_MENU: MenuItem[] = [
  { label: '2D Only', shortcut: '1', action: (d) => d(setViewMode('2d')) },
  { label: 'Split View', shortcut: '2', action: (d) => d(setViewMode('split')) },
  { label: '3D Only', shortcut: '3', action: (d) => d(setViewMode('3d')) },
  { separator: true, label: '' },
  { label: 'Zoom to Fit', shortcut: '⌘0', action: (d) => d({ type: 'editor/computeFitView' }) },
  { label: 'Zoom to 100%', shortcut: '⌘1', action: (d) => d(setZoom2D(1)) },
  { separator: true, label: '' },
  { label: 'Grid', shortcut: 'G', action: (d) => d(toggleSnapToGrid()), checked: (s) => s.editor.snapToGrid },
  { label: 'Seam Allowance', shortcut: '⇧S', action: (d) => d(toggleSeamAllowance()), checked: (s) => s.editor.showSeamAllowance },
  { label: 'Grainlines', action: (d) => d(toggleGrainlines()), checked: (s) => s.editor.showGrainlines },
  { label: 'Piece Names', action: (d) => d(togglePieceNames()), checked: (s) => s.editor.showPieceNames },
  { label: 'Sewing Lines', action: (d) => d(toggleSewingLines()), checked: (s) => s.editor.showSewingLines },
];

const PATTERN_MENU: MenuItem[] = [
  { label: 'Auto-Sew All Pieces', action: () => {} },
  { label: 'Detect All Edges', action: () => {} },
  { label: 'Validate Pattern', action: () => {} },
  { separator: true, label: '' },
  { label: 'Grade All Sizes', action: () => {} },
  { label: 'Nesting Layout', action: () => {} },
];

const SIMULATION_MENU: MenuItem[] = [
  { label: 'Dress Avatar', action: (d) => { d(setViewMode3D('simulate')); d(startSimulation()); } },
  { label: 'Start Simulation', shortcut: 'Space', action: (d) => d(startSimulation()) },
  { label: 'Pause', action: (d) => d(pauseSimulation()) },
  { label: 'Reset', action: (d) => d(resetSimulation()) },
  { separator: true, label: '' },
  { label: 'Simulation Settings...', action: () => {} },
  { label: 'Fabric Library...', action: () => {} },
];

const PREFERENCES_MENU: MenuItem[] = [
  { label: 'AI Provider...', action: () => {} },
  { label: 'Avatar & Measurements...', action: () => {} },
  { separator: true, label: '' },
  { label: 'Keyboard Shortcuts', shortcut: '⌘/', action: () => {} },
];

const HELP_MENU: MenuItem[] = [
  { label: 'Documentation', action: () => window.open('https://github.com/sssamuelll/openclo', '_blank') },
  { label: 'Report a Bug', action: () => window.open('https://github.com/sssamuelll/openclo/issues', '_blank') },
  { separator: true, label: '' },
  { label: 'About OpenClo', action: () => alert('OpenClo v0.7.0\nCognitive Design Engine for Professional Fashion Engineering') },
];

interface TopLevelItem {
  label: string;
  submenu: MenuItem[];
}

const TOP_LEVEL: TopLevelItem[] = [
  { label: 'File', submenu: FILE_MENU },
  { label: 'Edit', submenu: EDIT_MENU },
  { label: 'View', submenu: VIEW_MENU },
  { label: 'Pattern', submenu: PATTERN_MENU },
  { label: 'Simulation', submenu: SIMULATION_MENU },
  { separator: true } as unknown as TopLevelItem,
  { label: 'Preferences', submenu: PREFERENCES_MENU },
  { separator: true } as unknown as TopLevelItem,
  { label: 'Help', submenu: HELP_MENU },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface LogoMenuProps {
  onOpenTemplates?: () => void;
  onOpenPanel?: (name: string) => void;
  onImportDXF?: () => void;
}

export default function LogoMenu({ onOpenTemplates, onOpenPanel, onImportDXF }: LogoMenuProps) {
  const [open, setOpen] = useState(false);
  const [hoveredTop, setHoveredTop] = useState<string | null>(null);
  const [hoveredSub, setHoveredSub] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch<AppDispatch>();
  const state = useSelector((s: RootState) => s);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false); setHoveredTop(null);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setHoveredTop(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const handleItemClick = useCallback((item: MenuItem) => {
    if (item.separator || item.submenu) return;
    if (item.disabled?.(state)) return;

    if (item.label === 'Import Seamly2D Pattern...') {
      onOpenTemplates?.();
    } else if (item.label === 'Import DXF...') {
      onImportDXF?.();
    } else if (item.label.includes('Settings...') || item.label === 'Fabric Library...') {
      onOpenPanel?.(item.label.replace('...', '').trim());
    } else if (item.label === 'AI Provider...') {
      onOpenPanel?.('Settings');
    } else if (item.label === 'Avatar & Measurements...') {
      onOpenPanel?.('Avatar');
    } else if (item.action) {
      item.action(dispatch);
    }

    setOpen(false);
    setHoveredTop(null);
  }, [dispatch, state, onOpenTemplates, onOpenPanel, onImportDXF]);

  const renderMenuItem = (item: MenuItem, index: number) => {
    if (item.separator) {
      return <div key={`sep-${index}`} className="logo-menu__separator" />;
    }

    const isDisabled = item.disabled?.(state);
    const isChecked = item.checked?.(state);
    const hasSubmenu = item.submenu && item.submenu.length > 0;

    return (
      <div
        key={item.label}
        className={`logo-menu__item ${isDisabled ? 'logo-menu__item--disabled' : ''}`}
        onClick={() => !hasSubmenu && handleItemClick(item)}
        onMouseEnter={() => hasSubmenu && setHoveredSub(item.label)}
        onMouseLeave={() => hasSubmenu && setHoveredSub(null)}
      >
        <span className="logo-menu__check">{isChecked ? '✓' : ''}</span>
        <span className="logo-menu__label">{item.label}</span>
        {item.shortcut && <span className="logo-menu__shortcut">{item.shortcut}</span>}
        {hasSubmenu && <ChevronRight size={14} className="logo-menu__chevron" />}
        {hasSubmenu && hoveredSub === item.label && (
          <div className="logo-menu__submenu">
            {item.submenu!.map((sub, si) => renderMenuItem(sub, si))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {/* Logo button with dropdown chevron */}
      <button
        className={`logo-menu__trigger ${open ? 'logo-menu__trigger--active' : ''}`}
        onClick={() => { setOpen(!open); setHoveredTop(null); }}
      >
        <span className="logo-menu__logo-text">OpenClo</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="logo-menu">
          {/* Top-level menu items with submenus */}
          {TOP_LEVEL.map((item, i) => {
            if ((item as unknown as { separator?: boolean }).separator) {
              return <div key={`sep-${i}`} className="logo-menu__separator" />;
            }
            return (
              <div
                key={item.label}
                className={`logo-menu__item ${hoveredTop === item.label ? 'logo-menu__item--hovered' : ''}`}
                onMouseEnter={() => setHoveredTop(item.label)}
                onMouseLeave={() => setHoveredTop(null)}
              >
                <span className="logo-menu__check" />
                <span className="logo-menu__label">{item.label}</span>
                <ChevronRight size={14} className="logo-menu__chevron" />

                {/* Submenu flies out to the right */}
                {hoveredTop === item.label && (
                  <div className="logo-menu__submenu">
                    {item.submenu.map((sub, si) => renderMenuItem(sub, si))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
