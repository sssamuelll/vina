import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import { PanelRight } from 'lucide-react';
import { RootState } from '../../store';
import type { Tool2D } from '../../types/types';
import { setActiveTool } from '../../store/editorSlice';
import { setActiveTool2D } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import type { ToolDefinition } from '../../tools';
import ToolTooltip from '../Toolbar3D/ToolTooltip';
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

/** Insert visual separators after these group indices */
const SEPARATORS_AFTER = [1, 4, 8, 9, 13];

const HOLD_DELAY_MS = 300;

interface ToolGroupButtonProps {
  tools: ToolDefinition[];
  activeToolId: string;
  visibleToolId: string;
  groupIndex: number;
  onToolSelect: (toolId: string, groupIndex: number) => void;
}

function ToolGroupButton({ tools, activeToolId, visibleToolId, groupIndex, onToolSelect }: ToolGroupButtonProps) {
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

interface Toolbar2DProps {
  propertiesPanelOpen?: boolean;
  onTogglePropertiesPanel?: () => void;
}

export default function Toolbar2D({ propertiesPanelOpen, onTogglePropertiesPanel }: Toolbar2DProps) {
  const dispatch = useDispatch();
  const legacyActiveTool = useSelector((s: RootState) => s.editor.activeTool);
  const activeTool2D = useSelector((s: RootState) => s.tools.activeTool2D);
  const [selectedPerGroup, setSelectedPerGroup] = useState<Record<number, string>>({});

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
          />
          {SEPARATORS_AFTER.includes(idx) && <div className="tool-separator" />}
        </div>
      ))}

      <div className="toolbar2d-spacer" />
      <ToolTooltip name="Piece Properties" position="right">
        <button
          className={`tool-btn tool-btn-toggle ${propertiesPanelOpen ? 'active' : ''}`}
          onClick={onTogglePropertiesPanel}
        >
          <span className="tool-icon">
            <PanelRight size={18} />
          </span>
        </button>
      </ToolTooltip>
    </div>
  );
}
