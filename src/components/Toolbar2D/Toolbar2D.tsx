import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setActiveTool } from '../../store/editorSlice';
import { Tool2D } from '../../types/types';
import './Toolbar2D.css';

interface ToolDef {
  id: Tool2D;
  label: string;
  shortcut: string;
}

const tools: ToolDef[] = [
  { id: 'select',    label: 'Select',     shortcut: 'V' },
  { id: 'pen',       label: 'Pen',        shortcut: 'P' },
  { id: 'line',      label: 'Line',       shortcut: 'L' },
  { id: 'rectangle', label: 'Rectangle',  shortcut: 'R' },
  { id: 'seam',      label: 'Seam',       shortcut: 'S' },
  { id: 'notch',     label: 'Notch',      shortcut: 'N' },
  { id: 'grainline', label: 'Grainline',  shortcut: 'G' },
  { id: 'measure',   label: 'Measure',    shortcut: 'M' },
  { id: 'hand',      label: 'Hand',       shortcut: 'H' },
];

const getToolIcon = (toolId: Tool2D) => {
  const iconProps = {
    width: 18,
    height: 18,
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  switch (toolId) {
    case 'select':
      return (
        <svg {...iconProps}>
          <path d="M3 3L15 9L9 15L3 3Z" fill="currentColor" fillOpacity="0.2"/>
          <path d="M3 3L15 9L9 15L3 3Z"/>
        </svg>
      );
    case 'pen':
      return (
        <svg {...iconProps}>
          <path d="M12 2L16 6L6 16L2 16L2 12L12 2Z"/>
          <path d="M11 3L15 7"/>
        </svg>
      );
    case 'line':
      return (
        <svg {...iconProps}>
          <path d="M4 14L14 4"/>
        </svg>
      );
    case 'rectangle':
      return (
        <svg {...iconProps}>
          <rect x="3" y="5" width="12" height="8"/>
        </svg>
      );
    case 'seam':
      return (
        <svg {...iconProps}>
          <path d="M6 3V15M12 3V15"/>
          <path d="M6 6L12 6M6 9L12 9M6 12L12 12" strokeWidth="1"/>
        </svg>
      );
    case 'notch':
      return (
        <svg {...iconProps}>
          <path d="M9 3V15M6 6L9 3L12 6"/>
        </svg>
      );
    case 'grainline':
      return (
        <svg {...iconProps}>
          <path d="M9 2V16"/>
          <path d="M6 5L9 2L12 5"/>
          <path d="M6 13L9 16L12 13"/>
        </svg>
      );
    case 'measure':
      return (
        <svg {...iconProps}>
          <path d="M3 8H15"/>
          <path d="M3 6V10M6 7V9M9 6V10M12 7V9M15 6V10"/>
        </svg>
      );
    case 'hand':
      return (
        <svg {...iconProps}>
          <path d="M6.5 1.5V9M6.5 1.5C6.5 0.67 7.17 0 8 0S9.5 0.67 9.5 1.5V7M9.5 1.5C9.5 0.67 10.17 0 11 0S12.5 0.67 12.5 1.5V7M12.5 3C12.5 2.17 13.17 1.5 14 1.5S15.5 2.17 15.5 3V10C15.5 13.04 13.04 15.5 10 15.5H9C6.5 15.5 4.5 14.5 3.5 13L1 8.5C0.5 7.67 0.83 6.58 1.67 6.08C2.5 5.58 3.58 5.92 4.08 6.75L5 8.25V2.5C5 1.67 5.67 1 6.5 1Z" strokeLinejoin="round"/>
        </svg>
      );
    default:
      return null;
  }
};

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
          <span className="tool-icon">{getToolIcon(tool.id)}</span>
        </button>
      ))}
    </div>
  );
}
