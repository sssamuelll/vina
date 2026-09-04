import type { UnitSystem } from '../../../types/types';

/**
 * Pure tick generation for the 2D-canvas rulers (design surface 5, P0.4).
 *
 * Pattern space is millimeters; the visible mapping is screenPx = panPx + vMm * zoom2D
 * (the same transform GridLayer and screenToPattern use). Major ticks land every
 * `minorPerMajor` grid steps (10 → every 10cm), minor ticks every grid step (1cm).
 *
 * Las marcas se ralean en tres peldaños según el zoom, y cada peldaño usa la
 * misma guarda: menor → mayor → paso del rótulo. El paso del RÓTULO es el que
 * escala por la escalera 1-2-5 (revisión de UI del 2026-09-04, hallazgo F6):
 * antes estaba clavado en `minorPerMajor` y al encuadrar el patrón de María
 * (zoom 0,244) los números salían pegados, "-1200110010009008007…".
 */
export interface RulerTick {
  /** Position along the ruler, in screen px from the gutter origin. */
  posPx: number;
  /** Pattern coordinate in mm. */
  vMm: number;
  isMajor: boolean;
  /** Compact label (no unit suffix), present only on major ticks. */
  label: string | null;
}

export interface RulerTickParams {
  /** Visible length of the ruler in px (viewport width for the top ruler, height for the left). */
  lengthPx: number;
  /** Screen px offset of pattern origin along this axis (pan2D.x or pan2D.y). */
  panPx: number;
  zoom2D: number;
  /** Minor grid step in mm (editor.gridSize, default 10 = 1cm). */
  gridSizeMm: number;
  units: UnitSystem;
  /** Major tick every N minor steps. Default 10 (→ 10cm majors on a 1cm grid). */
  minorPerMajor?: number;
  /** Minor ticks closer than this (px) are dropped. Default 7. */
  minMinorGapPx?: number;
  /**
   * Dos rótulos consecutivos nunca quedan más cerca que esto, en px. Por
   * defecto 44: el rótulo más ancho que se ve de verdad es "-1200" en mm —
   * 5 glifos de la monoespaciada de 9 px ≈ 27 px— y quedan ~17 px de aire.
   */
  minMajorGapPx?: number;
}

/** Compact tick label without unit suffix (the unit is shown once on the gutter corner). */
export function formatRulerLabel(vMm: number, units: UnitSystem): string {
  switch (units) {
    case 'inches': {
      const inches = vMm / 25.4;
      return trimZero(inches.toFixed(1));
    }
    case 'mm':
      return String(Math.round(vMm));
    case 'cm':
    default:
      return trimZero((vMm / 10).toFixed(1));
  }
}

function trimZero(s: string): string {
  return s.replace(/\.0$/, '');
}

/** Peldaños de la escalera 1-2-5, que se repiten por décadas: 1, 2, 5, 10, 20, 50… */
const PELDANOS_125 = [1, 2, 5];

/**
 * Sube `baseMm` por la escalera 1-2-5 (×1, ×2, ×5, ×10, ×20, ×50…) hasta que dos
 * pasos consecutivos queden a `minGapPx` o más en pantalla, como escala la regla
 * de cualquier CAD.
 *
 * La escalera va en el MULTIPLICADOR, no en el valor absoluto en mm, para que el
 * resultado sea siempre un número entero de celdas de la cuadrícula. Si fuera
 * absoluta, con una cuadrícula de 3 mm el paso saltaría a 50 y el rótulo caería
 * entre dos marcas: una regla sin ningún número encima de una marca.
 */
function subirEscalera125(baseMm: number, zoom2D: number, minGapPx: number): number {
  let mult = 1;
  // 30 peldaños llegan a ×5·10⁹; el tope solo está para que el bucle termine.
  for (let i = 1; i < 30 && baseMm * mult * zoom2D < minGapPx; i++) {
    mult = PELDANOS_125[i % 3] * 10 ** Math.floor(i / 3);
  }
  return baseMm * mult;
}

export function generateRulerTicks(params: RulerTickParams): RulerTick[] {
  const {
    lengthPx, panPx, zoom2D, gridSizeMm,
    units, minorPerMajor = 10, minMinorGapPx = 7, minMajorGapPx = 44,
  } = params;

  if (lengthPx <= 0 || zoom2D <= 0 || gridSizeMm <= 0) return [];

  const minorStepMm = gridSizeMm;
  const majorStepMm = gridSizeMm * minorPerMajor;
  // El paso mayor sigue marcando la marca larga; el del rótulo escala aparte
  // hasta que el número quepa. Siempre es múltiplo del mayor, así que todo
  // rótulo cae sobre una marca larga y sobre un múltiplo de la cuadrícula.
  const labelStepMm = subirEscalera125(majorStepMm, zoom2D, minMajorGapPx);

  // Visible pattern range along this axis.
  const vStart = (0 - panPx) / zoom2D;
  const vEnd = (lengthPx - panPx) / zoom2D;

  // Se emite el paso más fino que no se amontone: menor, mayor, o el del
  // rótulo. El último siempre pasa la guarda, porque su hueco mínimo (44 px)
  // es mucho mayor que el de las menores (7 px).
  let step = labelStepMm;
  if (minorStepMm * zoom2D >= minMinorGapPx) step = minorStepMm;
  else if (majorStepMm * zoom2D >= minMinorGapPx) step = majorStepMm;

  const first = Math.ceil(vStart / step) * step;

  const ticks: RulerTick[] = [];
  // Round-trip through integers to avoid float drift deciding major-ness.
  // `-1200 % 200` da -0 en JS, pero `-0 === 0`, así que el signo no molesta.
  for (let v = first; v <= vEnd; v += step) {
    const vR = Math.round(v);
    const isMajor = vR % majorStepMm === 0;
    ticks.push({
      posPx: panPx + v * zoom2D,
      vMm: v,
      isMajor,
      label: vR % labelStepMm === 0 ? formatRulerLabel(v, units) : null,
    });
  }
  return ticks;
}
