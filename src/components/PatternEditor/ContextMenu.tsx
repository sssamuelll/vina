/**
 * ContextMenu — right-click context menu for the 2D Pattern Editor canvas.
 *
 * Shows different options depending on what's under the cursor:
 * - On a piece: Rotate, Flip H/V, Duplicate, Delete, Rename
 * - On empty canvas: Paste, Add Piece, Zoom to Fit
 *
 * @module ContextMenu
 */

import { useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
  removePiece,
  rotatePiece,
  duplicatePiece,
  flipPieceH,
  flipPieceV,
} from '../../store/projectSlice';
import { selectPiece, clearSelection } from '../../store/editorSlice';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  /** ID of piece under cursor, or null for empty canvas */
  pieceId: string | null;
  pieceName?: string;
  /** Segment command index for convert options (set when right-clicking in edit pattern mode) */
  segmentIndex?: number;
  /** Whether the segment is currently a curve */
  segmentIsCurve?: boolean;
}

interface ContextMenuProps {
  menu: ContextMenuState;
  onClose: () => void;
  onRename?: (pieceId: string) => void;
  onConvertSegment?: (commandIndex: number, toCurve: boolean) => void;
}

// ─── Menu Items ─────────────────────────────────────────────────────────────

interface MenuItem {
  label: string;
  icon: string;
  shortcut?: string;
  action: () => void;
  separator?: boolean;
  danger?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ContextMenu({ menu, onClose, onRename, onConvertSegment }: ContextMenuProps) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    if (!menu.visible) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu.visible, onClose]);

  const act = useCallback((fn: () => void) => {
    fn();
    onClose();
  }, [onClose]);

  if (!menu.visible) return null;

  const items: MenuItem[] = [];

  if (menu.segmentIndex !== undefined) {
    items.push({
      label: menu.segmentIsCurve ? 'Convert to Line' : 'Convert to Curve',
      icon: menu.segmentIsCurve ? '─' : '⌒',
      action: () => { onConvertSegment?.(menu.segmentIndex!, !menu.segmentIsCurve); onClose(); },
      separator: true,
    });
  }

  if (menu.pieceId) {
    // ── Piece context ──
    const pid = menu.pieceId;

    // Find current rotation to add to it
    const currentRotation = pieces?.find(p => p.id === pid)?.rotation ?? 0;

    items.push({
      label: 'Rotate 90°',
      icon: '↻',
      shortcut: 'R',
      action: () => act(() => dispatch(rotatePiece({ id: pid, rotation: currentRotation + 90 }))),
    });
    items.push({
      label: 'Rotate 180°',
      icon: '↻',
      action: () => act(() => dispatch(rotatePiece({ id: pid, rotation: currentRotation + 180 }))),
    });
    items.push({
      label: 'Rotate -90°',
      icon: '↺',
      action: () => act(() => dispatch(rotatePiece({ id: pid, rotation: currentRotation - 90 }))),
      separator: true,
    });
    items.push({
      label: 'Flip Horizontal',
      icon: '↔',
      shortcut: 'H',
      action: () => act(() => dispatch(flipPieceH(pid))),
    });
    items.push({
      label: 'Flip Vertical',
      icon: '↕',
      shortcut: 'V',
      action: () => act(() => dispatch(flipPieceV(pid))),
      separator: true,
    });
    items.push({
      label: 'Duplicate',
      icon: '⧉',
      shortcut: 'Ctrl+D',
      action: () => act(() => dispatch(duplicatePiece(pid))),
    });
    items.push({
      label: 'Rename…',
      icon: '✏️',
      shortcut: 'F2',
      action: () => act(() => onRename?.(pid)),
      separator: true,
    });
    items.push({
      label: 'Select',
      icon: '☐',
      action: () => act(() => dispatch(selectPiece(pid))),
    });
    items.push({
      label: 'Delete',
      icon: '🗑',
      shortcut: 'Del',
      action: () => act(() => dispatch(removePiece(pid))),
      danger: true,
    });
  } else {
    // ── Empty canvas context ──
    items.push({
      label: 'Deselect All',
      icon: '☐',
      shortcut: 'Esc',
      action: () => act(() => dispatch(clearSelection())),
    });
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: menu.x,
        top: menu.y,
        zIndex: 1000,
        minWidth: 180,
        background: '#1e1e1e',
        border: '1px solid #3a3a3a',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        padding: '4px 0',
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        fontSize: 13,
        color: '#e0e0e0',
        userSelect: 'none',
      }}
    >
      {menu.pieceId && (
        <div style={{
          padding: '6px 12px 4px',
          fontSize: 11,
          color: '#888',
          borderBottom: '1px solid #333',
          marginBottom: 2,
        }}>
          {menu.pieceName || menu.pieceId}
        </div>
      )}
      {items.map((item, i) => (
        <div key={i}>
          <button
            onClick={item.action}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: '6px 12px',
              border: 'none',
              background: 'transparent',
              color: item.danger ? '#ff6b6b' : '#e0e0e0',
              cursor: 'pointer',
              fontSize: 13,
              textAlign: 'left',
              gap: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#2d2d2d')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ width: 20, textAlign: 'center', fontSize: 14 }}>{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.shortcut && (
              <span style={{ fontSize: 11, color: '#666', marginLeft: 12 }}>{item.shortcut}</span>
            )}
          </button>
          {item.separator && (
            <div style={{ height: 1, background: '#333', margin: '2px 8px' }} />
          )}
        </div>
      ))}
    </div>
  );
}
