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

  // Get 2D tools from registry
  const tools2D = useMemo(() => {
    return toolRegistry.getToolsByContext('2d');
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
      {tools2D.map(tool => {
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
    </div>
  );
}