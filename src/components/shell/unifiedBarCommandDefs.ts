/**
 * Command catalog for the ⌘K UnifiedBar command mode. Plain module (no JSX)
 * so contract tests can import COMMANDS without rendering, and the component
 * file stays fast-refresh-clean.
 */
import type { AppDispatch } from '../../store';
import { store } from '../../store';
import { runUiExport } from '../../utils/export/uiExport';
import { setViewMode, toggleSnapToGrid, toggleSeamAllowance, toggleGrainlines, togglePieceNames, undo, redo } from '../../store/editorSlice';
import { startSimulation, resetSimulation, setViewMode3D } from '../../store/simulationSlice';
import {
  FileText, Scissors, Ruler, Shirt, Download, Grid3x3, Eye,
  Layers, ScanLine, Undo2, Redo2, User, Package,
  Search, ClipboardList, Wind, Palette, PenLine, Tag, Hand, MousePointer2,
  SlidersHorizontal, type LucideIcon,
} from 'lucide-react';
import { setUserScheme } from '../../store/inputSchemeSlice';

export interface CommandDef {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  shortcut?: string;
  action: (dispatch: AppDispatch, callbacks: CommandCallbacks) => void;
}

export interface CommandCallbacks {
  onOpenPanel: (name: string) => void;
}

export const COMMANDS: CommandDef[] = [
  // ─── Patterns ───
  { id: 'auto-sew', name: 'Auto-Sew Pieces', description: 'Detect and create seams automatically', icon: Scissors, action: (_d, cb) => cb.onOpenPanel('Auto-Sew') },

  // ─── Simulation ───
  { id: 'dress-avatar', name: 'Dress Avatar', description: 'Place pieces and start simulation', icon: Shirt, action: (d) => { d(setViewMode3D('simulate')); d(startSimulation()); } },
  { id: 'reset-sim', name: 'Reset Simulation', description: 'Stop simulation and reset', icon: Shirt, action: (d) => d(resetSimulation()) },

  // ─── Panels ───
  { id: 'show-avatar', name: 'Avatar & Measurements', description: 'Body measurements, pose, avatar model', icon: User, action: (_d, cb) => cb.onOpenPanel('Avatar') },
  { id: 'show-bom', name: 'Bill of Materials', description: 'Fabrics, trims, costs summary', icon: Package, action: (_d, cb) => cb.onOpenPanel('BOM') },
  { id: 'show-grading', name: 'Grading', description: 'Size grading table (XS–XXL)', icon: Ruler, action: (_d, cb) => cb.onOpenPanel('Grading') },
  { id: 'show-inspector', name: 'Inspector', description: 'Piece diagnostics and validation', icon: Search, action: (_d, cb) => cb.onOpenPanel('Inspector') },
  { id: 'show-problems', name: 'Problems', description: 'Pattern warnings and errors', icon: ClipboardList, action: (_d, cb) => cb.onOpenPanel('Problems') },
  { id: 'show-nesting', name: 'Nesting Preview', description: 'Fabric nesting layout', icon: Layers, action: (_d, cb) => cb.onOpenPanel('Nesting') },
  { id: 'show-layers', name: 'Layers', description: 'Piece layer management', icon: Layers, action: (_d, cb) => cb.onOpenPanel('Layers') },
  { id: 'show-properties', name: 'Properties', description: 'Piece, seam and material properties', icon: SlidersHorizontal, action: (_d, cb) => cb.onOpenPanel('Properties') },
  { id: 'show-simulation', name: 'Simulation Settings', description: 'Fabric, gravity, wind, solver', icon: Wind, action: (_d, cb) => cb.onOpenPanel('Simulation') },
  { id: 'show-colorways', name: 'Colorways', description: 'Color variant management', icon: Palette, action: (_d, cb) => cb.onOpenPanel('Colorways') },

  // ─── Export ───
  { id: 'export-techpack', name: 'Export Tech Pack', description: 'Generate PDF tech pack with BOM', icon: Download, action: (_d, cb) => cb.onOpenPanel('Export') },
  { id: 'export-dxf', name: 'Export DXF', description: 'Export patterns as DXF files', icon: FileText, action: (d) => runUiExport('dxf', store.getState().project, d) },

  // ─── View ───
  { id: 'view-2d', name: 'View: 2D Only', description: 'Switch to 2D pattern view', icon: Eye, action: (d) => d(setViewMode('2d')) },
  { id: 'view-3d', name: 'View: 3D Only', description: 'Switch to 3D simulation view', icon: Eye, action: (d) => d(setViewMode('3d')) },
  { id: 'view-split', name: 'View: Split', description: 'Side-by-side 2D + 3D', icon: Layers, action: (d) => d(setViewMode('split')) },
  { id: 'input-trackpad', name: 'Use Trackpad Controls', description: 'Two-finger orbit/pan, pinch zoom, ⌥-drag pan', icon: Hand, action: (d) => d(setUserScheme('trackpad')) },
  { id: 'input-mouse', name: 'Use Mouse Controls', description: 'CLO3D-style: right-drag orbit, wheel zoom', icon: MousePointer2, action: (d) => d(setUserScheme('mouse')) },

  // ─── Toggles ───
  { id: 'toggle-grid', name: 'Toggle Grid', description: 'Show/hide canvas grid', icon: Grid3x3, shortcut: 'G', action: (d) => d(toggleSnapToGrid()) },
  { id: 'toggle-seam-allowance', name: 'Toggle Seam Allowance', description: 'Show/hide seam allowance', icon: ScanLine, shortcut: '⇧S', action: (d) => d(toggleSeamAllowance()) },
  { id: 'toggle-grainlines', name: 'Toggle Grainlines', description: 'Show/hide grainline arrows', icon: PenLine, action: (d) => d(toggleGrainlines()) },
  { id: 'toggle-piece-names', name: 'Toggle Piece Names', description: 'Show/hide piece labels', icon: Tag, action: (d) => d(togglePieceNames()) },

  // ─── Edit ───
  { id: 'undo', name: 'Undo', description: 'Undo last action', icon: Undo2, shortcut: '⌘Z', action: (d) => d(undo()) },
  { id: 'redo', name: 'Redo', description: 'Redo last undone action', icon: Redo2, shortcut: '⌘⇧Z', action: (d) => d(redo()) },
];
