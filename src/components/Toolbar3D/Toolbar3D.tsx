import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { togglePoseEditor } from '../../store/avatarSlice';
import './Toolbar3D.css';

export type Tool3D = 'camera' | 'edit' | 'pose' | 'avatar';

interface Tool3DDef {
  id: Tool3D;
  label: string;
  shortcut?: string;
}

const tools: Tool3DDef[] = [
  { id: 'camera',  label: 'Camera (Orbit/Pan/Zoom)' },
  { id: 'edit',    label: 'Edit Mode' },
  { id: 'pose',    label: 'Pose (drag joints)' },
  { id: 'avatar',  label: 'Avatar & Measurements' },
];

const getToolIcon = (toolId: Tool3D) => {
  const p = {
    width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.5,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (toolId) {
    case 'camera':
      return (
        <svg {...p}>
          <circle cx="9" cy="9" r="6" />
          <circle cx="9" cy="9" r="2" />
          <path d="M9 3V1M9 17V15M3 9H1M17 9H15" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...p}>
          <path d="M3 3L15 9L9 15L3 3Z" fill="currentColor" fillOpacity="0.2" />
          <path d="M3 3L15 9L9 15L3 3Z" />
        </svg>
      );
    case 'pose':
      return (
        <svg {...p}>
          <circle cx="9" cy="3.5" r="2" />
          <path d="M9 5.5V11" />
          <path d="M5 7.5L9 6.5L13 7.5" />
          <path d="M6.5 16L9 11L11.5 16" />
        </svg>
      );
    case 'avatar':
      return (
        <svg {...p}>
          <circle cx="9" cy="5" r="3" />
          <path d="M3 17C3 13.69 5.69 11 9 11C12.31 11 15 13.69 15 17" />
        </svg>
      );
    default:
      return null;
  }
};

interface Toolbar3DProps {
  activeTool: Tool3D;
  onToolChange: (tool: Tool3D) => void;
  avatarPanelOpen: boolean;
  onToggleAvatarPanel: () => void;
}

export default function Toolbar3D({ activeTool, onToolChange, avatarPanelOpen, onToggleAvatarPanel }: Toolbar3DProps) {
  const dispatch = useDispatch();
  const poseEditorOpen = useSelector((s: RootState) => s.avatar.poseEditorOpen);

  const handleClick = (id: Tool3D) => {
    if (id === 'avatar') {
      onToggleAvatarPanel();
      return;
    }
    if (id === 'pose') {
      // Toggle pose editor + switch to edit mode
      if (!poseEditorOpen) dispatch(togglePoseEditor());
      onToolChange('pose');
      return;
    }
    // Switching away from pose — close pose editor
    if (poseEditorOpen) {
      dispatch(togglePoseEditor());
    }
    onToolChange(id);
  };

  const isActive = (id: Tool3D) => {
    if (id === 'avatar') return avatarPanelOpen;
    if (id === 'pose') return activeTool === 'pose' || poseEditorOpen;
    return activeTool === id;
  };

  return (
    <div className="toolbar3d">
      {tools.map(tool => (
        <button
          key={tool.id}
          className={`tool3d-btn ${isActive(tool.id) ? 'active' : ''}`}
          onClick={() => handleClick(tool.id)}
          title={tool.label}
        >
          <span className="tool3d-icon">{getToolIcon(tool.id)}</span>
        </button>
      ))}
    </div>
  );
}
