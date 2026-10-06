import type { PathCommand, PatternPiece, Point2D } from '../../../types/types';
import { buildRing, projectToRing } from '../../../utils/geometry/outlineRing';
import { computeBoundingBox, bboxPivot } from '../../../utils/geometry/transform';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import { detectCorners } from '../../../utils/notchAnchor';
import { DEFAULT_NOTCH_OPTIONS } from '../../../utils/notches';
import type { NotchRefineState } from '../useNotchTool';
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
 * Profundidad en un solo chip. La distancia mueve el fantasma con cada tecla;
 * la profundidad se queda aquí hasta que P3c le dé su etiqueta, porque hoy es
 * su única puerta para un piquete ya puesto. Cada campo escribe con el valor
 * de ahora del otro: el path sale de los dos.
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
  const b = r.previewWorld ?? r.notchWorld;
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
      // El perímetro, medido del contorno vivo (#1124): más allá envolvería.
      max: r.maxDistanceMm,
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
