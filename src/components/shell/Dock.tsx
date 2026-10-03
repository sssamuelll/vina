import { useState, type ReactNode } from 'react';
import DockShell from './DockShell';
import ToolTooltip from './ToolTooltip';
import type { DockToolDef } from './dock2dTools';
import { displayShortcut } from './shortcutDisplay';
import './Dock.css';

interface DockProps {
  /** Domain anchor, e.g. "2D". Label only, not a button. */
  domainLabel: string;
  tools: DockToolDef[];
  /** The currently active tool id (the engine truth). */
  activeToolId: string;
  onSelectTool: (id: string) => void;
  /** El contenedor explica por qué una herramienta no se puede activar; así
   *  el botón y su ayuda reflejan la misma condición que protege el comando. */
  disabledReasons?: Readonly<Record<string, string | undefined>>;
  /** Optional footer (e.g. the ＋ customize editor) rendered at the very bottom. */
  footer?: ReactNode;
  /** When set, tool buttons become native-drag reorder sources/targets. */
  onReorderTool?: (fromId: string, toId: string) => void;
}

/**
 * A vertical single-select tool column (the redesign's left/2D dock), rendered
 * inside the shared DockShell. Presentational only — the container supplies
 * tools + active id and handles activation. When onReorderTool is provided,
 * tools can be reordered by native HTML5 drag (coexists with click-to-activate).
 */
export default function Dock({ domainLabel, tools, activeToolId, onSelectTool, disabledReasons, footer, onReorderTool }: DockProps) {
  const reorderable = !!onReorderTool;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const clearDrag = () => { setDraggingId(null); setDropTargetId(null); };

  return (
    <DockShell side="left" domainLabel={domainLabel}>
      {tools.map(tool => {
        const Icon = tool.icon;
        const active = tool.id === activeToolId;
        const disabledReason = disabledReasons?.[tool.id];
        const dragging = draggingId === tool.id;
        const isDropTarget = dropTargetId === tool.id && draggingId !== tool.id;
        return (
          <ToolTooltip key={tool.id} name={tool.label} shortcut={tool.shortcut} description={disabledReason} position="right">
            <button
              type="button"
              className={`dock__tool ${active ? 'dock__tool--active' : ''} ${dragging ? 'dock__tool--dragging' : ''} ${isDropTarget ? 'dock__tool--drop-target' : ''}`}
              onClick={() => onSelectTool(tool.id)}
              disabled={!!disabledReason}
              title={disabledReason}
              aria-label={tool.shortcut ? `${tool.label} · ${displayShortcut(tool.shortcut)}` : tool.label}
              aria-pressed={active}
              draggable={reorderable}
              onDragStart={reorderable ? (e) => { e.dataTransfer.setData('text/plain', tool.id); e.dataTransfer.effectAllowed = 'move'; setDraggingId(tool.id); } : undefined}
              onDragOver={reorderable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTargetId(tool.id); } : undefined}
              onDragLeave={reorderable ? () => setDropTargetId((cur) => (cur === tool.id ? null : cur)) : undefined}
              onDrop={reorderable ? (e) => { e.preventDefault(); const fromId = e.dataTransfer.getData('text/plain'); if (fromId && fromId !== tool.id) onReorderTool!(fromId, tool.id); clearDrag(); } : undefined}
              onDragEnd={reorderable ? clearDrag : undefined}
            >
              <Icon size={16} />
            </button>
          </ToolTooltip>
        );
      })}
      {footer}
    </DockShell>
  );
}
