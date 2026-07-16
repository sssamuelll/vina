import { useDispatch } from 'react-redux';
import { updateSeam, setSeamTension, deactivateSeam, removeSeam, reverseSeam } from '../../store/projectSlice';
import type { Seam } from '../../types/types';
import { applyPctRange, clampPctRange, sewnLengthMm, tRangeToPct } from '../../utils/seam/seamRange';
import PropertySection from './PropertySection';

interface SeamPropertiesPanelProps {
  seam: Seam;
  pieceAName: string;
  pieceBName: string;
  /** Arc length (mm) of each half's edge — undefined when unknown (legacy "edge-N" halves). */
  edgeALengthMm?: number;
  edgeBLengthMm?: number;
  collapsed: boolean;
  onToggle: (id: string) => void;
}

export default function SeamPropertiesPanel({ seam, pieceAName, pieceBName, edgeALengthMm, edgeBLengthMm, collapsed, onToggle }: SeamPropertiesPanelProps) {
  const dispatch = useDispatch();

  const setHalfRange = (halfKey: 'pieceA' | 'pieceB', startPct: number, endPct: number, edited: 'start' | 'end') => {
    const [s, e] = clampPctRange(startPct, endPct, edited);
    dispatch(updateSeam({ ...seam, [halfKey]: applyPctRange(seam[halfKey], s, e) }));
  };

  const sewnA = sewnLengthMm(edgeALengthMm, seam.pieceA);
  const sewnB = sewnLengthMm(edgeBLengthMm, seam.pieceB);
  const mismatch = sewnA != null && sewnB != null && Math.max(sewnA, sewnB) > 0
    ? Math.abs(sewnA - sewnB) / Math.max(sewnA, sewnB)
    : undefined;

  const halves = [
    { key: 'pieceA' as const, name: pieceAName, pct: tRangeToPct(seam.pieceA), sewn: sewnA },
    { key: 'pieceB' as const, name: pieceBName, pct: tRangeToPct(seam.pieceB), sewn: sewnB },
  ];

  return (
    <PropertySection id="seam-props" title={`COSTURA: ${pieceAName} ↔ ${pieceBName}`} collapsed={collapsed} onToggle={onToggle}>
      {/* Type dropdown */}
      <div className="panel-field">
        <label>Tipo</label>
        <select
          className="panel-input"
          value={seam.type}
          onChange={e => dispatch(updateSeam({ ...seam, type: e.target.value as Seam['type'] }))}
        >
          <option value="standard">Estándar</option>
          <option value="french">Francesa</option>
          <option value="flat-felled">Sobrecargada</option>
          <option value="overlock">Overlock</option>
        </select>
      </div>

      {/* Sewn range (CLO3D-style seam extents): how much of each edge is
          sewn, in % along the sewing direction. Full range (0–100) is
          stored as undefined tStart/tEnd — applyPctRange normalizes. */}
      {halves.map(({ key, name, pct: [startPct, endPct], sewn }) => (
        <div className="panel-field" key={key}>
          <label>Rango cosido — {name}</label>
          <div className="panel-action-row">
            <input
              type="number" className="panel-input narrow"
              min={0} max={99} step={1} value={startPct}
              aria-label={`Inicio de rango cosido % (${name})`}
              onChange={e => setHalfRange(key, Number(e.target.value), endPct, 'start')}
            />
            <span className="panel-value">–</span>
            <input
              type="number" className="panel-input narrow"
              min={1} max={100} step={1} value={endPct}
              aria-label={`Fin de rango cosido % (${name})`}
              onChange={e => setHalfRange(key, startPct, Number(e.target.value), 'end')}
            />
            <span className="panel-value">%</span>
            {sewn != null && <span className="panel-value">{(sewn / 10).toFixed(1)} cm cosidos</span>}
          </div>
        </div>
      ))}
      {mismatch !== undefined && mismatch > 0.1 && (
        <div className="panel-field">
          <span className="panel-tension-tag panel-tension-tag--gather">
            Los largos cosidos difieren un {Math.round(mismatch * 100)}% — fruncido/embebido intencional, o ajusta los rangos.
          </span>
        </div>
      )}

      {/* Tension slider */}
      <div className="panel-field">
        <label>
          Tensión{' '}
          {seam.tension < 100
            ? <span className="panel-tension-tag panel-tension-tag--gather">(Fruncido)</span>
            : seam.tension > 100
            ? <span className="panel-tension-tag panel-tension-tag--ease">(Embebido)</span>
            : null}
        </label>
        <input
          type="range" className="panel-slider"
          min={10} max={200} value={seam.tension}
          onChange={e => dispatch(setSeamTension({ seamId: seam.id, tension: Number(e.target.value) }))}
        />
        <span className="panel-value">{seam.tension}%</span>
      </div>

      {/* Shrinkage slider DELETED (Fase 6): it was `100 − tension` rendered
          twice — the same variable as the Tension slider above, with two
          thumbs that fought each other. Gathering/easing intent is already
          labeled on Tension; the copilot keeps `setSeamShrinkage` as a
          semantic alias that maps to tension. */}

      {/* Strength slider */}
      <div className="panel-field">
        <label>Fuerza</label>
        <input
          type="range" className="panel-slider"
          min={1} max={100} value={Math.round(seam.strength * 100)}
          onChange={e => dispatch(setSeamTension({ seamId: seam.id, tension: seam.tension, strength: Number(e.target.value) / 100 }))}
        />
        <span className="panel-value">{seam.strength.toFixed(2)}</span>
      </div>

      {/* Tape toggle */}
      <div className="panel-field">
        <label>
          <input
            type="checkbox" checked={seam.taped}
            onChange={e => dispatch(updateSeam({ ...seam, taped: e.target.checked }))}
          />{' '}
          Encintada
        </label>
        {seam.taped && (
          <input
            type="number" className="panel-input narrow"
            value={seam.tapeWidth} min={3} max={30}
            onChange={e => dispatch(updateSeam({ ...seam, tapeWidth: Number(e.target.value) }))}
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="panel-action-row">
        <button
          className={`panel-chip-btn ${seam.active ? 'panel-chip-btn--destructive' : 'panel-chip-btn--success'}`}
          onClick={() => dispatch(deactivateSeam({ seamId: seam.id, active: !seam.active }))}
        >
          {seam.active ? 'Desactivar' : 'Activar'}
        </button>
        <button
          className="panel-chip-btn"
          onClick={() => dispatch(reverseSeam(seam.id))}
        >
          Invertir
        </button>
        <button
          className="panel-chip-btn panel-chip-btn--destructive"
          onClick={() => dispatch(removeSeam(seam.id))}
        >
          Eliminar costura
        </button>
      </div>
    </PropertySection>
  );
}
