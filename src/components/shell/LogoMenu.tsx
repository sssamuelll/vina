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
  { label: 'Proyecto nuevo', shortcut: '⌘N', action: () => {
    if (confirm('¿Crear un proyecto nuevo? Los cambios sin guardar se pierden.')) {
      void clearStorageProject().finally(() => window.location.reload());
    }
  } },
  { separator: true, label: '' },
  { label: 'Importar DXF...', action: () => {} }, // wired via callback (opens file picker)
  { separator: true, label: '' },
  // Fase1-S2: solo exports que EXISTEN. Tech Pack / 3D / Reference Image /
  // Project Settings eran noops o abrían el placeholder circular — un item
  // de menú que miente quema más confianza que uno ausente.
  { label: 'Exportar DXF', action: (d) => runUiExport('dxf', store.getState().project, d) },
  { label: 'Exportar PDF (1:1)', action: (d) => runUiExport('pdf', store.getState().project, d) },
  { label: 'Exportar BOM (CSV)', action: (d) => runUiExport('bom', store.getState().project, d) },
  { label: 'Exportar 3D / Vuelta 360°...', action: (d) => d(openRenderSettings()) },
];

const EDIT_MENU: MenuItem[] = [
  { label: 'Deshacer', shortcut: '⌘Z', action: (d) => d(undo()), disabled: () => !canUndo() },
  { label: 'Rehacer', shortcut: '⌘⇧Z', action: (d) => d(redo()), disabled: () => !canRedo() },
  { separator: true, label: '' },
  // Mismos dispatches que edit.duplicate / edit.delete (useKeyboardShortcuts):
  // el menú pintaba el shortcut pero el item era un noop (Fase1-S2).
  { label: 'Duplicar', shortcut: '⌘D', action: (d) => {
    for (const id of store.getState().editor.selectedPieceIds) d(duplicatePiece(id));
  } },
  { label: 'Eliminar', shortcut: '⌫', action: (d) => {
    const { selectedPieceIds, selectedSeamId } = store.getState().editor;
    if (selectedPieceIds.length > 0) d(removePieces(selectedPieceIds));
    else if (selectedSeamId) d(removeSeam(selectedSeamId));
  } },
  { separator: true, label: '' },
  { label: 'Seleccionar todo', shortcut: '⌘A', action: (d) => { const ids = store.getState().project.pieces.map(p => p.id); d({ type: 'editor/selectAllPieces', payload: ids }); } },
  { label: 'Quitar selección', shortcut: '⌘⇧A', action: (d) => d(clearSelection()) },
];

const VIEW_MENU: MenuItem[] = [
  { label: 'Solo 2D', shortcut: '1', action: (d) => d(setViewMode('2d')) },
  { label: 'Vista dividida', shortcut: '2', action: (d) => d(setViewMode('split')) },
  { label: 'Solo 3D', shortcut: '3', action: (d) => d(setViewMode('3d')) },
  { separator: true, label: '' },
  { label: 'Ajustar zoom al patrón', shortcut: '⌘0', action: (d) => d({ type: 'editor/computeFitView' }) },
  { label: 'Zoom 100%', shortcut: '⌘1', action: (d) => d(setZoom2D(1)) },
  { separator: true, label: '' },
  { label: 'Cuadrícula', shortcut: 'G', action: (d) => d(toggleSnapToGrid()), checked: (s) => s.editor.snapToGrid },
  { label: 'Margen de costura', shortcut: '⇧S', action: (d) => d(toggleSeamAllowance()), checked: (s) => s.editor.showSeamAllowance },
  { label: 'Hilos', action: (d) => d(toggleGrainlines()), checked: (s) => s.editor.showGrainlines },
  { label: 'Nombres de pieza', action: (d) => d(togglePieceNames()), checked: (s) => s.editor.showPieceNames },
  { label: 'Líneas de costura', action: (d) => d(toggleSewingLines()), checked: (s) => s.editor.showSewingLines },
  { label: 'Imágenes de referencia', action: (d) => d(toggleReferenceImages()), checked: (s) => s.editor.showReferenceImages },
  { label: 'Largos de línea', action: (d) => d(toggleLineLengths()), checked: (s) => s.editor.showLineLengths },
  { separator: true, label: '' },
  { label: 'Renderizado: texturizado', action: (d) => d(setRenderMode2D('textured')), checked: (s) => s.editor.renderMode2D === 'textured' },
  { label: 'Renderizado: translúcido', action: (d) => d(setRenderMode2D('translucent')), checked: (s) => s.editor.renderMode2D === 'translucent' },
  { label: 'Renderizado: alambre', action: (d) => d(setRenderMode2D('wireframe')), checked: (s) => s.editor.renderMode2D === 'wireframe' },
  { separator: true, label: '' },
  { label: '3D: prenda', action: (d) => d(toggleGarment()), checked: (s) => s.simulation.showGarment },
  { label: '3D: líneas de costura', action: (d) => d(toggleSeamlines3D()), checked: (s) => s.simulation.showSeamlines3D },
  { label: '3D: costuras en simulación', action: (d) => d(toggleSimSeamLines()), checked: (s) => s.simulation.showSimSeamLines },
  { label: '3D: líneas internas', action: (d) => d(toggleInternalLines3D()), checked: (s) => s.simulation.showInternalLines3D },
  { separator: true, label: '' },
  { label: 'Sugerencias del dock', action: (d) => d(toggleDockSignaling()), checked: (s) => s.dock.signaling === 'subtle' },
  { separator: true, label: '' },
  { label: 'Regla: cm', action: (d) => d(setUnits('cm')), checked: (s) => s.editor.units === 'cm' },
  { label: 'Regla: pulgadas', action: (d) => d(setUnits('inches')), checked: (s) => s.editor.units === 'inches' },
  { label: 'Regla: mm', action: (d) => d(setUnits('mm')), checked: (s) => s.editor.units === 'mm' },
];

// Fase1-S2: Detect All Edges / Validate Pattern / Grade All Sizes / Nesting
// Layout eran noops; Auto-Sew es el único con implementación real.
const PATTERN_MENU: MenuItem[] = [
  { label: 'Coser piezas automáticamente', action: (d) => d(runAutoSew()) },
];

const SIMULATION_MENU: MenuItem[] = [
  { label: 'Vestir avatar', action: (d) => { d(setViewMode3D('simulate')); d(startSimulation()); } },
  { label: 'Iniciar simulación', shortcut: 'Espacio', action: (d) => d(startSimulation()) },
  { label: 'Pausar', action: (d) => d(pauseSimulation()) },
  { label: 'Restablecer', action: (d) => d(resetSimulation()) },
];

// Fase1-S2: AI Provider abría el placeholder circular (la superficie real es
// el modo settings del UnifiedBar); Keyboard Shortcuts era un noop.
const PREFERENCES_MENU: MenuItem[] = [
  { label: 'Avatar y medidas...', action: () => {} }, // wired via onOpenPanel('Avatar')
];

const HELP_MENU: MenuItem[] = [
  { label: 'Documentación', action: () => window.open('https://github.com/sssamuelll/vina', '_blank') },
  { label: 'Reportar un error', action: () => window.open('https://github.com/sssamuelll/vina/issues', '_blank') },
  { separator: true, label: '' },
  { label: 'Acerca de Vina', action: () => alert('Vina v0.11.0\nMotor de diseño cognitivo para ingeniería de moda') },
];

interface TopLevelItem {
  label: string;
  submenu: MenuItem[];
}

const TOP_LEVEL: TopLevelItem[] = [
  { label: 'Archivo', submenu: FILE_MENU },
  { label: 'Edición', submenu: EDIT_MENU },
  { label: 'Vista', submenu: VIEW_MENU },
  { label: 'Patrón', submenu: PATTERN_MENU },
  { label: 'Simulación', submenu: SIMULATION_MENU },
  { separator: true } as unknown as TopLevelItem,
  { label: 'Preferencias', submenu: PREFERENCES_MENU },
  { separator: true } as unknown as TopLevelItem,
  { label: 'Ayuda', submenu: HELP_MENU },
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

    if (item.label === 'Importar DXF...') {
      onImportDXF();
    } else if (item.label === 'Avatar y medidas...') {
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
        onMouseEnter={() => setHoveredSub(hasSubmenu ? item.label : null)}
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
        <span className="logo-menu__logo-text">Vina</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        // El flyout vive en `left: calc(100% + 4px)`: ir del item al submenú
        // cruza una banda de 4px que pertenece al panel, no al item. Cerrar en
        // el mouseleave del *item* convertía esa banda en zona muerta y el
        // submenú se esfumaba a medio camino. Solo salir del panel cierra.
        <div
          className="logo-menu"
          onMouseLeave={() => { setHoveredTop(null); setHoveredSub(null); }}
        >
          {/* Top-level menu items with submenus */}
          {TOP_LEVEL.map((item, i) => {
            if ((item as unknown as { separator?: boolean }).separator) {
              return <div key={`sep-${i}`} className="logo-menu__separator" />;
            }
            return (
              <div
                key={item.label}
                className={`logo-menu__item ${hoveredTop === item.label ? 'logo-menu__item--hovered' : ''}`}
                onMouseEnter={() => { setHoveredTop(item.label); setHoveredSub(null); }}
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
