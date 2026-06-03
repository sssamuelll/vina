import type { DockToolDef } from './dock2dTools';

interface DockToolPickerProps {
  catalog: DockToolDef[];
  /** Ids currently in the dock. */
  selectedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
}

/**
 * The dock's customize popover — a pure checklist of the catalog. Checked = in
 * the dock. Clicking toggles membership (add when off, remove when on). The only
 * remaining selected tool is disabled (the dock can never be empty). Owns no
 * open/close lifecycle — the container (LeftDock) handles outside-click / Esc.
 */
export default function DockToolPicker({ catalog, selectedIds, onAdd, onRemove, onReset }: DockToolPickerProps) {
  return (
    <div className="dock-picker" role="group" aria-label="Customize dock tools">
      <div className="dock-picker__title">Dock tools</div>
      <ul className="dock-picker__list">
        {catalog.map((tool) => {
          const Icon = tool.icon;
          const selected = selectedIds.includes(tool.id);
          const isLast = selected && selectedIds.length === 1;
          return (
            <li key={tool.id}>
              <button
                type="button"
                className={`dock-picker__item ${selected ? 'dock-picker__item--on' : ''}`}
                onClick={() => (selected ? onRemove(tool.id) : onAdd(tool.id))}
                disabled={isLast}
                aria-pressed={selected}
                aria-label={`${selected ? 'Remove' : 'Add'} ${tool.label} ${selected ? 'from' : 'to'} dock`}
              >
                <Icon size={15} />
                <span className="dock-picker__label">{tool.label}</span>
                {tool.shortcut && <kbd className="dock-picker__kbd">{tool.shortcut}</kbd>}
                <span className="dock-picker__check">{selected ? '✓' : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="dock-picker__reset" onClick={onReset}>Reset to defaults</button>
    </div>
  );
}
