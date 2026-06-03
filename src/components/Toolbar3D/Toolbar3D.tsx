import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setActiveTool3D } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import type { ToolDefinition } from '../../tools/types';
import ToolTooltip from '../shell/ToolTooltip';
import './Toolbar3D.css';
import { safeGetItem, safeSetItem } from '../../utils/safeStorage';

interface Toolbar3DProps {
  avatarPanelOpen: boolean;
  onToggleAvatarPanel: () => void;
}

// Track primary sub-tool per parent tool (persisted in localStorage)
const SUBTOOL_STORAGE_KEY = 'openclo:primarySubTools';

function getPrimarySubTools(): Record<string, string> {
  try {
    return JSON.parse(safeGetItem(SUBTOOL_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function setPrimarySubTool(parentId: string, subToolId: string) {
  const current = getPrimarySubTools();
  current[parentId] = subToolId;
  safeSetItem(SUBTOOL_STORAGE_KEY, JSON.stringify(current));
}

export default function Toolbar3D({ avatarPanelOpen, onToggleAvatarPanel }: Toolbar3DProps) {
  const dispatch = useDispatch();
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const [openFlyout, setOpenFlyout] = useState<string | null>(null);
  const [primarySubTools, setPrimarySubToolsState] = useState(getPrimarySubTools);

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
        (tool.context === '3d' || tool.context === 'both') && !tool.hidden
      )
    })).filter(group => group.tools.length > 0);
  }, []);

  const handleSelectTool = useCallback((toolId: string) => {
    if (toolId === 'avatar') {
      onToggleAvatarPanel();
      return;
    }
    dispatch(setActiveTool3D(toolId));
    setOpenFlyout(null);
  }, [dispatch, onToggleAvatarPanel]);

  const handleSelectSubTool = useCallback((parentId: string, subToolId: string) => {
    setPrimarySubTool(parentId, subToolId);
    setPrimarySubToolsState(getPrimarySubTools());
    dispatch(setActiveTool3D(subToolId));
    setOpenFlyout(null);
  }, [dispatch]);

  const handleOpenFlyout = useCallback((toolId: string) => {
    setOpenFlyout(prev => prev === toolId ? null : toolId);
  }, []);

  // Close flyout when clicking outside
  useEffect(() => {
    if (!openFlyout) return;
    const handleClick = () => setOpenFlyout(null);
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick, { once: true });
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [openFlyout]);

  const isActive = (toolId: string) => {
    if (toolId === 'avatar') return avatarPanelOpen;
    return activeTool3D === toolId;
  };

  // Check if any sub-tool of this parent is active
  const isSubToolActive = (tool: ToolDefinition) => {
    if (!tool.subTools?.length) return false;
    return tool.subTools.some(subId => activeTool3D === subId);
  };

  // Get the display tool (primary sub-tool or the tool itself)
  const getDisplayTool = (tool: ToolDefinition): ToolDefinition => {
    if (!tool.subTools?.length) return tool;
    const primaryId = primarySubTools[tool.id] || tool.subTools[0];
    return toolRegistry.getTool(primaryId) || tool;
  };

  return (
    <div className="toolbar3d">
      {toolGroups.map((group, groupIndex) => (
        <div key={group.name} className="tool3d-group">
          {group.tools.map(tool => {
            const hasSubTools = !!tool.subTools?.length;
            const displayTool = getDisplayTool(tool);
            const active = isActive(tool.id) || isSubToolActive(tool);

            return (
              <ToolTooltip
                key={tool.id}
                name={displayTool.name}
                shortcut={displayTool.shortcut}
                description={displayTool.description}
                hasSubTools={hasSubTools}
              >
                <ToolButton
                  tool={tool}
                  displayTool={displayTool}
                  active={active}
                  hasSubTools={hasSubTools}
                  flyoutOpen={openFlyout === tool.id}
                  onSelect={() => handleSelectTool(hasSubTools ? displayTool.id : tool.id)}
                  onOpenFlyout={() => handleOpenFlyout(tool.id)}
                  onSelectSubTool={(subId) => handleSelectSubTool(tool.id, subId)}
                />
              </ToolTooltip>
            );
          })}
          {groupIndex < toolGroups.length - 1 && <div className="tool3d-separator" />}
        </div>
      ))}
    </div>
  );
}

interface ToolButtonProps {
  tool: ToolDefinition;
  displayTool: ToolDefinition;
  active: boolean;
  hasSubTools: boolean;
  flyoutOpen: boolean;
  onSelect: () => void;
  onOpenFlyout: () => void;
  onSelectSubTool: (subToolId: string) => void;
}

function ToolButton({
  tool,
  displayTool,
  active,
  hasSubTools,
  flyoutOpen,
  onSelect,
  onOpenFlyout,
  onSelectSubTool,
}: ToolButtonProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handlePointerDown = useCallback(() => {
    if (!hasSubTools) return;
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onOpenFlyout();
    }, 300);
  }, [hasSubTools, onOpenFlyout]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!didLongPress.current) {
      onSelect();
    }
  }, [onSelect]);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const IconComponent = displayTool.icon;

  return (
    <div className="tool3d-btn-wrapper">
      <button
        className={`tool3d-btn ${active ? 'active' : ''} ${hasSubTools ? 'has-subtools' : ''}`}
        data-tool-id={tool.id}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={(e) => { if (hasSubTools) e.preventDefault(); }}
      >
        <span className="tool3d-icon">
          <IconComponent size={18} />
        </span>
        {hasSubTools && <span className="tool3d-subtool-indicator" />}
      </button>

      {flyoutOpen && hasSubTools && (
        <SubToolFlyout
          parentTool={tool}
          onSelect={onSelectSubTool}
        />
      )}
    </div>
  );
}

interface SubToolFlyoutProps {
  parentTool: ToolDefinition;
  onSelect: (subToolId: string) => void;
}

function SubToolFlyout({ parentTool, onSelect }: SubToolFlyoutProps) {
  const subTools = (parentTool.subTools || [])
    .map(id => toolRegistry.getTool(id))
    .filter((t): t is ToolDefinition => !!t);

  if (subTools.length === 0) return null;

  return (
    <div className="subtool-flyout" onClick={(e) => e.stopPropagation()}>
      {subTools.map(sub => {
        const SubIcon = sub.icon;
        return (
          <button
            key={sub.id}
            className="subtool-btn"
            onClick={() => onSelect(sub.id)}
          >
            <span className="subtool-icon">
              <SubIcon size={16} />
            </span>
            <span className="subtool-name">{sub.name}</span>
            {sub.shortcut && (
              <kbd className="subtool-shortcut">{sub.shortcut.toUpperCase()}</kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Export for backward compatibility
export type Tool3D = 'camera' | 'edit' | 'sew3d' | 'pose' | 'avatar' | 'arrangement' | 'pin' | 'meshSelectBox' | 'meshSelectLasso';