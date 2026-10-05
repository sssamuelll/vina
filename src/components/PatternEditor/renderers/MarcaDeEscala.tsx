import { Point2D, UnitSystem } from '../../../types/types';
import { cuadroDeLaCuadricula, primeraLineaDesde, ultimaLineaHasta } from './cuadricula';

interface MarcaDeEscalaProps {
  zoom2D: number;
  pan2D: Point2D;
  gridSize: number;
  units: UnitSystem;
  /** Primer px, desde la izquierda, que el cromo deja libre. */
  izquierda: number;
  /** Alto de la hoja en px: la marca va al pie. */
  alto: number;
}

/**
 * Lo que la marca deja hasta el pie de la hoja, sobre la línea al pie (spec
 * § 4.4). Arriba estuvo mientras la barra de IA y la fila de capas flotaban
 * abajo; desde P2c ya no hay nada en reposo que la tape.
 */
const AIRE_AL_PIE_PX = 24;
const ALTO_DEL_CORCHETE_PX = 5;

/**
 * La marca de escala: dice cuánto mide un cuadro de la cuadrícula (spec
 * 2026-10-02 «la interfaz en papel» § 4.4). Sustituye a las reglas numeradas,
 * que enseñaban coordenadas de una hoja cuyo origen es arbitrario.
 *
 * Un corchete que mide exactamente un cuadro, apoyado sobre una línea de la
 * cuadrícula, y su valor en la unidad activa. Espacio de pantalla, como
 * GridLayer. Es documento, no cromo: no recibe el ratón.
 */
export default function MarcaDeEscala({ zoom2D, pan2D, gridSize, units, izquierda, alto }: MarcaDeEscalaProps) {
  const cuadro = cuadroDeLaCuadricula(gridSize, zoom2D, units);
  if (!cuadro) return null;

  const x = primeraLineaDesde(pan2D.x, cuadro.px, izquierda);
  const y = ultimaLineaHasta(pan2D.y, cuadro.px, alto - AIRE_AL_PIE_PX);

  return (
    <g
      className="marca-de-escala"
      pointerEvents="none"
      data-superficie="documento"
      role="img"
      aria-label={`Escala: un cuadro mide ${cuadro.rotulo}`}
    >
      <path
        d={`M ${x} ${y - ALTO_DEL_CORCHETE_PX} L ${x} ${y} L ${x + cuadro.px} ${y} L ${x + cuadro.px} ${y - ALTO_DEL_CORCHETE_PX}`}
        fill="none"
        style={{ stroke: 'var(--ink-hint)' }}
        strokeWidth={1}
      />
      <text
        x={x + cuadro.px + 7}
        y={y}
        style={{ fill: 'var(--ink-hint)', fontFamily: 'var(--font-mono-2d)' }}
        fontSize={11}
      >
        {cuadro.rotulo}
      </text>
    </g>
  );
}
