import { useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setActiveTool } from '../../store/editorSlice';  // Keep for backward compatibility
import { setActiveTool2D } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import './Toolbar2D.css';

export default function Toolbar2D() {
  const dispatch = useDispatch();
  const legacyActiveTool = useSelector((s: RootState) => s.editor.activeTool);
  const activeTool2D = useSelector((s: RootState) => s.tools.activeTool2D);

  // Get 2D tools grouped by category (CLO3D style)
  const toolGroups = useMemo(() => {
    const groups = [
      'select',     // Selection & Transform
      'draw',       // Drawing tools
      'pattern',    // Pattern editing
      'sewing',     // Sewing tools
      'annotation', // Annotation
      'navigation'  // Navigation
    ];
    
    return groups.map(groupName => ({
      name: groupName,
      tools: toolRegistry.getToolsByGroup(groupName).filter(tool => 
        tool.context === '2d' || tool.context === 'both'
      )
    })).filter(group => group.tools.length > 0);
  }, []);

  // Use new tool system but keep backward compatibility
  const currentActiveTool = activeTool2D || legacyActiveTool;

  const handleToolClick = (toolId: string) => {
    // Update both old and new state for backward compatibility
    dispatch(setActiveTool(toolId as any)); // Cast for backward compatibility
    dispatch(setActiveTool2D(toolId));
  };

  return (
    <div className="toolbar2d">
      {toolGroups.map((group, groupIndex) => (
        <div key={group.name} className="tool-group">
          {group.tools.map(tool => {
            const IconComponent = tool.icon;
            return (
              <button
                key={tool.id}
                className={`tool-btn ${currentActiveTool === tool.id ? 'active' : ''}`}
                onClick={() => handleToolClick(tool.id)}
                title={`${tool.name}${tool.shortcut ? ` (${tool.shortcut.toUpperCase()})` : ''}`}
              >
                <span className="tool-icon">
                  <IconComponent size={18} />
                </span>
              </button>
            );
          })}
          {groupIndex < toolGroups.length - 1 && <div className="tool-separator" />}
        </div>
      ))}
    </div>
  );
}