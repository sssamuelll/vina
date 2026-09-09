import type { Point2D } from '../../../types/types';
import type { Cota } from './cotas';

/** Aire entre la geometría y la línea/chip de cota, en px de pantalla. */
export const COTA_OFFSET_PX = 18;

/** Alto del chip, tal cual lo declara `cotas.css` (`height: 22px`). */
export const ALTO_CHIP_PX = 22;

/** `padding: 0 8px` a cada lado. */
const AIRE_CHIP_PX = 16;
/** Avance de un carácter de `--font-mono-2d` a 11 px (0,6 em). Medido en la app:
 *  "228 mm" 56 px, "20,4 mm" 64 px, "0°" 29 px. */
const AVANCE_CHAR_PX = 6.6;

/** Cuánto ocupa de ancho un chip con ese texto, sin medirlo en el DOM. */
export function anchoEstimadoDeChip(texto: string): number {
  return AIRE_CHIP_PX + AVANCE_CHAR_PX * texto.length;
}

/** Un chip ya colocado por `chipScreenPosition`, listo para desamontonar. */
export interface ChipPuesto {
  cota: Pick<Cota, 'id' | 'label' | 'a' | 'b' | 'outward'>;
  left: number;
  top: number;
  /** Texto que el chip pinta. Sin él se estima con `cota.label`. */
  texto?: string;
  /** Cede el sitio: se coloca después de todos los demás y nunca los empuja
   *  (la lectura del margen es pasajera; los chips anclados no deben saltar). */
  cede?: boolean;
}

/** Paso de búsqueda del hueco libre, en px de pantalla. */
const PASO_PX = 4;
/** Tope de deslizamiento: más lejos el chip deja de leerse como suyo. */
const MAX_CORRIMIENTO_PX = 160;

interface Caja { left: number; top: number; right: number; bottom: number }

/**
 * Un obstáculo fijo que los chips deben esquivar: hoy, los tiradores del
 * transform box. En px de PANTALLA, como todo lo que toca `separarChips`.
 */
export type Estorbo = Caja;

/** Lado del tirador más grande que pinta `TransformHandlesOverlay`: el círculo
 *  de giro, `ROTATE_RADIUS = 4` → 8 px de diámetro. Los cuadrados son 6. */
const LADO_ASA_PX = 8;
/** Aire alrededor del asa. Sin él el chip queda pegado y el clic sigue siendo
 *  una lotería de un píxel. */
const AIRE_ASA_PX = 4;

/**
 * Las asas del transform box como estorbos, en coordenadas de pantalla.
 *
 * Existe porque los chips de cota se comían dos de los diez mandos de la caja
 * (medido el 2026-09-04): el asa `e` caía bajo el chip del alto y la de giro
 * bajo el del ancho. Y el gesto robado no se perdía —se volvía un scrub del
 * chip—, así que tirar del "asa este" para ensanchar le subía el ALTO a María.
 *
 * El tamaño es de pantalla y NO escala con el zoom, igual que el que dibuja
 * `TransformHandlesOverlay` (`HANDLE_SIZE / zoom2D` en unidades de patrón es
 * un tamaño constante en pantalla).
 */
export function cajasDeAsas(
  handles: Array<{ pos: Point2D }>,
  pan2D: Point2D,
  zoom2D: number,
): Estorbo[] {
  const medio = LADO_ASA_PX / 2 + AIRE_ASA_PX;
  return handles.map((h) => {
    const cx = pan2D.x + h.pos.x * zoom2D;
    const cy = pan2D.y + h.pos.y * zoom2D;
    return { left: cx - medio, right: cx + medio, top: cy - medio, bottom: cy + medio };
  });
}

/** El chip se dibuja centrado en (left, top): `transform: translate(-50%,-50%)`. */
function caja(left: number, top: number, ancho: number): Caja {
  return {
    left: left - ancho / 2, right: left + ancho / 2,
    top: top - ALTO_CHIP_PX / 2, bottom: top + ALTO_CHIP_PX / 2,
  };
}

function areaSolapada(a: Caja, b: Caja): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Dirección por la que un chip puede deslizarse sin dejar de describir lo que
 * describe. Normalmente es la tangente a→b, o sea el hilo que dibuja
 * `CotaLines`.
 *
 * El margen es el caso degenerado y merece su propia salida: su cota tiene
 * `a === b` (`cotaDeMargen.ts:48-49`) y `CotaLines` la deja sin hilo a
 * propósito. Ahí la horizontal sería una dirección inventada — el chip se
 * alejaría del borde que mide. Pero `outward` SÍ dice algo: es la normal hacia
 * fuera de ese borde, así que su perpendicular es la dirección del borde. Por
 * ahí el chip se desliza *a lo largo del borde del que habla*.
 * (Lo levantó la revisión adversarial del lote de cotas, 2026-09-04.)
 */
function tangenteDe(cota: Pick<Cota, 'a' | 'b' | 'outward'>): Point2D {
  const dx = cota.b.x - cota.a.x;
  const dy = cota.b.y - cota.a.y;
  const length = Math.hypot(dx, dy);
  if (length > 1e-9) return { x: dx / length, y: dy / length };

  const n = Math.hypot(cota.outward.x, cota.outward.y);
  if (n > 1e-9) return { x: -cota.outward.y / n, y: cota.outward.x / n };

  return { x: 1, y: 0 };
}

/**
 * Desamontona los chips: devuelve las posiciones corregidas, en el MISMO orden.
 *
 * Generaliza lo que `chipScreenPosition` ya hacía para un solo par (Largo y
 * Ángulo, ±36 px sobre la tangente). Cada chip se desliza SOLO a lo largo de su
 * propia línea de cota, nunca hacia fuera: el chip cae en el punto medio del
 * hilo que dibuja `CotaLines` y esa coincidencia es toda el ancla que hay —no
 * hay línea guía—, así que empujarlo por `outward` lo despegaría de su hilo.
 *
 * Se colocan uno a uno en orden canónico (arriba→abajo, izquierda→derecha, id):
 * el resultado no depende de en qué orden llegó la lista, y el que ya está
 * puesto no se vuelve a mover. Cada uno prueba 0, ±4, ±8… hasta el tope y se
 * queda en el primer hueco libre; si no hay ninguno, en el que menos pisa.
 *
 * `estorbos` son cajas que ya estaban ahí y NO se mueven —los tiradores del
 * transform box—: entran a la pasada como si fueran chips ya colocados. Se
 * descartó corregir el aire de `chipScreenPosition` en su lugar porque no
 * alcanza: el asa de giro cuelga de un brazo, fuera de la banda del offset, y
 * ningún ajuste del offset la libera.
 */
export function separarChips(
  items: ChipPuesto[],
  estorbos: readonly Estorbo[] = [],
): Array<{ left: number; top: number }> {
  const anchos = items.map((it) => anchoEstimadoDeChip(it.texto ?? it.cota.label));
  const orden = items.map((_, i) => i).sort((i, j) => {
    const a = items[i];
    const b = items[j];
    return (a.cede ? 1 : 0) - (b.cede ? 1 : 0)
      || a.top - b.top
      || a.left - b.left
      || (a.cota.id < b.cota.id ? -1 : a.cota.id > b.cota.id ? 1 : 0);
  });
  const salida = items.map(({ left, top }) => ({ left, top }));
  const puestas: Caja[] = [...estorbos];
  for (const i of orden) {
    const item = items[i];
    const tangent = tangenteDe(item.cota);
    let mejor = { left: item.left, top: item.top, pisa: Infinity };
    for (let k = 0; k * PASO_PX <= MAX_CORRIMIENTO_PX && mejor.pisa > 0; k++) {
      for (const signo of k === 0 ? [1] : [1, -1]) {
        const d = signo * k * PASO_PX;
        const left = item.left + tangent.x * d;
        const top = item.top + tangent.y * d;
        const propia = caja(left, top, anchos[i]);
        const pisa = puestas.reduce((suma, otra) => suma + areaSolapada(propia, otra), 0);
        if (pisa < mejor.pisa) mejor = { left, top, pisa };
        if (pisa === 0) break;
      }
    }
    salida[i] = { left: mejor.left, top: mejor.top };
    puestas.push(caja(mejor.left, mejor.top, anchos[i]));
  }
  return salida;
}

/**
 * Punto medio del segmento a→b en pantalla (la fórmula de `FloatingActionBar`:
 * pan + patrón × zoom), desplazado hacia fuera de la pieza.
 */
export function chipScreenPosition(cota: Cota, pan2D: Point2D, zoom2D: number): { left: number; top: number } {
  const mx = (cota.a.x + cota.b.x) / 2;
  const my = (cota.a.y + cota.b.y) / 2;
  const dx = cota.b.x - cota.a.x;
  const dy = cota.b.y - cota.a.y;
  const length = Math.hypot(dx, dy);
  // Largo y Ángulo comparten el punto medio por contrato. Separarlos sobre la
  // tangente conserva esa ancla visual sin dejar que el segundo tape al primero
  // y vuelva imposible clicar Largo. El aire sale de la constante ya calibrada.
  const pairOffset = cota.kind === 'tramo-largo'
    ? -COTA_OFFSET_PX * 2
    : cota.kind === 'tramo-angulo'
      ? COTA_OFFSET_PX * 2
      : 0;
  const tangent = length > 1e-9
    ? { x: dx / length, y: dy / length }
    : { x: 1, y: 0 };
  return {
    left: pan2D.x + mx * zoom2D + cota.outward.x * COTA_OFFSET_PX + tangent.x * pairOffset,
    top: pan2D.y + my * zoom2D + cota.outward.y * COTA_OFFSET_PX + tangent.y * pairOffset,
  };
}
