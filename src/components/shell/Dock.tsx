import type { ReactNode } from 'react';
import DockShell from './DockShell';
import ToolTooltip from './ToolTooltip';
import type { DockToolDef } from './dock2dTools';
import './Dock.css';

interface DockProps {
  /** Domain anchor, e.g. "2D". Label only, not a button. */
  domainLabel: string;
  tools: DockToolDef[];
  /** The currently active tool id (the engine truth). */
  activeToolId: string;
  onSelectTool: (id: string) => void;
  /** Optional auto-suggest (✦) zone rendered below the pinned tools. */
  autoZone?: ReactNode;
  /** Optional footer (e.g. the ＋ customize editor) rendered at the very bottom. */
  footer?: ReactNode;
}

/**
 * A vertical single-select tool column (the redesign's left/2D dock), rendered
 * inside the shared DockShell. Presentational only — the container supplies
 * tools + active id and handles activation.
 */
export default function Dock({ domainLabel, tools, activeToolId, onSelectTool, autoZone, footer }: DockProps) {
  return (
    <DockShell side="left" domainLabel={domainLabel}>
      {tools.map(tool => {
        const Icon = tool.icon;
        const active = tool.id === activeToolId;
        return (
          <ToolTooltip key={tool.id} name={tool.label} shortcut={tool.shortcut} position="right">
            <button
              type="button"
              className={`dock__tool ${active ? 'dock__tool--active' : ''}`}
              onClick={() => onSelectTool(tool.id)}
              aria-label={tool.shortcut ? `${tool.label} · ${tool.shortcut}` : tool.label}
              aria-pressed={active}
            >
              <Icon size={16} />
            </button>
          </ToolTooltip>
        );
      })}
      {autoZone}
      {footer}
    </DockShell>
  );
}
