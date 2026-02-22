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

  // Define the two-column layout as per CLO3D specification
  const toolLayout = useMemo(() => {
    const layout: Array<{ rows: [string, string | null][] }> = [
      {
        rows: [
          ['select', 'editCurve'],
          ['transform', 'editConstrain'], 
          ['pen', 'movePattern'],
          ['line', 'copyPattern'],
        ]
      },
      {
        rows: [
          ['internalShape', 'flatten'],
          ['seamAllowance', 'rectangle'],
          ['scissors', 'fabricTexture'],
          ['mirror', 'duplicate'],
        ]
      },
      {
        rows: [
          ['grading', 'trace'],
          ['grainline', 'measure'],
        ]
      },
      {
        rows: [
          ['textAnnotation', 'elastic'],
          ['notch', 'addPiece'],
        ]
      },
      {
        rows: [
          ['seam', 'freesewing'],
          ['hand', 'zoom'],
        ]
      },
    ];
    
    return layout;
  }, []);

  // Use new tool system but keep backward compatibility
  const currentActiveTool = activeTool2D || legacyActiveTool;

  const handleToolClick = (toolId: string) => {
    // Update both old and new state for backward compatibility
    dispatch(setActiveTool(toolId as any)); // Cast for backward compatibility
    dispatch(setActiveTool2D(toolId));
  };

  const renderToolButton = (toolId: string) => {
    const tool = toolRegistry.getTool(toolId);
    if (!tool) return null;

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
  };

  return (
    <div className="toolbar2d">
      {toolLayout.map((group, groupIndex) => (
        <div key={groupIndex} className="tool-row-group">
          {group.rows.map(([leftId, rightId]) => (
            <div key={`${leftId}-${rightId || 'empty'}`} className="tool-row">
              {renderToolButton(leftId)}
              {rightId ? renderToolButton(rightId) : <div className="tool-spacer" />}
            </div>
          ))}
          {groupIndex < toolLayout.length - 1 && <div className="tool-separator" />}
        </div>
      ))}
    </div>
  );
}