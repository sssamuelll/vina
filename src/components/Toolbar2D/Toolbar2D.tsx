import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import type { Tool2D } from '../../types/types';
import { setActiveTool } from '../../store/editorSlice';
import { setActiveTool2D, setExpertShowOverride } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import type { ToolDefinition } from '../../tools';
import ToolTooltip from '../Toolbar3D/ToolTooltip';
import ToolButtonContextMenu from './ToolButtonContextMenu';
import './Toolbar2D.css';

/**
 * Photoshop-style tool groups.
 * 
 * Behavior (matches Adobe Photoshop exactly):
 * - Click → selects the currently visible tool (instant, no menu)
 * - Press & hold (~300ms) → shows horizontal strip of sub-tools
 * - Drag to sub-tool while holding → highlights it
 * - Release on sub-tool → selects it, replaces the visible tool icon
 * - Small triangle (▸) in bottom-right indicates sub-tools exist
 * 
 * First tool in each group is the initial default.
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
  ['scissors', 'slashAndSpread'],
  ['mirror', 'duplicate', 'copyPattern'],
  ['flatten'],
  ['seamAllowance'],
  // ─── Sewing ───
  ['seam', 'freesewing', 'elastic'],
  // ─── Annotation ───
  ['notch'],
  ['grainline'],
  ['measure', 'measureCurve', 'compareCurves', 'walkSeam', 'grading'],
  ['textAnnotation'],
  // ─── Misc ───
  ['addPiece', 'fabricTexture'],
  ['hand', 'zoom'],
];

/** Insert visual separators after these group indices */
const SEPARATORS_AFTER = [1, 4, 8, 9, 13];

const HOLD_DELAY_MS = 300;

interface ToolGroupButtonProps {
  tools: ToolDefinition[];
  activeToolId: string;
  visibleToolId: string;
  groupIndex: number;
  onToolSelect: (toolId: string, groupIndex: number) => void;
  onContextMenu?: (e: React.MouseEvent, toolId: string) => void;
  onRightClick?: () => void;
}

function ToolGroupButton({ tools, activeToolId, visibleToolId, groupIndex, onToolSelect, onContextMenu, onRightClick }: ToolGroupButtonProps) {
  const [stripOpen, setStripOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [stripPos, setStripPos] = useState({ top: 0, left: 0 });
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hasSubs = tools.length > 1;

  const visibleTool = tools.find(t => t.id === visibleToolId) || tools[0];
  const isGroupActive = tools.some(t => t.id === activeToolId);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  // Close strip on pointer up anywhere (for the drag gesture)
  useEffect(() => {
    if (!stripOpen) return;
    const handleGlobalUp = () => {
      if (isDragging.current && hoveredId) {
        onToolSelect(hoveredId, groupIndex);
      }
      setStripOpen(false);
      isDragging.current = false;
      setHoveredId(null);
    };
    window.addEventListener('pointerup', handleGlobalUp);
    return () => window.removeEventListener('pointerup', handleGlobalUp);
  }, [stripOpen, hoveredId, groupIndex, onToolSelect]);

  const openStrip = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setStripPos({
      top: rect.top + rect.height / 2 - 18, // vertically center on button
      left: rect.right + 4,
    });
    setStripOpen(true);
    isDragging.current = true;
  }, []);

  const handlePointerDown = useCallback((_e: React.PointerEvent) => {
    _e.preventDefault();
    if (hasSubs) {
      holdTimer.current = setTimeout(() => {
        openStrip();
        holdTimer.current = null;
      }, HOLD_DELAY_MS);
    }
  }, [hasSubs, openStrip]);

  const handlePointerUp = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
      onToolSelect(visibleTool.id, groupIndex);
    }
  }, [visibleTool.id, groupIndex, onToolSelect]);

  const handlePointerLeave = useCallback(() => {
    if (holdTimer.current && !stripOpen) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, [stripOpen]);

  const IconComponent = visibleTool.icon;

  const stripEl = stripOpen && hasSubs ? createPortal(
    <div
      className="tool-strip"
      style={{ top: stripPos.top, left: stripPos.left }}
    >
      {tools.map(tool => {
        const StripIcon = tool.icon;
        const isHovered = hoveredId === tool.id;
        const isCurrent = activeToolId === tool.id;
        return (
          <div
            key={tool.id}
            className={`strip-item ${isHovered ? 'hovered' : ''} ${isCurrent ? 'current' : ''}`}
            onPointerEnter={() => setHoveredId(tool.id)}
            onPointerLeave={() => setHoveredId(null)}
          >
            <span className="strip-icon">
              <StripIcon size={18} />
            </span>
            <span className="strip-tooltip">{tool.name}</span>
          </div>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <div className="tool-group-wrapper">
      <ToolTooltip
        name={visibleTool.name}
        shortcut={visibleTool.shortcut}
        description={visibleTool.description}
        hasSubTools={hasSubs}
        position="right"
      >
        <button
          ref={btnRef}
          className={`tool-btn ${isGroupActive ? 'active' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onContextMenu={(e) => {
            e.preventDefault();
            if (e.shiftKey) {
              // Shift+right-click: confirmation override menu (Task 11)
              onContextMenu?.(e, visibleTool.id);
            } else {
              // Plain right-click in expert mode: reveal options bar
              onRightClick?.();
            }
          }}
        >
          <span className="tool-icon">
            <IconComponent size={18} />
          </span>
          {hasSubs && <span className="tool-sub-triangle" />}
        </button>
      </ToolTooltip>
      {stripEl}
    </div>
  );
}

export default function Toolbar2D() {
  const dispatch = useDispatch();
  const legacyActiveTool = useSelector((s: RootState) => s.editor.activeTool);
  const activeTool2D = useSelector((s: RootState) => s.tools.activeTool2D);
  const expertMode = useSelector((s: RootState) => s.workflow.expertMode);
  const expertShowOverride = useSelector((s: RootState) => s.tools.expertShowOverride);
  const [selectedPerGroup, setSelectedPerGroup] = useState<Record<number, string>>({});
  const [contextMenu, setContextMenu] = useState<{
    operationName: string;
    position: { top: number; left: number };
  } | null>(null);

  const currentActiveTool = activeTool2D || legacyActiveTool;

  const resolvedGroups = useMemo(() => {
    return TOOL_GROUPS.map(ids =>
      ids.map(id => toolRegistry.getTool(id)).filter((t): t is ToolDefinition => t !== undefined)
    ).filter(group => group.length > 0);
  }, []);

  const handleToolSelect = useCallback((toolId: string, groupIndex: number) => {
    dispatch(setActiveTool(toolId as Tool2D));
    dispatch(setActiveTool2D(toolId));
    setSelectedPerGroup(prev => ({ ...prev, [groupIndex]: toolId }));
  }, [dispatch]);

  const handleRightClick = useCallback(() => {
    if (expertMode) {
      dispatch(setExpertShowOverride(true));
    }
  }, [expertMode, dispatch]);

  // Click-away handler: auto-reset expertShowOverride after 100ms delay
  // (delay prevents the right-click itself from immediately dismissing the override)
  useEffect(() => {
    if (!expertShowOverride) return;
    const handleClickAway = () => dispatch(setExpertShowOverride(false));
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handleClickAway, { once: true });
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handleClickAway);
    };
  }, [expertShowOverride, dispatch]);

  return (
    <div className="toolbar2d">
      {resolvedGroups.map((tools, idx) => (
        <div key={idx}>
          <ToolGroupButton
            tools={tools}
            activeToolId={currentActiveTool}
            visibleToolId={selectedPerGroup[idx] || tools[0].id}
            groupIndex={idx}
            onToolSelect={handleToolSelect}
            onContextMenu={(e: React.MouseEvent, toolId: string) => {
              setContextMenu({
                operationName: toolId,
                position: { top: e.clientY, left: e.clientX },
              });
            }}
            onRightClick={handleRightClick}
          />
          {SEPARATORS_AFTER.includes(idx) && <div className="tool-separator" />}
        </div>
      ))}
      {contextMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setContextMenu(null)}
          />
          <ToolButtonContextMenu
            operationName={contextMenu.operationName}
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
          />
        </>
      )}
    </div>
  );
}
