import DockShell from './DockShell';
import type { DockToolDef } from './dock2dTools';
import './Dock.css';

interface DockProps {
  /** Domain anchor, e.g. "2D". Label only, not a button. */
  domainLabel: string;
  tools: DockToolDef[];
  /** The currently active tool id (the engine truth). */
  activeToolId: string;
  onSelectTool: (id: string) => void;
}

/**
 * A vertical single-select tool column (the redesign's left/2D dock), rendered
 * inside the shared DockShell. Presentational only — the container supplies
 * tools + active id and handles activation.
 */
export default function Dock({ domainLabel, tools, activeToolId, onSelectTool }: DockProps) {
  return (
    <DockShell side="left" domainLabel={domainLabel}>
      {tools.map(tool => {
        const Icon = tool.icon;
        const active = tool.id === activeToolId;
        return (
          <button
            key={tool.id}
            type="button"
            className={`dock__tool ${active ? 'dock__tool--active' : ''}`}
            onClick={() => onSelectTool(tool.id)}
            title={`${tool.label} · ${tool.shortcut}`}
            aria-label={`${tool.label} · ${tool.shortcut}`}
            aria-pressed={active}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </DockShell>
  );
}
