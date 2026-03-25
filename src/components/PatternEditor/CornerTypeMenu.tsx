/**
 * CornerTypeMenu — right-click context menu for setting seam allowance corner types.
 *
 * Appears when the seamAllowance tool is active and the user right-clicks near
 * a vertex on a piece outline. Allows setting the corner type for a single
 * vertex or all corners on the piece.
 *
 * @module CornerTypeMenu
 */

import { useEffect, useRef } from 'react';
import type { CornerType } from '../../types/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CornerTypeMenuProps {
  position: { x: number; y: number };
  currentType: CornerType;
  onSelectType: (type: CornerType) => void;
  onSetAll: (type: CornerType) => void;
  onClose: () => void;
}

// ─── Corner type labels ───────────────────────────────────────────────────────

const CORNER_TYPES: { type: CornerType; label: string }[] = [
  { type: 'mitered',       label: 'Mitered' },
  { type: 'doubleMitered', label: 'Double Mitered' },
  { type: 'envelope',      label: 'Envelope' },
  { type: 'squared',       label: 'Squared' },
  { type: 'slant',         label: 'Slant' },
  { type: 'match',         label: 'Match' },
  { type: 'trimMirrored',  label: 'Trim Mirrored' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function CornerTypeMenu({
  position,
  currentType,
  onSelectType,
  onSetAll,
  onClose,
}: CornerTypeMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
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
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
        minWidth: 180,
        background: '#2a2a2a',
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
      {/* Header label */}
      <div
        style={{
          padding: '6px 12px 4px',
          fontSize: 11,
          color: '#888',
          borderBottom: '1px solid #333',
          marginBottom: 2,
        }}
      >
        Corner Type
      </div>

      {/* Set All Corners header option */}
      <button
        onClick={() => onSetAll(currentType)}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '6px 12px',
          border: 'none',
          background: 'transparent',
          color: '#e0e0e0',
          cursor: 'pointer',
          fontSize: 13,
          textAlign: 'left',
          gap: 8,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#3a3a3a')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ width: 20, textAlign: 'center', fontSize: 14 }}>⬛</span>
        <span style={{ flex: 1 }}>Set All Corners</span>
      </button>

      {/* Separator */}
      <div style={{ height: 1, background: '#3a3a3a', margin: '2px 8px' }} />

      {/* Individual corner type items */}
      {CORNER_TYPES.map(({ type, label }) => (
        <button
          key={type}
          onClick={() => onSelectType(type)}
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            padding: '6px 12px',
            border: 'none',
            background: 'transparent',
            color: '#e0e0e0',
            cursor: 'pointer',
            fontSize: 13,
            textAlign: 'left',
            gap: 8,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#3a3a3a')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ width: 20, textAlign: 'center', fontSize: 14 }}>
            {type === currentType ? '✓' : ''}
          </span>
          <span style={{ flex: 1 }}>{label}</span>
        </button>
      ))}
    </div>
  );
}
