import type { Ref } from 'react';
import { createPortal } from 'react-dom';
import type { DockToolDef } from './dock2dTools';
import { displayShortcut } from './shortcutDisplay';

interface DockToolPickerProps {
  catalog: DockToolDef[];
  /** Ids currently in the dock. */
  selectedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
  /** Dónde se abre, en px de ventana: a la derecha del «+», con su pie alineado al del botón. */
  ancla: { left: number; bottom: number };
  /** Un clic dentro no es «fuera»: el menú cuelga de <body>, no del dock. */
  raizRef?: Ref<HTMLDivElement>;
}

/**
 * The dock's customize popover — a pure checklist of the catalog. Checked = in
 * the dock. Clicking toggles membership (add when off, remove when on). The only
 * remaining selected tool is disabled (the dock can never be empty). Owns no
 * open/close lifecycle — the container (LeftDock) handles outside-click / Esc.
 *
 * Se monta en <body>. El dock tiene scroll (#1149, para que las herramientas
 * quepan a 1366×643), y un scroll recorta todo lo que se sale de su caja:
 * dentro del dock este menú existía, a su derecha, y no se veía (medido el
 * 2026-10-03 a 643, 768 y 1000 px de alto). Mismo patrón que ToolTooltip y
 * SubMenu.
 */
export default function DockToolPicker({ catalog, selectedIds, onAdd, onRemove, onReset, ancla, raizRef }: DockToolPickerProps) {
  return createPortal(
    <div
      ref={raizRef}
      className="dock-picker"
      role="group"
      aria-label="Personalizar herramientas del dock"
      data-superficie="menu"
      data-material="papel"
      style={{ left: ancla.left, bottom: ancla.bottom }}
    >
      <div className="dock-picker__title">Herramientas del dock</div>
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
                aria-label={`${selected ? 'Quitar' : 'Añadir'} ${tool.label} ${selected ? 'del' : 'al'} dock`}
              >
                <Icon size={15} />
                <span className="dock-picker__label">{tool.label}</span>
                {tool.shortcut && <kbd className="dock-picker__kbd">{displayShortcut(tool.shortcut)}</kbd>}
                <span className="dock-picker__check">{selected ? '✓' : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="dock-picker__reset" onClick={onReset}>Restablecer valores</button>
    </div>,
    document.body,
  );
}
