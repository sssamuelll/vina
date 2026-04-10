import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { setActiveTool2D } from '../../store/toolSlice';
import { MousePointer2, Pen, Minus, Square, Scissors, Download, type LucideIcon } from 'lucide-react';

interface ToolDef {
  id: string;
  icon: LucideIcon;
  label: string;
  separator?: boolean;
}

const TOOLS: ToolDef[] = [
  { id: 'select', icon: MousePointer2, label: 'Select (V)' },
  { id: 'pen', icon: Pen, label: 'Pen (P)' },
  { id: 'line', icon: Minus, label: 'Line (L)' },
  { id: 'rectangle', icon: Square, label: 'Rectangle (R)' },
  { id: 'scissors', icon: Scissors, label: 'Scissors (X)' },
  { id: '_sep', icon: Minus, label: '', separator: true },
  { id: 'addPiece', icon: Download, label: 'Import' },
];

export default function FloatingToolbar() {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.tools.activeTool2D);
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          setVisible(v => !v);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (viewMode === '3d') return null;

  return (
    <div className={`floating-toolbar ${visible ? '' : 'floating-toolbar--hidden'}`}>
      {TOOLS.map(tool => {
        if (tool.separator) return <div key={tool.id} className="floating-toolbar__sep" />;
        const Icon = tool.icon;
        return (
          <button
            key={tool.id}
            className={`icon-btn ${activeTool === tool.id ? 'icon-btn--active' : ''}`}
            onClick={() => dispatch(setActiveTool2D(tool.id))}
            title={tool.label}
            aria-label={tool.label}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
