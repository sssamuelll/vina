import type { InternalLine, PathCommand, PatternPiece, Point2D } from '../../../types/types';
import { buildRing, pointAt, projectToRing } from '../../../utils/geometry/outlineRing';
import { getEdgeEndpoints } from '../../../utils/geometry/path';
import { arcToNativeT } from '../../../utils/geometry/arcToNative';
import { computeBoundingBox, bboxPivot } from '../../../utils/geometry/transform';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import { detectCorners, resolveNotchAnchor } from '../../../utils/notchAnchor';
import { DEFAULT_NOTCH_OPTIONS } from '../../../utils/notches';
import type { NotchRefineState } from '../useNotchTool';
import type { PuntoPuesto } from '../usePointTool';
import { normalHaciaFuera, type Cota } from './cotas';
import { formatMedida } from './parseMedida';

/**
 * La cota de lo que se pone (spec 2026-10-02 § 5.2): el piquete y el punto,
 * al ponerse, enseñan la distancia a la esquina sobre el borde y se terminan
 * de poner ahí mismo. Sustituye al modal del piquete.
 */

/** Desde qué esquina y hacia dónde se cuenta: lo que guarda un `notchAnchor`. */
export interface Cuenta {
  refPoint: Point2D;
  direction: 'cw' | 'ccw';
}

/**
 * Cuánto mide el lado sobre el que se cuenta: de la esquina de referencia a la
 * siguiente, en el sentido de la cuenta. Es el «de 520 mm» que se lee junto
 * al número. `null` sin anillo o con varios subtrazos; sin otra esquina, el
 * perímetro.
 */
export function largoDelLado(outline: PathCommand[], cuenta: Cuenta): number | null {
  const built = buildRing(outline, 2);
  if (!built.ok || built.value.subpathCount > 1) return null;
  const ring = built.value;
  const total = ring.totalMm;
  if (total < 1e-9) return null;
  const desde = projectToRing(ring, cuenta.refPoint).distanceMm;
  const tramos = detectCorners(outline)
    .map(esquina => {
      const s = projectToRing(ring, esquina).distanceMm;
      const d = cuenta.direction === 'cw' ? s - desde : desde - s;
      return ((d % total) + total) % total;
    })
    .filter(d => d > 1e-6);
  return tramos.length > 0 ? Math.min(...tramos) : total;
}

/** El centro de la caja de la pieza, para saber cuál es su lado de fuera (como `cotasDelLado`). */
export function centroDe(piece: PatternPiece): Point2D {
  const bbox = computeBoundingBox([piece], [piece.id]);
  return bbox ? bboxPivot(bbox) : pieceLocalToPattern({ x: 0, y: 0 }, piece);
}

/**
 * El piquete recién puesto, o el de «Ajustar distancia…»: Distancia y
 * Profundidad en un solo chip. La distancia mueve el fantasma con cada tecla.
 * La profundidad se queda aquí también después de P3c: la etiqueta del
 * piquete solo existe para el ELEGIDO con Seleccionar, y sin este campo el
 * recién puesto no tendría puerta a la suya (revisión final de P3c). Cada
 * campo escribe con el valor de ahora del otro: el path sale de los dos.
 */
export function cotasDelPiquete(
  r: NotchRefineState,
  piece: PatternPiece,
  enVivo: { alEscribir(mm: number | null): void; alCerrar(): void },
): Cota[] {
  const anchor = r.notch.notchAnchor;
  if (!anchor) return [];
  const profundidad = r.notch.notchOptions?.length ?? DEFAULT_NOTCH_OPTIONS.length;
  const lado = largoDelLado(piece.outline, anchor);
  // El hilo va al piquete PUESTO, no al fantasma: anclado al fantasma, el campo
  // saltaba con cada tecla. El fantasma lo pinta la marca del lienzo.
  const b = r.notchWorld;
  const comun = {
    grupo: 'piquete',
    primary: true,
    scrub: false,
    a: r.refWorld,
    b,
    outward: normalHaciaFuera(r.refWorld, b, centroDe(piece)),
  };
  return [
    {
      ...comun,
      id: 'piquete-distancia',
      kind: 'borde',
      label: 'Distancia',
      valueMm: anchor.distanceMm,
      unit: 'mm',
      min: 0,
      // El lado, el mismo que se lee («de 300 mm»), medido del contorno vivo
      // (#1124). Una distancia ya guardada más allá —la dejaba el modal, que
      // envolvía hasta el perímetro— no queda atrapada; sin lado que medir
      // (una pieza con agujero), el perímetro.
      max: lado !== null ? Math.max(lado, anchor.distanceMm) : r.maxDistanceMm,
      ...(lado !== null ? { referenceLabel: `de ${formatMedida(lado, 'mm')}` } : {}),
      alEscribir: enVivo.alEscribir,
      alCerrar: enVivo.alCerrar,
      apply: (mm) => ({ kind: 'piquete', distanciaMm: mm, profundidadMm: profundidad }),
    },
    {
      ...comun,
      id: 'piquete-profundidad',
      kind: 'profundidad',
      label: 'Profundidad',
      valueMm: profundidad,
      unit: 'mm',
      // Los de § 5.2: los del panel de hoy, para que ningún valor guardado quede fuera.
      min: 1,
      max: 30,
      apply: (mm) => ({ kind: 'piquete', distanciaMm: anchor.distanceMm, profundidadMm: mm }),
    },
  ];
}

/**
 * El piquete elegido con Seleccionar (spec 2026-10-02 § 5.2, P3c, la puerta de
 * vuelta): su distancia a la esquina, en reposo; clic o Tab la abren, como las
 * cotas de la pieza. Escribe por el ancla, como la de lo que se pone. Lo demás
 * —forma, cantidad, profundidad y ancho— está en su etiqueta.
 */
export function cotaDelPiqueteElegido(piece: PatternPiece, line: InternalLine): Cota | null {
  const anchor = line.notchAnchor;
  if (line.type !== 'notch' || !anchor) return null;
  const resuelta = resolveNotchAnchor(piece.outline, anchor);
  if (!resuelta) return null;
  const a = pieceLocalToPattern(anchor.refPoint, piece);
  const b = pieceLocalToPattern(resuelta.point, piece);
  const lado = largoDelLado(piece.outline, anchor);
  const anillo = buildRing(piece.outline, 2);
  const perimetro = anillo.ok ? anillo.value.totalMm : anchor.distanceMm;
  return {
    // state-encoded ID: la distancia de esta línea.
    id: `${piece.id}-${line.id}-distancia`,
    kind: 'borde',
    label: 'Distancia',
    valueMm: anchor.distanceMm,
    unit: 'mm',
    min: 0,
    // Los mismos techos que la de lo que se pone: el lado, sin atrapar una
    // distancia ya guardada más allá; sin lado que medir, el perímetro.
    max: lado !== null ? Math.max(lado, anchor.distanceMm) : Math.max(perimetro, anchor.distanceMm),
    ...(lado !== null ? { referenceLabel: `de ${formatMedida(lado, 'mm')}` } : {}),
    primary: true,
    scrub: false,
    a,
    b,
    outward: normalHaciaFuera(a, b, centroDe(piece)),
    apply: (mm) => ({ kind: 'piqueteElegido', pieceId: piece.id, lineId: line.id, distanciaMm: mm }),
  };
}

/**
 * Dónde cae el punto a `distanciaMm` de la esquina, contado por el arco
 * (métrica 2), como lo pide `splitSegmentAt`: comando y parámetro NATIVO. En
 * una sisa, la fracción de arco y la de De Casteljau no coinciden.
 * `'sobre-un-punto'` si cae encima de un vértice (partir ahí lo duplicaría);
 * `null` si no cae en ningún comando.
 */
export function dondeCaeElPunto(
  outline: PathCommand[],
  cuenta: Cuenta,
  distanciaMm: number,
): { commandIndex: number; nativeT: number } | 'sobre-un-punto' | null {
  const built = buildRing(outline, 2);
  if (!built.ok) return null;
  const ring = built.value;
  const desde = projectToRing(ring, cuenta.refPoint).distanceMm;
  const at = pointAt(ring, cuenta.direction === 'cw' ? desde + distanciaMm : desde - distanciaMm);
  const comando = outline[at.commandIndex];
  const extremos = getEdgeEndpoints(outline, at.commandIndex);
  if (!comando || !extremos || comando.type === 'M') return null;
  if (at.tLocal < 1e-6 || at.tLocal > 1 - 1e-6) return 'sobre-un-punto';
  return { commandIndex: at.commandIndex, nativeT: arcToNativeT(comando, extremos.start, at.tLocal) };
}

/**
 * El punto recién puesto (spec 2026-10-02 § 5.2): «una cota con la distancia a
 * la esquina, escribible, que vive hasta el siguiente clic o Esc». Es
 * terminar de ponerlo, no editar un punto que ya existía. El techo es el
 * lado: pasar de la esquina siguiente lo pondría en otro.
 */
export function cotaDelPunto(p: PuntoPuesto, viva: PatternPiece, alCerrar: () => void): Cota {
  const a = pieceLocalToPattern(p.cuenta.refPoint, viva);
  const b = pieceLocalToPattern(p.vertice, viva);
  return {
    id: 'punto-distancia',
    kind: 'borde',
    label: 'Distancia',
    valueMm: p.distanciaMm,
    unit: 'mm',
    min: 0,
    max: p.ladoMm,
    referenceLabel: `de ${formatMedida(p.ladoMm, 'mm')}`,
    primary: true,
    scrub: false,
    a,
    b,
    outward: normalHaciaFuera(a, b, centroDe(viva)),
    alCerrar,
    apply: (mm) => ({ kind: 'punto', distanciaMm: mm }),
  };
}
