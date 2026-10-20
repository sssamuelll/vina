/**
 * Command catalog for the ⌘K UnifiedBar command mode. Plain module (no JSX)
 * so contract tests can import COMMANDS without rendering, and the component
 * file stays fast-refresh-clean.
 */
import type { AppDispatch } from '../../store';
import { store } from '../../store';
import { runUiExport } from '../../utils/export/uiExport';
import { setViewMode, toggleSeamAllowance, toggleGrainlines, togglePieceNames, undo, redo } from '../../store/editorSlice';
import { startSimulation, resetSimulation, setViewMode3D } from '../../store/simulationSlice';
import {
  FileText, Scissors, Ruler, Shirt, Download, Eye,
  Layers, ScanLine, Undo2, Redo2, User, Package,
  Search, PenLine, Tag, Hand, MousePointer2,
  SlidersHorizontal, Settings, Plug, type LucideIcon,
} from 'lucide-react';
import { conectarTuAgente, desconectarTuAgente } from '../../copilot/puente/puenteDeLaApp';
import { setUserScheme } from '../../store/inputSchemeSlice';
import { runAutoSew } from '../../store/autoSewThunk';
import { openRenderSettings } from '../../store/renderSettingsThunk';

/** Orden de render de los grupos de la palette (Fase 3 — carga cognitiva). */
export const COMMAND_CATEGORIES = ['Acciones', 'Paneles', 'Exportar', 'Vista', 'Edición'] as const;
export type CommandCategory = (typeof COMMAND_CATEGORIES)[number];

export interface CommandDef {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: CommandCategory;
  /** Id de la acción en `defaults.ts`; el rótulo se deriva (#1170). */
  shortcutId?: string;
  action: (dispatch: AppDispatch, callbacks: CommandCallbacks) => void;
}

export interface CommandCallbacks {
  onOpenPanel: (name: string) => void;
}

export const COMMANDS: CommandDef[] = [
  // ─── Patterns ───
  // M3 (camisa de María): execute for real — the old action opened the
  // 'Auto-Sew' panel name, which AppShell renders as a dead placeholder.
  { id: 'auto-sew', category: 'Acciones', name: 'Coser piezas automáticamente', description: 'Detecta y propone las costuras', icon: Scissors, action: (d) => d(runAutoSew()) },

  // ─── Simulation ───
  { id: 'dress-avatar', category: 'Acciones', name: 'Vestir avatar', description: 'Coloca las piezas y arranca la simulación', icon: Shirt, action: (d) => { d(setViewMode3D('simulate')); d(startSimulation()); } },
  { id: 'reset-sim', category: 'Acciones', name: 'Restablecer simulación', description: 'Detiene la simulación y vuelve al inicio', icon: Shirt, action: (d) => d(resetSimulation()) },

  // ─── Tu agente (spec 2026-10-09) ───
  { id: 'conectar-tu-agente', category: 'Acciones', name: 'Conectar tu agente', description: 'Deja que Claude Code, Claude Desktop o Cursor trabajen en este patrón', icon: Plug, action: () => conectarTuAgente() },
  { id: 'desconectar-tu-agente', category: 'Acciones', name: 'Desconectar tu agente', description: 'Tu agente deja de ver y cambiar este patrón', icon: Plug, action: () => desconectarTuAgente() },

  // ─── Panels ───
  { id: 'show-avatar', category: 'Paneles', name: 'Avatar y medidas', description: 'Medidas corporales, pose y modelo del avatar', icon: User, action: (_d, cb) => cb.onOpenPanel('Avatar') },
  { id: 'show-bom', category: 'Paneles', name: 'Lista de materiales (BOM)', description: 'Telas, avíos y costos', icon: Package, action: (_d, cb) => cb.onOpenPanel('BOM') },
  { id: 'show-grading', category: 'Paneles', name: 'Escalado', description: 'Tabla de tallas (XS–XXL)', icon: Ruler, action: (_d, cb) => cb.onOpenPanel('Grading') },
  { id: 'show-inspector', category: 'Paneles', name: 'Inspector', description: 'Diagnóstico y validación de piezas', icon: Search, action: (_d, cb) => cb.onOpenPanel('Inspector') },
  // Fase1-S2: show-problems / show-simulation / show-colorways / export-techpack
  // eliminados — abrían el placeholder circular "available via ⌘K" (el panel
  // no existe en AppShell.renderPanelContent). Vuelven cuando exista el panel.
  { id: 'show-nesting', category: 'Paneles', name: 'Marcada', description: 'Distribución de piezas en la tela (nesting)', icon: Layers, action: (_d, cb) => cb.onOpenPanel('Nesting') },
  { id: 'show-layers', category: 'Paneles', name: 'Capas', description: 'Capas de piezas', icon: Layers, action: (_d, cb) => cb.onOpenPanel('Layers') },
  { id: 'show-properties', category: 'Paneles', name: 'Propiedades', description: 'Pieza, costura y materiales', icon: SlidersHorizontal, action: (_d, cb) => cb.onOpenPanel('Properties') },
  { id: 'show-preferences', category: 'Paneles', name: 'IA y ratón', description: 'Conexiones de IA, idioma y ratón', icon: Settings, action: (_d, cb) => cb.onOpenPanel('Preferences') },

  // ─── Export ───
  { id: 'export-3d', category: 'Exportar', name: 'Exportar 3D / Vuelta 360°', description: 'Capturas en alta, vuelta 360°, glTF/USDZ', icon: Download, action: (d) => d(openRenderSettings()) },
  { id: 'export-dxf', category: 'Exportar', name: 'Exportar DXF', description: 'Exporta el patrón como DXF', icon: FileText, action: (d) => runUiExport('dxf', store.getState().project, d) },

  // ─── View ───
  { id: 'view-2d', category: 'Vista', name: 'Vista: solo 2D', description: 'Solo el patrón 2D', icon: Eye, action: (d) => d(setViewMode('2d')) },
  { id: 'view-3d', category: 'Vista', name: 'Vista: solo 3D', description: 'Solo la simulación 3D', icon: Eye, action: (d) => d(setViewMode('3d')) },
  { id: 'view-split', category: 'Vista', name: 'Vista: dividida', description: '2D y 3D lado a lado', icon: Layers, action: (d) => d(setViewMode('split')) },
  { id: 'input-trackpad', category: 'Vista', name: 'Controles de panel táctil', description: 'Orbitar con dos dedos, zoom con pellizco', icon: Hand, action: (d) => d(setUserScheme('trackpad')) },
  { id: 'input-mouse', category: 'Vista', name: 'Controles de ratón', description: 'Orbitar con clic derecho, zoom con rueda', icon: MousePointer2, action: (d) => d(setUserScheme('mouse')) },

  // ─── Toggles ───
  { id: 'toggle-seam-allowance', category: 'Vista', name: 'Mostrar u ocultar margen de costura', description: 'El margen alrededor de cada pieza', icon: ScanLine, shortcutId: 'view.toggleSeamAllowance', action: (d) => d(toggleSeamAllowance()) },
  { id: 'toggle-grainlines', category: 'Vista', name: 'Mostrar u ocultar hilos', description: 'Las flechas de dirección de hilo', icon: PenLine, action: (d) => d(toggleGrainlines()) },
  { id: 'toggle-piece-names', category: 'Vista', name: 'Mostrar u ocultar nombres de pieza', description: 'Las etiquetas de cada pieza', icon: Tag, action: (d) => d(togglePieceNames()) },

  // ─── Edit ───
  { id: 'undo', category: 'Edición', name: 'Deshacer', description: 'Deshace la última acción', icon: Undo2, shortcutId: 'edit.undo', action: (d) => d(undo()) },
  { id: 'redo', category: 'Edición', name: 'Rehacer', description: 'Rehace lo último deshecho', icon: Redo2, shortcutId: 'edit.redo', action: (d) => d(redo()) },
];
