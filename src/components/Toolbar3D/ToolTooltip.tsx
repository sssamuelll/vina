/**
 * ToolTooltip — rich tooltip for toolbar buttons.
 * Shows tool name + shortcut badge + description.
 * 500ms hover delay, positioned right of toolbar.
 */
import { useState, useRef, useCallback, type ReactNode } from 'react';
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

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), 500);
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="tool-tooltip-wrapper"
      onMouseEnter={show}
      onMouseLeave={hide}
      onMouseDown={hide}
    >
      {children}
      {visible && (
        <div className="tool-tooltip" role="tooltip">
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
        </div>
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
