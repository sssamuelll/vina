import { useDispatch } from 'react-redux';
import { updateSeam, setSeamTension, deactivateSeam, removeSeam, reverseSeam } from '../../store/projectSlice';
import type { Seam } from '../../types/types';
import { applyPctRange, sewnLengthMm } from '../../utils/seam/seamRange';
import { TIPOS_DE_COSTURA } from '../../utils/seam/tiposDeCostura';
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

type SeamHalf = Seam['pieceA'] | Seam['pieceB'];

function usableEdgeLength(lengthMm: number | undefined): lengthMm is number {
  return lengthMm != null && Number.isFinite(lengthMm) && lengthMm > 0;
}

function displayMm(value: number): string {
  // Las cifras significativas esconden ruido binario sin redondear una medida
  // decimal que la patronista escribió de forma deliberada.
  return String(Number(value.toPrecision(12)));
}

function tRangeToMm(edgeLengthMm: number | undefined, half: SeamHalf): [number, number] | null {
  if (!usableEdgeLength(edgeLengthMm)) return null;
  return [
    (half.tStart ?? 0) * edgeLengthMm,
    (half.tEnd ?? 1) * edgeLengthMm,
  ];
}

function clampMmRange(
  startMm: number,
  endMm: number,
  edgeLengthMm: number,
  edited: 'start' | 'end',
): [number, number] {
  const minimumSpanMm = edgeLengthMm / 100;
  let start = Math.min(edgeLengthMm, Math.max(0, startMm));
  let end = Math.min(edgeLengthMm, Math.max(0, endMm));
  if (start >= end) {
    // El control anterior garantizaba al menos 1% de rango; conservarlo evita
    // introducir costuras vacías al cambiar únicamente la unidad visible.
    if (edited === 'start') {
      start = Math.min(start, edgeLengthMm - minimumSpanMm);
      end = start + minimumSpanMm;
    } else {
      end = Math.max(end, minimumSpanMm);
      start = end - minimumSpanMm;
    }
  }
  return [start, end];
}

export default function SeamPropertiesPanel({ seam, pieceAName, pieceBName, edgeALengthMm, edgeBLengthMm, collapsed, onToggle }: SeamPropertiesPanelProps) {
  const dispatch = useDispatch();

  const setHalfRange = (
    halfKey: 'pieceA' | 'pieceB',
    edgeLengthMm: number | undefined,
    startMm: number,
    endMm: number,
    edited: 'start' | 'end',
  ) => {
    if (
      !usableEdgeLength(edgeLengthMm)
      || !Number.isFinite(startMm)
      || !Number.isFinite(endMm)
    ) return;
    const [start, end] = clampMmRange(startMm, endMm, edgeLengthMm, edited);
    dispatch(updateSeam({
      ...seam,
      [halfKey]: applyPctRange(
        seam[halfKey],
        (start / edgeLengthMm) * 100,
        (end / edgeLengthMm) * 100,
      ),
    }));
  };

  const sewnA = usableEdgeLength(edgeALengthMm)
    ? sewnLengthMm(edgeALengthMm, seam.pieceA)
    : undefined;
  const sewnB = usableEdgeLength(edgeBLengthMm)
    ? sewnLengthMm(edgeBLengthMm, seam.pieceB)
    : undefined;
  const mismatch = sewnA != null && sewnB != null && Math.max(sewnA, sewnB) > 0
    ? Math.abs(sewnA - sewnB) / Math.max(sewnA, sewnB)
    : undefined;

  const halves = [
    {
      key: 'pieceA' as const,
      name: pieceAName,
      edgeLengthMm: edgeALengthMm,
      rangeMm: tRangeToMm(edgeALengthMm, seam.pieceA),
      sewn: sewnA,
    },
    {
      key: 'pieceB' as const,
      name: pieceBName,
      edgeLengthMm: edgeBLengthMm,
      rangeMm: tRangeToMm(edgeBLengthMm, seam.pieceB),
      sewn: sewnB,
    },
  ];

  return (
    <PropertySection id="seam-props" title={`Costura: ${pieceAName} ↔ ${pieceBName}`} collapsed={collapsed} onToggle={onToggle}>
      {/* Type dropdown */}
      <div className="panel-field">
        <label>Tipo</label>
        <select
          className="panel-input"
          value={seam.type}
          onChange={e => dispatch(updateSeam({ ...seam, type: e.target.value as Seam['type'] }))}
        >
          {/* Los nombres de la etiqueta de la costura: un término por concepto (P3c). */}
          {TIPOS_DE_COSTURA.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* El rango completo sigue omitiendo tStart/tEnd; los milímetros son
          solo la unidad de la puerta humana, no una segunda representación. */}
      {halves.map(({ key, name, edgeLengthMm, rangeMm, sewn }) => {
        const startMm = rangeMm == null ? '' : displayMm(rangeMm[0]);
        const endMm = rangeMm == null ? '' : displayMm(rangeMm[1]);
        const disabled = rangeMm == null;
        return (
          <div className="panel-field" key={key}>
            <label>Rango cosido — {name}</label>
            <div className="panel-action-row">
              <input
                type="number" className="panel-input narrow"
                min={0} max={edgeLengthMm} step="any" value={startMm}
                disabled={disabled}
                aria-label={`Desde (mm) — ${name}`}
                onChange={e => setHalfRange(
                  key,
                  edgeLengthMm,
                  Number(e.target.value),
                  rangeMm?.[1] ?? 0,
                  'start',
                )}
              />
              <span className="panel-value">–</span>
              <input
                type="number" className="panel-input narrow"
                min={0} max={edgeLengthMm} step="any" value={endMm}
                disabled={disabled}
                aria-label={`Hasta (mm) — ${name}`}
                onChange={e => setHalfRange(
                  key,
                  edgeLengthMm,
                  rangeMm?.[0] ?? 0,
                  Number(e.target.value),
                  'end',
                )}
              />
              <span className="panel-value">mm</span>
              {sewn != null && (
                <span className="panel-value">{displayMm(sewn)} mm cosidos</span>
              )}
            </div>
          </div>
        );
      })}
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
