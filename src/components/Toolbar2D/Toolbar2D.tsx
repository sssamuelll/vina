import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setActiveTool } from '../../store/editorSlice';
import { setActiveTool2D } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import type { ToolDefinition } from '../../tools';
import './Toolbar2D.css';

/**
 * Photoshop-style tool groups.
 * First tool in each group is the default visible tool.
 * Long-press or right-click shows the flyout with all tools in the group.
 * Small triangle indicator shows when a group has sub-tools.
 */
const TOOL_GROUPS: string[][] = [
  // ─── Selection & Transform ───
  ['select', 'editCurve', 'editConstrain', 'movePattern'],
  ['transform'],
  // ─── Drawing ───
  ['pen', 'line', 'rectangle', 'circle'],
  ['internalShape', 'trace'],
  ['dart'],
  // ─── Pattern Editing ───
  ['scissors'],
  ['mirror', 'duplicate', 'copyPattern'],
  ['flatten'],
  ['seamAllowance'],
  // ─── Sewing ───
  ['seam', 'freesewing', 'elastic'],
  // ─── Annotation ───
  ['notch'],
  ['grainline'],
  ['measure', 'grading'],
  ['textAnnotation'],
  // ─── Misc ───
  ['addPiece', 'fabricTexture'],
  ['hand', 'zoom'],
];

/** Separators: insert after these group indices */
const SEPARATORS_AFTER = [1, 4, 8, 10, 14];

const LONG_PRESS_MS = 400;

interface ToolGroupButtonProps {
  tools: ToolDefinition[];
  activeToolId: string;
  selectedToolPerGroup: Record<number, string>;
  groupIndex: number;
  onToolSelect: (toolId: string, groupIndex: number) => void;
}

function ToolGroupButton({ tools, activeToolId, selectedToolPerGroup, groupIndex, onToolSelect }: ToolGroupButtonProps) {
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const hasSubs = tools.length > 1;

  // Which tool to show as the group representative
  const visibleToolId = selectedToolPerGroup[groupIndex] || tools[0].id;
  const visibleTool = tools.find(t => t.id === visibleToolId) || tools[0];
  const isActive = tools.some(t => t.id === activeToolId);

  const closeFlyout = useCallback(() => setFlyoutOpen(false), []);

  // Close flyout on outside click
  useEffect(() => {
    if (!flyoutOpen) return;
    const handler = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        closeFlyout();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [flyoutOpen, closeFlyout]);

  const handleMouseDown = useCallback(() => {
    if (!hasSubs) return;
    longPressTimer.current = setTimeout(() => {
      setFlyoutOpen(true);
      longPressTimer.current = null;
    }, LONG_PRESS_MS);
  }, [hasSubs]);

  const handleMouseUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      // Short click — select this tool
      onToolSelect(visibleTool.id, groupIndex);
    }
  }, [visibleTool.id, groupIndex, onToolSelect]);

  const handleMouseLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!hasSubs) return;
    e.preventDefault();
    setFlyoutOpen(prev => !prev);
  }, [hasSubs]);

  const handleClick = useCallback(() => {
    if (!hasSubs) {
      onToolSelect(visibleTool.id, groupIndex);
    }
  }, [hasSubs, visibleTool.id, groupIndex, onToolSelect]);

  const handleFlyoutSelect = useCallback((toolId: string) => {
    onToolSelect(toolId, groupIndex);
    setFlyoutOpen(false);
  }, [groupIndex, onToolSelect]);

  const IconComponent = visibleTool.icon;

  return (
    <div className="tool-group-btn-wrapper" ref={btnRef}>
      <button
        className={`tool-btn ${isActive ? 'active' : ''}`}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        title={`${visibleTool.name}${visibleTool.shortcut ? ` (${visibleTool.shortcut.toUpperCase()})` : ''}${hasSubs ? ' — right-click for more' : ''}`}
      >
        <span className="tool-icon">
          <IconComponent size={18} />
        </span>
        {hasSubs && <span className="tool-sub-indicator" />}
      </button>

      {flyoutOpen && (
        <div className="tool-flyout">
          {tools.map(tool => {
            const FlyoutIcon = tool.icon;
            return (
              <button
                key={tool.id}
                className={`flyout-item ${activeToolId === tool.id ? 'active' : ''}`}
                onClick={() => handleFlyoutSelect(tool.id)}
                title={`${tool.name}${tool.shortcut ? ` (${tool.shortcut.toUpperCase()})` : ''}`}
              >
                <span className="flyout-icon">
                  <FlyoutIcon size={16} />
                </span>
                <span className="flyout-label">{tool.name}</span>
                {tool.shortcut && <span className="flyout-shortcut">{tool.shortcut.toUpperCase()}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Toolbar2D() {
  const dispatch = useDispatch();
  const legacyActiveTool = useSelector((s: RootState) => s.editor.activeTool);
  const activeTool2D = useSelector((s: RootState) => s.tools.activeTool2D);
  const [selectedToolPerGroup, setSelectedToolPerGroup] = useState<Record<number, string>>({});

  const currentActiveTool = activeTool2D || legacyActiveTool;

  // Resolve tool definitions for each group
  const resolvedGroups = useMemo(() => {
    return TOOL_GROUPS.map(ids => 
      ids.map(id => toolRegistry.getTool(id)).filter((t): t is ToolDefinition => t !== undefined)
    ).filter(group => group.length > 0);
  }, []);

  const handleToolSelect = useCallback((toolId: string, groupIndex: number) => {
    dispatch(setActiveTool(toolId as any));
    dispatch(setActiveTool2D(toolId));
    setSelectedToolPerGroup(prev => ({ ...prev, [groupIndex]: toolId }));
  }, [dispatch]);

  return (
    <div className="toolbar2d">
      {resolvedGroups.map((tools, idx) => (
        <div key={idx}>
          <ToolGroupButton
            tools={tools}
            activeToolId={currentActiveTool}
            selectedToolPerGroup={selectedToolPerGroup}
            groupIndex={idx}
            onToolSelect={handleToolSelect}
          />
          {SEPARATORS_AFTER.includes(idx) && <div className="tool-separator" />}
        </div>
      ))}
    </div>
  );
}
