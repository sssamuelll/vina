import { useState, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { displayShortcut } from '../shell/shortcutDisplay';
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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
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

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setPos(null); return; }
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.top, left: r.right + 4 });
  }, [open]);

  return (
    <div
      ref={triggerRef}
      className="submenu-trigger"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className="submenu-trigger-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
            e.preventDefault();
            clearTimeout(enterTimer.current);
            clearTimeout(leaveTimer.current);
            setOpen(true);
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            clearTimeout(enterTimer.current);
            clearTimeout(leaveTimer.current);
            setOpen(false);
            e.currentTarget.focus();
          }
        }}
      >
        {icon && <span className="submenu-icon">{icon}</span>}
        <span className="submenu-label">{label}</span>
        <span className="submenu-arrow">▸</span>
      </button>
      {open && pos && createPortal(
        <div
          className="submenu-panel"
          data-material="papel"
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseDown={(e) => e.stopPropagation()}
        >
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
                {item.shortcut && <span className="submenu-shortcut">{displayShortcut(item.shortcut)}</span>}
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
