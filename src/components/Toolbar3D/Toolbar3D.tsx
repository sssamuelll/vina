import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { togglePoseEditor } from '../../store/avatarSlice';
import { setActiveTool3D } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import './Toolbar3D.css';

interface Toolbar3DProps {
  avatarPanelOpen: boolean;
  onToggleAvatarPanel: () => void;
}

export default function Toolbar3D({ avatarPanelOpen, onToggleAvatarPanel }: Toolbar3DProps) {
  const dispatch = useDispatch();
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const poseEditorOpen = useSelector((s: RootState) => s.avatar.poseEditorOpen);

  // Get 3D tools grouped by category (CLO3D style)
  const toolGroups = useMemo(() => {
    const groups = [
      '3d-navigate',    // Navigation
      '3d-arrange',     // Arrangement 
      '3d-edit',        // Editing
      '3d-avatar',      // Avatar
      '3d-simulation'   // Simulation
    ];
    
    return groups.map(groupName => ({
      name: groupName,
      tools: toolRegistry.getToolsByGroup(groupName).filter(tool => 
        tool.context === '3d' || tool.context === 'both'
      )
    })).filter(group => group.tools.length > 0);
  }, []);

  const handleClick = (toolId: string) => {
    if (toolId === 'avatar') {
      onToggleAvatarPanel();
      return;
    }
    if (toolId === 'pose') {
      // Toggle pose editor + switch to pose mode
      if (!poseEditorOpen) dispatch(togglePoseEditor());
      dispatch(setActiveTool3D('pose'));
      return;
    }
    // Switching away from pose — close pose editor
    if (poseEditorOpen) {
      dispatch(togglePoseEditor());
    }
    dispatch(setActiveTool3D(toolId));
  };

  const isActive = (toolId: string) => {
    if (toolId === 'avatar') return avatarPanelOpen;
    if (toolId === 'pose') return activeTool3D === 'pose' || poseEditorOpen;
    return activeTool3D === toolId;
  };

  return (
    <div className="toolbar3d">
      {toolGroups.map((group, groupIndex) => (
        <div key={group.name} className="tool3d-group">
          {group.tools.map(tool => {
            const IconComponent = tool.icon;
            return (
              <button
                key={tool.id}
                className={`tool3d-btn ${isActive(tool.id) ? 'active' : ''}`}
                onClick={() => handleClick(tool.id)}
                title={tool.name}
              >
                <span className="tool3d-icon">
                  <IconComponent size={18} />
                </span>
              </button>
            );
          })}
          {groupIndex < toolGroups.length - 1 && <div className="tool3d-separator" />}
        </div>
      ))}
    </div>
  );
}

// Export for backward compatibility
export type Tool3D = 'camera' | 'edit' | 'pose' | 'avatar';