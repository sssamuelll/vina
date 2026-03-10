/**
 * ToolTooltip — rich tooltip for toolbar buttons.
 * Shows tool name + shortcut badge + description.
 * 500ms hover delay, positioned left of the button.
 * Uses portal to escape overflow:hidden ancestors.
 */
import { useState, useRef, useCallback, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './ToolTooltip.css';

interface ToolTooltipProps {
  name: string;
  shortcut?: string;
  description?: string;
  hasSubTools?: boolean;
  children: ReactNode;
}

export default function ToolTooltip({ name, shortcut, description, hasSubTools, children }: ToolTooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), 500);
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
  }, []);

  useLayoutEffect(() => {
    if (!visible || !wrapperRef.current) { setPos(null); return; }
    const rect = wrapperRef.current.getBoundingClientRect();
    setPos({
      top: rect.top + rect.height / 2,
      left: rect.left - 12,
    });
  }, [visible]);

  return (
    <div
      ref={wrapperRef}
      className="tool-tooltip-wrapper"
      onMouseEnter={show}
      onMouseLeave={hide}
      onMouseDown={hide}
    >
      {children}
      {visible && pos && createPortal(
        <div
          className="tool-tooltip"
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="tool-tooltip-header">
            <span className="tool-tooltip-name">{name}</span>
            {shortcut && (
              <kbd className="tool-tooltip-shortcut">{formatShortcut(shortcut)}</kbd>
            )}
          </div>
          {description && (
            <div className="tool-tooltip-desc">{description}</div>
          )}
          {hasSubTools && (
            <div className="tool-tooltip-hint">Hold to see variants</div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function formatShortcut(s: string): string {
  return s
    .replace('space', '␣')
    .replace('ctrl+', '⌘')
    .replace('shift+', '⇧')
    .replace('alt+', '⌥')
    .toUpperCase();
}
