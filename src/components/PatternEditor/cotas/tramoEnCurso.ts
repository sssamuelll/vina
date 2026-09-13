import type { Point2D } from '../../../types/types';
import { polarPoint } from '../polyPenGeometry';
import type { Cota } from './cotas';
import { ABSOLUTE_REFERENCE, absoluteAngle, angleReferenceLabel, relativeAngle, type AngleReference } from '../angleReference';

/** El tramo congelado: desde dónde y con qué largo y ángulo de partida. */
export interface TramoEnCurso {
  from: Point2D;
  lengthMm: number;
  angleDeg: number;
  reference?: AngleReference;
}

/**
 * Pareja Largo/Ángulo del tramo congelado (D2/D6, #1161). El grupo comparte
 * una sola edición: Tab y clic entre campos conservan el par; Enter coloca.
 * `apply` devuelve geometría absoluta al hook vivo mediante PatternEditor.
 * La referencia transforma solo la presentación angular. Al ser una intención
 * pendiente y no un objeto existente, ninguno de sus campos admite scrub.
 */
export function cotasDelTramoEnCurso(tramo: TramoEnCurso): Cota[] {
  const { from, lengthMm, angleDeg } = tramo;
  const reference = tramo.reference ?? ABSOLUTE_REFERENCE;
  const to = polarPoint(from, lengthMm, angleDeg);

  // Hacia fuera del propio tramo: no hay pieza de la que salir, así que la
  // normal se toma a la izquierda del sentido de avance y basta — los dos chips
  // se separan después sobre la tangente, que es lo que evita que se pisen.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const largo = Math.hypot(dx, dy);
  const outward: Point2D = largo < 1e-9
    ? { x: 0, y: -1 }
    : { x: -dy / largo, y: dx / largo };

  // `confirmaSinCambio`: aquí confirmar no escribe un valor, COLOCA un punto.
  // Enter con el número que ya se ve tiene que colocar igual.
  const base = {
    a: from, b: to, outward, primary: true, scrub: false,
    grupo: 'tramo-en-curso',
    rotulo: 'del tramo', confirmaSinCambio: true,
  };

  return [
    {
      ...base,
      id: 'tramo-en-curso-largo',
      kind: 'tramo-largo',
      label: 'Largo',
      valueMm: lengthMm,
      unit: 'mm',
      min: 0.1,
      max: 10000,
      apply: (v) => ({ kind: 'tramoEnCurso', largoMm: v, anguloDeg: angleDeg }),
    },
    {
      ...base,
      id: 'tramo-en-curso-angulo',
      kind: 'tramo-angulo',
      label: 'Ángulo',
      referenceLabel: angleReferenceLabel(reference),
      valueMm: relativeAngle(angleDeg, reference),
      unit: 'deg',
      min: -360,
      max: 360,
      apply: (v) => ({ kind: 'tramoEnCurso', largoMm: lengthMm, anguloDeg: absoluteAngle(v, reference) }),
    },
  ];
}
