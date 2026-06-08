import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setEdgeSeamAllowance } from '../../store/projectSlice';

interface Props {
  pieceId: string;
  edgeId: string;
}

/**
 * Per-edge seam-allowance width, edited in the docked panel (the property home,
 * bound to the seamAllowance-tool edge selection). Commits on Enter or blur;
 * Inherit clears the override back to the piece-level allowance.
 */
export default function EdgePropertiesSection({ pieceId, edgeId }: Props) {
  const dispatch = useDispatch();
  const piece = useSelector((s: RootState) => s.project.pieces.find(p => p.id === pieceId));
  const edge = piece?.edges?.find(e => e.id === edgeId);
  const pieceDefault = piece?.seamAllowance ?? 0;
  const effective = edge?.seamAllowanceWidth ?? pieceDefault;
  const isOverridden = edge?.seamAllowanceWidth != null;
  const [value, setValue] = useState(String(effective));

  if (!piece || !edge) return null;

  const commit = () => {
    const w = parseFloat(value);
    if (!Number.isFinite(w) || w < 0) { setValue(String(effective)); return; }
    dispatch(setEdgeSeamAllowance({ pieceId, edgeId, width: w }));
  };

  return (
    <section className="panel-section">
      <div className="panel-subtitle panel-subtitle--spaced">Edge · {edge.name}</div>
      <div className="panel-field">
        <label htmlFor="edge-prop-width">Width (mm)</label>
        <input
          id="edge-prop-width"
          type="number"
          className="panel-input narrow"
          min={0}
          max={100}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          onBlur={commit}
        />
      </div>
      <div className="panel-field panel-field--row">
        <button
          className="panel-chip-btn"
          disabled={!isOverridden}
          onClick={() => dispatch(setEdgeSeamAllowance({ pieceId, edgeId, width: null }))}
          title={`Inherit the piece allowance (${pieceDefault}mm)`}
        >
          Inherit ({pieceDefault})
        </button>
      </div>
    </section>
  );
}
