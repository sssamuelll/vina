import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import { setViewMode, toggleSnapToGrid, toggleSeamAllowance } from '../../store/editorSlice';
import { startSimulation, setViewMode3D } from '../../store/simulationSlice';
import {
  FileText, Scissors, Ruler, Shirt, Download, Grid3x3, Eye,
  LayoutTemplate, Layers, ScanLine, type LucideIcon,
} from 'lucide-react';

interface CommandDef {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  action: (dispatch: AppDispatch, callbacks: CommandCallbacks) => void;
}

interface CommandCallbacks {
  onOpenTemplates: () => void;
  onOpenPanel: (name: string) => void;
}

const COMMANDS: CommandDef[] = [
  { id: 'load-template', name: 'Load Template', description: 'Open Seamly2D pattern library', icon: LayoutTemplate, action: (_d, cb) => cb.onOpenTemplates() },
  { id: 'auto-sew', name: 'Auto-Sew Pieces', description: 'Detect and create seams automatically', icon: Scissors, action: () => {} },
  { id: 'dress-avatar', name: 'Dress Avatar', description: 'Place pieces and start simulation', icon: Shirt, action: (d) => { d(setViewMode3D('simulate')); d(startSimulation()); } },
  { id: 'grade', name: 'Grade S–XL', description: 'Generate size grading', icon: Ruler, action: () => {} },
  { id: 'export-techpack', name: 'Export Tech Pack', description: 'Generate PDF tech pack with BOM', icon: Download, action: () => {} },
  { id: 'toggle-grid', name: 'Toggle Grid', description: 'Show/hide canvas grid', icon: Grid3x3, action: (d) => d(toggleSnapToGrid()) },
  { id: 'toggle-seam-allowance', name: 'Toggle Seam Allowance', description: 'Show/hide seam allowance', icon: ScanLine, action: (d) => d(toggleSeamAllowance()) },
  { id: 'view-2d', name: 'View: 2D Only', description: 'Switch to 2D pattern view', icon: Eye, action: (d) => d(setViewMode('2d')) },
  { id: 'view-3d', name: 'View: 3D Only', description: 'Switch to 3D simulation view', icon: Eye, action: (d) => d(setViewMode('3d')) },
  { id: 'view-split', name: 'View: Split', description: 'Side-by-side 2D + 3D', icon: Layers, action: (d) => d(setViewMode('split')) },
  { id: 'show-avatar', name: 'Avatar Settings', description: 'Open avatar & measurement panel', icon: Shirt, action: (_d, cb) => cb.onOpenPanel('Avatar Settings') },
  { id: 'show-bom', name: 'Bill of Materials', description: 'Open BOM panel', icon: FileText, action: (_d, cb) => cb.onOpenPanel('Bill of Materials') },
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
  onOpenTemplates: () => void;
  onOpenPanel: (name: string) => void;
}

export default function UnifiedBarCommands({ query, onExecute, onOpenTemplates, onOpenPanel }: Props) {
  const dispatch = useDispatch<AppDispatch>();

  const filtered = useMemo(() => {
    if (!query.trim()) return COMMANDS;
    return COMMANDS.filter(c => fuzzyMatch(query, c.name) || fuzzyMatch(query, c.description));
  }, [query]);

  return (
    <div style={{ padding: 'var(--sp-2)' }}>
      {filtered.map(cmd => {
        const Icon = cmd.icon;
        return (
          <button
            key={cmd.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
              width: '100%', padding: '6px 10px', borderRadius: 'var(--radius-sm)',
              textAlign: 'left', transition: 'background var(--transition-fast)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-subtle)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { cmd.action(dispatch, { onOpenTemplates, onOpenPanel }); onExecute(); }}
          >
            <Icon size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-ui)', color: 'var(--text-primary)' }}>{cmd.name}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-ghost)', marginLeft: 'auto' }}>{cmd.description}</span>
          </button>
        );
      })}
      {filtered.length === 0 && (
        <div style={{ padding: 'var(--sp-4)', textAlign: 'center', color: 'var(--text-ghost)', fontSize: 'var(--text-ui)' }}>
          No commands match "{query}"
        </div>
      )}
    </div>
  );
}
