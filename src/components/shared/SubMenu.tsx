import { useState, useRef, useCallback } from 'react';
import './SubMenu.css';

export interface SubMenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
}

interface SubMenuProps {
  label: string;
  icon?: string;
  items: SubMenuItem[];
}

export default function SubMenu({ label, icon, items }: SubMenuProps) {
  const [open, setOpen] = useState(false);
  const enterTimer = useRef<ReturnType<typeof setTimeout>>();
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleMouseEnter = useCallback(() => {
    clearTimeout(leaveTimer.current);
    enterTimer.current = setTimeout(() => setOpen(true), 200);
  }, []);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(enterTimer.current);
    leaveTimer.current = setTimeout(() => setOpen(false), 150);
  }, []);

  return (
    <div
      className="submenu-trigger"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button className="submenu-trigger-btn">
        {icon && <span className="submenu-icon">{icon}</span>}
        <span className="submenu-label">{label}</span>
        <span className="submenu-arrow">▸</span>
      </button>
      {open && (
        <div className="submenu-panel" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
          {items.map((item, i) => (
            <div key={i}>
              {item.separator && <div className="submenu-separator" />}
              <button
                className="submenu-item"
                onClick={item.action}
                disabled={item.disabled}
              >
                {item.icon && <span className="submenu-icon">{item.icon}</span>}
                <span className="submenu-label">{item.label}</span>
                {item.shortcut && <span className="submenu-shortcut">{item.shortcut}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
