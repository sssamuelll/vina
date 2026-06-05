import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import { store } from '../../store';
import { runUiExport } from '../../utils/export/uiExport';
import { setViewMode, toggleSnapToGrid, toggleSeamAllowance, toggleGrainlines, togglePieceNames, undo, redo } from '../../store/editorSlice';
import { startSimulation, resetSimulation, setViewMode3D } from '../../store/simulationSlice';
import {
  FileText, Scissors, Ruler, Shirt, Download, Grid3x3, Eye,
  Layers, ScanLine, Undo2, Redo2, User, Package,
  Search, ClipboardList, Wind, Palette, PenLine, Tag, Hand, MousePointer2, type LucideIcon,
} from 'lucide-react';
import { setUserScheme } from '../../store/inputSchemeSlice';

interface CommandDef {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  shortcut?: string;
  action: (dispatch: AppDispatch, callbacks: CommandCallbacks) => void;
}

interface CommandCallbacks {
  onOpenPanel: (name: string) => void;
}

const COMMANDS: CommandDef[] = [
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

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

interface Props {
  query: string;
  onExecute: () => void;
  onOpenPanel: (name: string) => void;
}

export default function UnifiedBarCommands({ query, onExecute, onOpenPanel }: Props) {
  const dispatch = useDispatch<AppDispatch>();

  const filtered = useMemo(() => {
    if (!query.trim()) return COMMANDS;
    return COMMANDS.filter(c => fuzzyMatch(query, c.name) || fuzzyMatch(query, c.description));
  }, [query]);

  return (
    <div style={{ padding: 'var(--sp-2)', maxHeight: '50vh', overflowY: 'auto' }}>
      {filtered.map(cmd => {
        const Icon = cmd.icon;
        return (
          <button
            key={cmd.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
              width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
              textAlign: 'left', transition: 'background var(--transition-fast)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-subtle)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { cmd.action(dispatch, { onOpenPanel }); onExecute(); }}
          >
            <Icon size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{cmd.name}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-ghost)', marginLeft: 'auto' }}>{cmd.description}</span>
            {cmd.shortcut && (
              <span style={{
                fontSize: '10px', color: 'var(--text-dim)', background: 'var(--border-subtle)',
                padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border)', marginLeft: '8px',
              }}>{cmd.shortcut}</span>
            )}
          </button>
        );
      })}
      {filtered.length === 0 && (
        <div style={{ padding: 'var(--sp-4)', textAlign: 'center', color: 'var(--text-ghost)', fontSize: '14px' }}>
          No commands match "{query}"
        </div>
      )}
    </div>
  );
}
