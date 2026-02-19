import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setActiveTool } from '../../store/editorSlice';
import { Tool2D } from '../../types/types';
import './Toolbar2D.css';

interface ToolDef {
  id: Tool2D;
  label: string;
  icon: string;
  shortcut: string;
}

const tools: ToolDef[] = [
  { id: 'select',    label: 'Select',     icon: '↖', shortcut: 'V' },
  { id: 'pen',       label: 'Pen',        icon: '✒', shortcut: 'P' },
  { id: 'line',      label: 'Line',       icon: '╱', shortcut: 'L' },
  { id: 'rectangle', label: 'Rectangle',  icon: '▭', shortcut: 'R' },
  { id: 'seam',      label: 'Seam',       icon: '⊞', shortcut: 'S' },
  { id: 'notch',     label: 'Notch',      icon: '▽', shortcut: 'N' },
  { id: 'grainline', label: 'Grainline',  icon: '↕', shortcut: 'G' },
  { id: 'measure',   label: 'Measure',    icon: '📏', shortcut: 'M' },
  { id: 'hand',      label: 'Hand',       icon: '✋', shortcut: 'H' },
];

export default function Toolbar2D() {
  const dispatch = useDispatch();
  const { activeTool } = useSelector((s: RootState) => s.editor);

  return (
    <div className="toolbar2d">
      {tools.map(tool => (
        <button
          key={tool.id}
          className={`tool-btn ${activeTool === tool.id ? 'active' : ''}`}
          onClick={() => dispatch(setActiveTool(tool.id))}
          title={`${tool.label} (${tool.shortcut})`}
        >
          <span className="tool-icon">{tool.icon}</span>
        </button>
      ))}
    </div>
  );
}
