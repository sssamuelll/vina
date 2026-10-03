import { Point2D, UnitSystem } from '../../../types/types';
import { cuadroDeLaCuadricula, primeraLineaDesde } from './cuadricula';

interface MarcaDeEscalaProps {
  zoom2D: number;
  pan2D: Point2D;
  gridSize: number;
  units: UnitSystem;
  /** Primer px, desde la izquierda, que el cromo deja libre. */
  izquierda: number;
}

/**
 * La base del corchete y del rótulo, desde arriba: dentro de los 20 px que
 * ocupaba la regla y por encima de la tira de herramienta, que empieza a 28.
 * Abajo, mientras la barra de IA y la fila de capas floten, no hay sitio que
 * no tapen con un panel abierto a la izquierda; cuando P2 las quite, la marca
 * baja a donde dice la spec § 4.4.
 */
const LINEA_BASE_PX = 16;
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
export default function MarcaDeEscala({ zoom2D, pan2D, gridSize, units, izquierda }: MarcaDeEscalaProps) {
  const cuadro = cuadroDeLaCuadricula(gridSize, zoom2D, units);
  if (!cuadro) return null;

  const x = primeraLineaDesde(pan2D.x, cuadro.px, izquierda);
  const y = LINEA_BASE_PX;

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
