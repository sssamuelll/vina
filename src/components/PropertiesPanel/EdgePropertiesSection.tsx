import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { piezaBloqueada } from '../../utils/piezaBloqueada';
import {
  removeEdgeSeamAllowanceSpan,
  setEdgesSeamAllowance,
  updateEdgeSeamAllowanceSpan,
} from '../../store/projectSlice';
import type { SeamAllowanceSpan } from '../../types/types';
import { computePathArcLength } from '../../utils/geometry/arcLength';

interface Props {
  /** La selección del margen admite uno o varios bordes con Shift. */
  items: { pieceId: string; edgeId: string }[];
}

interface SpanFieldsProps {
  index: number;
  span: SeamAllowanceSpan;
  edgeLengthMm: number;
  onCommit: (span: SeamAllowanceSpan) => void;
  onRemove: () => void;
}

function displayMm(value: number): string {
  if (!Number.isFinite(value)) return '';
  // Doce cifras significativas esconden el ruido binario sin convertir 47,3
  // en 47 ni cambiar el valor almacenado mientras nadie edite el campo.
  return String(Number(value.toPrecision(12)));
}

function spanDraft(span: SeamAllowanceSpan, edgeLengthMm: number) {
  return {
    from: displayMm(span.tStart * edgeLengthMm),
    to: displayMm(span.tEnd * edgeLengthMm),
    width: displayMm(span.width),
  };
}

function SpanFields({ index, span, edgeLengthMm, onCommit, onRemove }: SpanFieldsProps) {
  const [draft, setDraft] = useState(() => spanDraft(span, edgeLengthMm));

  useEffect(() => {
    setDraft(spanDraft(span, edgeLengthMm));
  }, [span, edgeLengthMm]);

  const reset = () => setDraft(spanDraft(span, edgeLengthMm));
  const commit = () => {
    const fromMm = Number(draft.from);
    const toMm = Number(draft.to);
    const width = Number(draft.width);
    if (
      edgeLengthMm <= 0
      || ![fromMm, toMm, width].every(Number.isFinite)
      || fromMm < 0
      || toMm > edgeLengthMm
      || fromMm >= toMm
      || width < 0
      || (toMm - fromMm) / edgeLengthMm < 0.01
    ) {
      reset();
      return;
    }

    const next = {
      tStart: fromMm / edgeLengthMm,
      tEnd: toMm / edgeLengthMm,
      width,
    };
    if (
      next.tStart === span.tStart
      && next.tEnd === span.tEnd
      && next.width === span.width
    ) return;
    onCommit(next);
  };

  const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Blur es la única puerta de commit para que Enter no cree dos entradas de
    // deshacer cuando el foco abandone el campo un instante después.
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const suffix = index + 1;
  return (
    <div className="panel-subblock">
      <div className="panel-subtitle">Tramo {suffix}</div>
      <div className="panel-field">
        <label htmlFor={`edge-span-${index}-from`}>Desde (mm)</label>
        <input
          id={`edge-span-${index}-from`}
          type="number"
          className="panel-input narrow"
          min={0}
          max={edgeLengthMm}
          step="any"
          disabled={edgeLengthMm <= 0}
          value={draft.from}
          onChange={event => setDraft(current => ({ ...current, from: event.target.value }))}
          onKeyDown={blurOnEnter}
          onBlur={commit}
        />
      </div>
      <div className="panel-field">
        <label htmlFor={`edge-span-${index}-to`}>Hasta (mm)</label>
        <input
          id={`edge-span-${index}-to`}
          type="number"
          className="panel-input narrow"
          min={0}
          max={edgeLengthMm}
          step="any"
          disabled={edgeLengthMm <= 0}
          value={draft.to}
          onChange={event => setDraft(current => ({ ...current, to: event.target.value }))}
          onKeyDown={blurOnEnter}
          onBlur={commit}
        />
      </div>
      <div className="panel-field">
        <label htmlFor={`edge-span-${index}-width`}>Margen (mm)</label>
        <input
          id={`edge-span-${index}-width`}
          type="number"
          className="panel-input narrow"
          min={0}
          max={100}
          step="any"
          value={draft.width}
          onChange={event => setDraft(current => ({ ...current, width: event.target.value }))}
          onKeyDown={blurOnEnter}
          onBlur={commit}
        />
      </div>
      <div className="panel-field panel-field--row">
        <button
          type="button"
          className="panel-chip-btn panel-chip-btn--destructive"
          onClick={onRemove}
        >
          Eliminar tramo
        </button>
      </div>
    </div>
  );
}

/**
 * El ancho del borde sigue admitiendo selección múltiple. Los tramos aparecen
 * solo con un borde, porque un índice no identifica la misma zona en dos arcos.
 */
export default function EdgePropertiesSection({ items }: Props) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const layerLocked = useSelector((s: RootState) => s.project.layerLocked);

  const resolved = items
    .map(({ pieceId, edgeId }) => {
      const piece = pieces.find(candidate => candidate.id === pieceId);
      const edge = piece?.edges?.find(candidate => candidate.id === edgeId);
      if (!piece || !edge) return null;
      const pieceDefault = piece.seamAllowance ?? 0;
      return {
        piece,
        edge,
        pieceId,
        edgeId,
        edgeName: edge.name,
        pieceDefault,
        effective: edge.seamAllowanceWidth ?? pieceDefault,
        isOverridden: edge.seamAllowanceWidth != null,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value != null);

  const count = resolved.length;
  // #1136: el panel es la segunda puerta de escritura del margen. Con varios
  // bordes basta UNA pieza bloqueada para apagar: el commit es un solo dispatch
  // sobre todos, y no hay forma de escribirle a la mitad de la selección.
  const bloqueado = resolved.some(item => piezaBloqueada(item.piece, layerLocked));
  const allSame = count > 0 && resolved.every(item => item.effective === resolved[0].effective);
  const displayValue = allSame ? String(resolved[0].effective) : '';
  const anyOverridden = resolved.some(item => item.isOverridden);
  const setKey = resolved.map(item => `${item.pieceId}:${item.edgeId}`).sort().join('|');

  const [value, setValue] = useState(displayValue);
  useEffect(() => { setValue(displayValue); }, [setKey, displayValue]);

  if (count === 0) return null;

  const commitItems = resolved.map(item => ({ pieceId: item.pieceId, edgeId: item.edgeId }));
  const spanTarget = count === 1 ? resolved[0] : null;
  const spans = spanTarget?.edge.seamAllowanceSpans ?? [];
  const edgeLengthMm = spanTarget
    ? (
        Number.isFinite(spanTarget.edge.length)
          ? Math.max(0, spanTarget.edge.length ?? 0)
          : computePathArcLength(
              spanTarget.piece.outline,
              spanTarget.edge.segmentRange[0],
              spanTarget.edge.segmentRange[1],
            )
      )
    : 0;

  const commitWidth = () => {
    if (bloqueado) {
      setValue(displayValue);
      return;
    }
    const width = parseFloat(value);
    if (!Number.isFinite(width) || width < 0) {
      setValue(displayValue);
      return;
    }
    dispatch(setEdgesSeamAllowance({ items: commitItems, width }));
  };

  // #1106 punto 5: «el panel de borde no enseña ids ni nombres de objeto;
  // enseña "Borde 3 · margen 20 mm"». El número es el orden del borde en la
  // pieza, no su id ni su nombre semántico en inglés (`armhole`, `hem`).
  const numeroDeBorde = count === 1
    ? (resolved[0].piece.edges ?? []).findIndex(e => e.id === resolved[0].edgeId) + 1
    : 0;
  const enMm = (n: number) => String(n).replace('.', ',');
  const subtitle = count === 1
    ? `Borde ${numeroDeBorde} · margen ${enMm(resolved[0].effective)} mm`
    : `${count} bordes`;
  const widthLabel = spans.length > 0
    ? 'Margen fuera de los tramos (mm)'
    : 'Margen (mm)';

  return (
    <section className="panel-section">
      <div className="panel-subtitle panel-subtitle--spaced">{subtitle}</div>
      <div className="panel-field">
        <label htmlFor="edge-prop-width">{widthLabel}</label>
        <input
          id="edge-prop-width"
          type="number"
          className="panel-input narrow"
          min={0}
          max={100}
          value={value}
          placeholder={allSame ? undefined : 'Varios'}
          disabled={bloqueado}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') commitWidth(); }}
          onBlur={commitWidth}
        />
      </div>
      {bloqueado && (
        <div className="panel-hint">
          {count === 1
            ? 'Esta pieza está bloqueada; quítale el candado para cambiarle el margen'
            : 'Alguna de estas piezas está bloqueada; quítale el candado para cambiarles el margen'}
        </div>
      )}
      {!anyOverridden && displayValue !== '' && value === displayValue && (
        <div className="panel-hint">
          {count === 1 ? 'Este borde usa el margen de la pieza' : 'Estos bordes usan el margen de la pieza'}
        </div>
      )}
      <div className="panel-field panel-field--row">
        <button
          className="panel-chip-btn"
          disabled={bloqueado || !anyOverridden}
          onClick={() => dispatch(setEdgesSeamAllowance({ items: commitItems, width: null }))}
          title={count === 1
            ? `Usar el margen de la pieza (${String(resolved[0].pieceDefault).replace('.', ',')} mm)`
            : 'Usar el margen de la pieza en todos los bordes seleccionados'}
        >
          {count === 1 ? `Usar el de la pieza (${String(resolved[0].pieceDefault).replace('.', ',')})` : 'Usar el de la pieza'}
        </button>
        <button
          className="panel-chip-btn"
          disabled={bloqueado}
          onClick={() => dispatch(setEdgesSeamAllowance({ items: commitItems, width: 0 }))}
        >
          Sin margen
        </button>
      </div>

      {spanTarget && spans.length > 0 && !bloqueado && (
        <div className="panel-subblock">
          <div className="panel-subtitle">Tramos del margen</div>
          {spans.map((span, index) => (
            <SpanFields
              key={`${spanTarget.edgeId}:${index}`}
              index={index}
              span={span}
              edgeLengthMm={edgeLengthMm}
              onCommit={next => dispatch(updateEdgeSeamAllowanceSpan({
                pieceId: spanTarget.pieceId,
                edgeId: spanTarget.edgeId,
                spanIndex: index,
                span: next,
              }))}
              onRemove={() => dispatch(removeEdgeSeamAllowanceSpan({
                pieceId: spanTarget.pieceId,
                edgeId: spanTarget.edgeId,
                spanIndex: index,
              }))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
