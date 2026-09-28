import type { Point2D } from '../../types/types';
import { normalizeAngle, type AngleReference } from './angleReference';

/**
 * Shift mantenido (contrato 2026-09-08 § 3.4): la dirección se restringe a
 * múltiplos de 45°, solo mientras se sostiene la tecla.
 *
 * Shift una vez endereza respecto a la HOJA — horizontal, vertical y las dos
 * diagonales del espacio del patrón —, no al borde del que sale la línea. Lo
 * firmó María el 23-09 (opción B): «una pieza de patrón siempre lleva un
 * dirección respecto a los bordes de la tela… todas siempre parten de unas
 * perpendiculares que son las que envuelven el cuerpo». La píldora sigue
 * LEYENDO el ángulo relativo al borde (firma D2 del 12-09): escribir y leer
 * comparten marco; Shift no escribe ningún número, endereza el ratón.
 *
 * Shift dos veces endereza respecto al BORDE —la referencia de la píldora—, que
 * es lo que ella dejó escrito como ideal: «podrían salir guías para las dos
 * opciones» (spec 2026-09-23).
 *
 * Las ocho direcciones de la hoja van escritas como vectores y no como
 * ángulos: una horizontal tiene que salir con la `y` idéntica a la del origen,
 * no a 1e-14 (el componente 0 del vector la deja exacta), porque un lado «casi»
 * horizontal se lee como tal en la cota y no lo es.
 */
const D = Math.SQRT1_2;
// Espacio del patrón: `y` crece hacia abajo, así que «arriba» es `y` negativa
// (la convención de `polarPoint`: 90° es hacia arriba en pantalla).
const DIRECCIONES_HOJA: readonly Point2D[] = [
  { x: 1, y: 0 }, { x: D, y: -D }, { x: 0, y: -1 }, { x: -D, y: -D },
  { x: -1, y: 0 }, { x: -D, y: D }, { x: 0, y: 1 }, { x: D, y: D },
];

/** ¿Da el marco las mismas ocho direcciones que la hoja? */
function esDeLaHoja(baseDeg: number): boolean {
  const resto = ((baseDeg % 45) + 45) % 45;
  return resto < 1e-9 || 45 - resto < 1e-9;
}

/**
 * Las ocho direcciones del marco (convención de `polarPoint`: θ → (cos θ, −sin θ)).
 * Un marco alineado con la hoja reusa sus vectores escritos: la horizontal
 * sigue saliendo con la `y` idéntica a la del origen.
 */
function direcciones(baseDeg: number): readonly Point2D[] {
  if (esDeLaHoja(baseDeg)) return DIRECCIONES_HOJA;
  return Array.from({ length: 8 }, (_, k) => {
    const rad = ((baseDeg + 45 * k) * Math.PI) / 180;
    return { x: Math.cos(rad), y: -Math.sin(rad) };
  });
}

/** La dirección más cercana al rumbo (dx, dy), y la proyección del rumbo sobre ella. */
function masCercana(dx: number, dy: number, dirs: readonly Point2D[]): { u: Point2D; largo: number } {
  let u = dirs[0];
  let largo = -Infinity;
  for (const d of dirs) {
    const proyeccion = dx * d.x + dy * d.y;
    if (proyeccion > largo) { largo = proyeccion; u = d; }
  }
  return { u, largo };
}

/**
 * El punto sobre la dirección del marco `baseDeg` más cercana al rumbo
 * `desde → cursor`, a la distancia de la proyección del cursor sobre ella.
 * Proyectar, y no conservar la distancia al cursor, es lo que deja la línea
 * bajo la mano: el extremo cae donde el cursor «pisa» la guía.
 */
export function restringirA45(desde: Point2D, cursor: Point2D, baseDeg = 0): Point2D {
  const dx = cursor.x - desde.x;
  const dy = cursor.y - desde.y;
  if (Math.hypot(dx, dy) < 1e-9) return { ...desde };
  const { u, largo } = masCercana(dx, dy, direcciones(baseDeg));
  return { x: desde.x + largo * u.x, y: desde.y + largo * u.y };
}

/** Shift una vez: la hoja. Se queda con su nombre porque en cada llamada dice qué quiere. */
export function restringirAHoja45(desde: Point2D, cursor: Point2D): Point2D {
  return restringirA45(desde, cursor, 0);
}

const ORIGEN: Point2D = { x: 0, y: 0 };

/**
 * Lo mismo para un DESPLAZAMIENTO en vez de un punto: lo que mueve un
 * arrastre en Editar patrón, desde donde estaba el punto (#1112, «cuánto lo
 * quieres mover en esa dirección»).
 */
export function enderezarDesplazamiento(delta: Point2D, baseDeg = 0): Point2D {
  return restringirA45(ORIGEN, delta, baseDeg);
}

/** Un rayo desde `desde`, con el ángulo de `polarPoint`. */
export interface GuiaShift { desde: Point2D; angleDeg: number }

/**
 * Lo que decide Shift en un instante: dónde cae el punto, y las dos guías que
 * se pintan —la activa, por donde va la línea, y la tenue, adonde iría si se
 * cambiara de guía ahora—. `null` donde no hay nada que pintar.
 */
export interface GuiasShift { punto: Point2D; activa: GuiaShift | null; tenue: GuiaShift | null }

const anguloDe = (u: Point2D) => normalizeAngle((Math.atan2(-u.y, u.x) * 180) / Math.PI);

/**
 * La ÚNICA fuente del punto enderezado y de las guías (spec 2026-09-23 § 5.1):
 * la usan las herramientas para colocar y el overlay para pintar, así que el
 * aviso y el resultado no pueden discrepar (maria-196). `borde` elige el marco
 * activo: la referencia de la píldora con Shift dos veces, la hoja con una.
 * Si los dos marcos dan las mismas direcciones, no hay guía tenue.
 */
export function guiasShift(desde: Point2D, cursor: Point2D, referencia: AngleReference, borde: boolean): GuiasShift {
  const marco = borde ? referencia.baseDeg : 0;
  const punto = restringirA45(desde, cursor, marco);
  const dx = cursor.x - desde.x;
  const dy = cursor.y - desde.y;
  if (Math.hypot(dx, dy) < 1e-9) return { punto, activa: null, tenue: null };
  const activa = { desde, angleDeg: anguloDe(masCercana(dx, dy, direcciones(marco)).u) };
  if (esDeLaHoja(referencia.baseDeg)) return { punto, activa, tenue: null };
  const otro = borde ? 0 : referencia.baseDeg;
  return { punto, activa, tenue: { desde, angleDeg: anguloDe(masCercana(dx, dy, direcciones(otro)).u) } };
}
