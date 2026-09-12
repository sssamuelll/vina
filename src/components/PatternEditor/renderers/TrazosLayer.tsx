import { memo } from 'react';
import type { Trazo, TrazoSelection } from '../../../types/types';
import { pathToSVG } from '../utils';
import { getAnchor } from '../nodeEditorUtils';
import { anclasDeTrazo, puntasDeTrazo } from '../trazos/trazoPath';
import AnchorGlyph from './AnchorGlyph';

/**
 * Las líneas de construcción (spec 2026-09-12 § 4): tinta de referencia —la
 * misma que `internalLineColor` da a una interna `'reference'`—, puntas
 * siempre a la vista (lo que el imán encuentra se ve, #1157), tramo
 * seleccionado en acento, y las anclas interiores solo con el trazo
 * seleccionado. Se monta encima de las piezas y debajo de las cotas.
 *
 * Sin hover a propósito: las internas tampoco lo tienen en Seleccionar.
 */
interface TrazosLayerProps {
  trazos: readonly Trazo[];
  seleccion: TrazoSelection | null;
  zoom2D: number;
}

function TrazosLayer({ trazos, seleccion, zoom2D }: TrazosLayerProps) {
  if (trazos.length === 0) return null;
  const guion = `${4 / zoom2D} ${4 / zoom2D}`;
  return (
    <g className="trazos" data-trazos={trazos.length}>
      {trazos.map((trazo) => {
        const tramo = seleccion?.trazoId === trazo.id ? seleccion.segmentIndex : null;
        const cmd = tramo !== null ? trazo.path[tramo] : undefined;
        const inicio = tramo !== null ? getAnchor(trazo.path[tramo - 1]) : null;
        const tramoD = cmd && inicio && (cmd.type === 'L' || cmd.type === 'C' || cmd.type === 'Q')
          ? pathToSVG([{ type: 'M', values: [inicio.x, inicio.y] }, cmd])
          : null;
        const puntos = tramo !== null ? anclasDeTrazo(trazo.path) : (puntasDeTrazo(trazo.path) ?? []);
        return (
          <g key={trazo.id} className="trazo" data-trazo-id={trazo.id}>
            <path
              d={pathToSVG(trazo.path)}
              fill="none"
              stroke="var(--ink-on-light-3)"
              strokeWidth={1 / zoom2D}
              strokeDasharray={guion}
              pointerEvents="none"
            />
            {tramoD && (
              <path
                className="trazo__tramo--seleccionado"
                d={tramoD}
                fill="none"
                stroke="var(--accent-2d)"
                strokeWidth={2 / zoom2D}
                pointerEvents="none"
              />
            )}
            {puntos.map((p, i) => (
              <AnchorGlyph
                key={i}
                role="lineEnd"
                position={p}
                zoom2D={zoom2D}
                state={tramo !== null ? 'selected' : 'idle'}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

export default memo(TrazosLayer);
