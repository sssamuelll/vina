/**
 * EdgeWidthMenu — floating per-edge seam-allowance width input.
 *
 * Appears when the seamAllowance tool is active and the user right-clicks near
 * a piece edge (sibling to CornerTypeMenu, which opens on a vertex). Sets the
 * edge's SemanticEdge.seamAllowanceWidth, or clears it back to inherit the
 * piece-level allowance. Mirrors the CLO3D flow: click an edge, see its width,
 * type a new one.
 *
 * @module EdgeWidthMenu
 */

import { useEffect, useRef, useState } from 'react';

export interface EdgeWidthMenuProps {
  position: { x: number; y: number };
  /** Human-readable edge name (e.g. "hemline", "armhole"). */
  edgeName: string;
  /** Currently effective width for this edge (override or inherited). */
  currentWidth: number;
  /** Whether this edge carries an explicit per-edge override. */
  isOverridden: boolean;
  /** Piece-level seam allowance — shown as the inherit fallback. */
  pieceDefaultWidth: number;
  onApply: (width: number) => void;
  onClear: () => void;
  onClose: () => void;
}

export default function EdgeWidthMenu({
  position,
  edgeName,
  currentWidth,
  isOverridden,
  pieceDefaultWidth,
  onApply,
  onClear,
  onClose,
}: EdgeWidthMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(String(currentWidth));

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const apply = () => {
    const w = parseFloat(value);
    if (!Number.isFinite(w) || w < 0) return;
    onApply(w);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Seam allowance for ${edgeName}`}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
        minWidth: 180,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        padding: 'var(--sp-2)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-primary)',
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--sp-1)' }}>
        Seam allowance · {edgeName}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        <label htmlFor="edge-sa-width" style={{ color: 'var(--text-secondary)' }}>Width (mm)</label>
        <input
          id="edge-sa-width"
          ref={inputRef}
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
          style={{
            width: 64,
            textAlign: 'right',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            padding: '2px var(--sp-1)',
            fontSize: 'var(--text-sm)',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 'var(--sp-1)', marginTop: 'var(--sp-2)' }}>
        <button
          onClick={apply}
          style={{
            flex: 1,
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: '#fff',
            padding: '4px var(--sp-2)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
          }}
        >
          Apply
        </button>
        <button
          onClick={onClear}
          disabled={!isOverridden}
          title={`Inherit the piece allowance (${pieceDefaultWidth}mm)`}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: isOverridden ? 'var(--text-secondary)' : 'var(--text-dim)',
            padding: '4px var(--sp-2)',
            fontSize: 'var(--text-xs)',
            cursor: isOverridden ? 'pointer' : 'default',
          }}
        >
          Inherit ({pieceDefaultWidth})
        </button>
      </div>
    </div>
  );
}
