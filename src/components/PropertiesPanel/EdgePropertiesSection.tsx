import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setEdgesSeamAllowance } from '../../store/projectSlice';

interface Props {
  /** The SA-tool edge selection — one OR many edges (multi-select Shift). */
  items: { pieceId: string; edgeId: string }[];
}

/**
 * Per-edge seam-allowance width for the seamAllowance-tool selection (one or many
 * edges). Commits the whole set on Enter or blur via setEdgesSeamAllowance (one
 * undo entry); Inherit clears the override on all. With divergent values the
 * field shows a `Mixed` placeholder. The controlled buffer re-seeds when the set
 * or its shown value changes — replaces the per-edge `key` remount hack (PR #865).
 */
export default function EdgePropertiesSection({ items }: Props) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);

  const resolved = items
    .map(({ pieceId, edgeId }) => {
      const piece = pieces.find(p => p.id === pieceId);
      const edge = piece?.edges?.find(e => e.id === edgeId);
      if (!piece || !edge) return null;
      const pieceDefault = piece.seamAllowance ?? 0;
      return {
        pieceId, edgeId, edgeName: edge.name, pieceDefault,
        effective: edge.seamAllowanceWidth ?? pieceDefault,
        isOverridden: edge.seamAllowanceWidth != null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  const count = resolved.length;
  const allSame = count > 0 && resolved.every(r => r.effective === resolved[0].effective);
  const displayValue = allSame ? String(resolved[0].effective) : '';
  const anyOverridden = resolved.some(r => r.isOverridden);
  // Set identity + shown value: re-seeds the editing buffer on selection change.
  const setKey = resolved.map(r => `${r.pieceId}:${r.edgeId}`).sort().join('|');

  const [value, setValue] = useState(displayValue);
  useEffect(() => { setValue(displayValue); }, [setKey, displayValue]);

  if (count === 0) return null;

  const commitItems = resolved.map(r => ({ pieceId: r.pieceId, edgeId: r.edgeId }));

  const commit = () => {
    const w = parseFloat(value);
    if (!Number.isFinite(w) || w < 0) { setValue(displayValue); return; }
    dispatch(setEdgesSeamAllowance({ items: commitItems, width: w }));
  };

  const subtitle = count === 1 ? `Borde · ${resolved[0].edgeName}` : `${count} bordes`;

  return (
    <section className="panel-section">
      <div className="panel-subtitle panel-subtitle--spaced">{subtitle}</div>
      <div className="panel-field">
        <label htmlFor="edge-prop-width">Ancho (mm)</label>
        <input
          id="edge-prop-width"
          type="number"
          className="panel-input narrow"
          min={0}
          max={100}
          value={value}
          placeholder={allSame ? undefined : 'Varios'}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          onBlur={commit}
        />
      </div>
      <div className="panel-field panel-field--row">
        <button
          className="panel-chip-btn"
          disabled={!anyOverridden}
          onClick={() => dispatch(setEdgesSeamAllowance({ items: commitItems, width: null }))}
          title={count === 1
            ? `Heredar el margen de la pieza (${resolved[0].pieceDefault}mm)`
            : 'Heredar el margen de la pieza en todos los bordes seleccionados'}
        >
          {count === 1 ? `Heredar (${resolved[0].pieceDefault})` : 'Heredar'}
        </button>
      </div>
    </section>
  );
}
