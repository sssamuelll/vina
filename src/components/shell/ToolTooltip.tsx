/**
 * ToolTooltip — rich tooltip for toolbar/activity-bar buttons.
 * Shows tool name + shortcut badge + optional description.
 * 500ms hover delay. Portal-rendered to escape overflow:hidden.
 * Supports `position="left"` (default, tooltip appears left of button)
 * or `position="right"` (tooltip appears right of button).
 */
import { useState, useRef, useCallback, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { displayShortcut } from './shortcutDisplay';
import './ToolTooltip.css';

export interface ToolTooltipProps {
  name: string;
  shortcut?: string;
  description?: string;
  /** Tints the description line to match a dock badge: 'pin' → blue, 'auto' → violet. */
  descriptionTone?: 'pin' | 'auto';
  hasSubTools?: boolean;
  /** Which side the tooltip appears on. Default: 'left' */
  position?: 'left' | 'right';
  children: ReactNode;
}

export default function ToolTooltip({ name, shortcut, description, descriptionTone, hasSubTools, position = 'left', children }: ToolTooltipProps) {
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
      left: position === 'left' ? rect.left - 12 : rect.right + 12,
    });
  }, [visible, position]);

  const side = position === 'left' ? 'tooltip-left' : 'tooltip-right';

  return (
    <div
      ref={wrapperRef}
      className="tool-tooltip-wrapper"
      onMouseEnter={show}
      onMouseLeave={hide}
      onPointerDown={hide}
    >
      {children}
      {visible && pos && createPortal(
        <div
          className={`tool-tooltip ${side}`}
          data-superficie="tooltip"
          data-material="papel"
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="tool-tooltip-header">
            <span className="tool-tooltip-name">{name}</span>
            {shortcut && (
              <kbd className="tool-tooltip-shortcut">{displayShortcut(shortcut)}</kbd>
            )}
          </div>
          {description && (
            <div className={`tool-tooltip-desc${descriptionTone ? ` tool-tooltip-desc--${descriptionTone}` : ''}`}>{description}</div>
          )}
          {hasSubTools && (
            <div className="tool-tooltip-hint">Mantén pulsado para ver variantes</div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
