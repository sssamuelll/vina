import { Point2D, UnitSystem } from '../../../types/types';
import { cuadroDeLaCuadricula, primeraLineaDesde } from './cuadricula';
import { PISTA_Y_PORCENTAJE } from './HintText';

interface MarcaDeEscalaProps {
  zoom2D: number;
  pan2D: Point2D;
  gridSize: number;
  units: UnitSystem;
  /** Alto del lienzo en px, medido del elemento SVG. */
  height: number;
  /** Primer px, desde la izquierda, que el cromo deja libre. */
  izquierda: number;
}

/** La marca va esta distancia por encima de la línea base de la frase de ayuda. */
const SOBRE_LA_PISTA_PX = 18;
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
export default function MarcaDeEscala({ zoom2D, pan2D, gridSize, units, height, izquierda }: MarcaDeEscalaProps) {
  const cuadro = cuadroDeLaCuadricula(gridSize, zoom2D, units);
  if (!cuadro || height <= 0) return null;

  const x = primeraLineaDesde(pan2D.x, cuadro.px, izquierda);
  const y = (height * PISTA_Y_PORCENTAJE) / 100 - SOBRE_LA_PISTA_PX;

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
