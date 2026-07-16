import { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  setViewMode, undo, redo, toggleSnapToGrid, toggleSeamAllowance,
  toggleGrainlines, togglePieceNames, toggleSewingLines,
  toggleReferenceImages, toggleLineLengths, setRenderMode2D,
  clearSelection, setZoom2D, setUnits,
} from '../../store/editorSlice';
import {
  startSimulation, pauseSimulation, resetSimulation, setViewMode3D,
  toggleGarment, toggleSeamlines3D, toggleSimSeamLines, toggleInternalLines3D,
} from '../../store/simulationSlice';
import { toggleDockSignaling } from '../../store/dockSlice';
import { duplicatePiece, removePieces, removeSeam } from '../../store/projectSlice';
import { runAutoSew } from '../../store/autoSewThunk';
import { openRenderSettings } from '../../store/renderSettingsThunk';
import { canUndo, canRedo } from '../../store/undoMiddleware';
import { store } from '../../store';
import { runUiExport } from '../../utils/export/uiExport';
import { clearStorageProject } from '../../utils/projectIO';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { displayShortcut } from './shortcutDisplay';

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
  // New Project must clear the IDB autosave BEFORE reloading — otherwise boot
  // hydration (projectAutosave) restores the project the user just abandoned.
  { label: 'New Project', shortcut: '⌘N', action: () => {
    if (confirm('Create new project? Unsaved changes will be lost.')) {
      void clearStorageProject().finally(() => window.location.reload());
    }
  } },
  { separator: true, label: '' },
  { label: 'Import DXF...', action: () => {} }, // wired via callback (opens file picker)
  { separator: true, label: '' },
  // Fase1-S2: solo exports que EXISTEN. Tech Pack / 3D / Reference Image /
  // Project Settings eran noops o abrían el placeholder circular — un item
  // de menú que miente quema más confianza que uno ausente.
  { label: 'Export DXF', action: (d) => runUiExport('dxf', store.getState().project, d) },
  { label: 'Export PDF (1:1)', action: (d) => runUiExport('pdf', store.getState().project, d) },
  { label: 'Export BOM (CSV)', action: (d) => runUiExport('bom', store.getState().project, d) },
  { label: 'Export 3D / Turntable...', action: (d) => d(openRenderSettings()) },
];

const EDIT_MENU: MenuItem[] = [
  { label: 'Undo', shortcut: '⌘Z', action: (d) => d(undo()), disabled: () => !canUndo() },
  { label: 'Redo', shortcut: '⌘⇧Z', action: (d) => d(redo()), disabled: () => !canRedo() },
  { separator: true, label: '' },
  // Mismos dispatches que edit.duplicate / edit.delete (useKeyboardShortcuts):
  // el menú pintaba el shortcut pero el item era un noop (Fase1-S2).
  { label: 'Duplicate', shortcut: '⌘D', action: (d) => {
    for (const id of store.getState().editor.selectedPieceIds) d(duplicatePiece(id));
  } },
  { label: 'Delete', shortcut: '⌫', action: (d) => {
    const { selectedPieceIds, selectedSeamId } = store.getState().editor;
    if (selectedPieceIds.length > 0) d(removePieces(selectedPieceIds));
    else if (selectedSeamId) d(removeSeam(selectedSeamId));
  } },
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
  { label: 'Reference Images', action: (d) => d(toggleReferenceImages()), checked: (s) => s.editor.showReferenceImages },
  { label: 'Line Lengths', action: (d) => d(toggleLineLengths()), checked: (s) => s.editor.showLineLengths },
  { separator: true, label: '' },
  { label: 'Render: Textured', action: (d) => d(setRenderMode2D('textured')), checked: (s) => s.editor.renderMode2D === 'textured' },
  { label: 'Render: Translucent', action: (d) => d(setRenderMode2D('translucent')), checked: (s) => s.editor.renderMode2D === 'translucent' },
  { label: 'Render: Wireframe', action: (d) => d(setRenderMode2D('wireframe')), checked: (s) => s.editor.renderMode2D === 'wireframe' },
  { separator: true, label: '' },
  { label: '3D: Garment', action: (d) => d(toggleGarment()), checked: (s) => s.simulation.showGarment },
  { label: '3D: Seamlines', action: (d) => d(toggleSeamlines3D()), checked: (s) => s.simulation.showSeamlines3D },
  { label: '3D: Seamlines en sim', action: (d) => d(toggleSimSeamLines()), checked: (s) => s.simulation.showSimSeamLines },
  { label: '3D: Internal Lines', action: (d) => d(toggleInternalLines3D()), checked: (s) => s.simulation.showInternalLines3D },
  { separator: true, label: '' },
  { label: 'Dock Suggestions', action: (d) => d(toggleDockSignaling()), checked: (s) => s.dock.signaling === 'subtle' },
  { separator: true, label: '' },
  { label: 'Ruler: cm', action: (d) => d(setUnits('cm')), checked: (s) => s.editor.units === 'cm' },
  { label: 'Ruler: inches', action: (d) => d(setUnits('inches')), checked: (s) => s.editor.units === 'inches' },
  { label: 'Ruler: mm', action: (d) => d(setUnits('mm')), checked: (s) => s.editor.units === 'mm' },
];

// Fase1-S2: Detect All Edges / Validate Pattern / Grade All Sizes / Nesting
// Layout eran noops; Auto-Sew es el único con implementación real.
const PATTERN_MENU: MenuItem[] = [
  { label: 'Auto-Sew All Pieces', action: (d) => d(runAutoSew()) },
];

const SIMULATION_MENU: MenuItem[] = [
  { label: 'Dress Avatar', action: (d) => { d(setViewMode3D('simulate')); d(startSimulation()); } },
  { label: 'Start Simulation', shortcut: 'Space', action: (d) => d(startSimulation()) },
  { label: 'Pause', action: (d) => d(pauseSimulation()) },
  { label: 'Reset', action: (d) => d(resetSimulation()) },
];

// Fase1-S2: AI Provider abría el placeholder circular (la superficie real es
// el modo settings del UnifiedBar); Keyboard Shortcuts era un noop.
const PREFERENCES_MENU: MenuItem[] = [
  { label: 'Avatar & Measurements...', action: () => {} }, // wired via onOpenPanel('Avatar')
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
  onOpenPanel: (name: string) => void;
  onImportDXF: () => void;
}

export default function LogoMenu({ onOpenPanel, onImportDXF }: LogoMenuProps) {
  const [open, setOpen] = useState(false);
  const [hoveredTop, setHoveredTop] = useState<string | null>(null);
  const [hoveredSub, setHoveredSub] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch<AppDispatch>();
  // Suscripción solo con el menú abierto: cerrado devuelve null estable
  // (sin re-render por cada cambio del store). checked/disabled solo se
  // evalúan con el menú visible (Fase 2 — warning de selector root-state).
  const state = useSelector((s: RootState) => (open ? s : null));

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
    if (item.disabled?.(store.getState())) return;

    if (item.label === 'Import DXF...') {
      onImportDXF();
    } else if (item.label === 'Avatar & Measurements...') {
      onOpenPanel('Avatar');
    } else if (item.action) {
      item.action(dispatch);
    }

    setOpen(false);
    setHoveredTop(null);
  }, [dispatch, onOpenPanel, onImportDXF]);

  const renderMenuItem = (item: MenuItem, index: number) => {
    if (item.separator) {
      return <div key={`sep-${index}`} className="logo-menu__separator" />;
    }

    const isDisabled = state ? item.disabled?.(state) : false;
    const isChecked = state ? item.checked?.(state) : false;
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
        {item.shortcut && <span className="logo-menu__shortcut">{displayShortcut(item.shortcut)}</span>}
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
