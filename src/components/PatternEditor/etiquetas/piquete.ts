import type { InternalLine, NotchOptions, NotchShape, PatternPiece } from '../../../types/types';
import { resolveNotchAnchor } from '../../../utils/notchAnchor';
import { DEFAULT_NOTCH_OPTIONS, generateNotchPath } from '../../../utils/notches';
import { FORMAS_DE_PIQUETE } from '../../../tools/definitions/notch';
import { formatMedida } from '../cotas/parseMedida';

/**
 * Un piquete ya puesto, reescrito desde su ancla: la distancia de su cota o las
 * opciones de su etiqueta (spec 2026-10-02 § 5.2, P3c). El path sale SIEMPRE
 * del ancla resuelta sobre el contorno vivo y de las opciones, como al ponerlo:
 * un solo escritor de su geometría. `null` si no es un piquete con ancla, o si
 * el ancla ya no cae en el contorno.
 */
export function reescribirPiquete(
  piece: PatternPiece,
  line: InternalLine,
  cambio: { distanciaMm?: number; opciones?: Partial<NotchOptions> },
): Pick<InternalLine, 'path' | 'notchAnchor' | 'notchOptions'> | null {
  if (line.type !== 'notch' || !line.notchAnchor) return null;
  const pedida = { ...line.notchAnchor, distanceMm: cambio.distanciaMm ?? line.notchAnchor.distanceMm };
  const resuelta = resolveNotchAnchor(piece.outline, pedida);
  if (!resuelta) return null;
  const opciones: NotchOptions = { ...DEFAULT_NOTCH_OPTIONS, ...line.notchOptions, ...cambio.opciones };
  return {
    path: generateNotchPath(resuelta.point, resuelta.normal, opciones),
    // La distancia que se guarda es la que el anillo usó, no la cruda (#1124),
    // como en `confirmRefine`.
    notchAnchor: { ...line.notchAnchor, distanceMm: resuelta.distanceMm },
    notchOptions: opciones,
  };
}

const PLURAL: Record<NotchShape, string> = {
  slit: 'rectas',
  't-notch': 'en T',
  'v-internal': 'V hacia adentro',
  'v-external': 'V hacia afuera',
  'u-notch': 'en U',
  castle: 'almenas',
  diamond: 'rombos',
};

const numero = (mm: number) => formatMedida(mm, 'mm').replace(' mm', '');

/** «Recta · 8 × 3 mm»; con varios, «2 rectas · 8 × 3 mm» (solace-wren, 2026-10-09). */
export function textoDelPiquete(o: NotchOptions): string {
  const medidas = `${numero(o.length)} × ${numero(o.width)} mm`;
  // `Number`: la lista de antes guardaba la cantidad como "2".
  const n = Number(o.count ?? 1);
  if (n > 1) return `${n} ${PLURAL[o.shape]} · ${medidas}`;
  const forma = FORMAS_DE_PIQUETE.find((c) => c.value === o.shape)?.label ?? o.shape;
  return `${forma} · ${medidas}`;
}
