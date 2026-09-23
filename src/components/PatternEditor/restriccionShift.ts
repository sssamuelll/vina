import type { Point2D } from '../../types/types';

/**
 * Shift mantenido (contrato 2026-09-08 § 3.4): la dirección se restringe a
 * múltiplos de 45°, solo mientras se sostiene la tecla.
 *
 * Respecto a la HOJA — horizontal, vertical y las dos diagonales del espacio
 * del patrón —, no al borde del que sale la línea. Lo firmó María el 23-09
 * (opción B): «una pieza de patrón siempre lleva un dirección respecto a los
 * bordes de la tela… todas siempre parten de unas perpendiculares que son las
 * que envuelven el cuerpo». La píldora sigue LEYENDO el ángulo relativo al
 * borde (firma D2 del 12-09): escribir y leer comparten marco; Shift no escribe
 * ningún número, endereza el ratón.
 *
 * Las ocho direcciones van escritas como vectores y no como ángulos: una
 * horizontal tiene que salir con la `y` idéntica a la del origen, no a 1e-14
 * (el componente 0 del vector la deja exacta), porque un lado «casi»
 * horizontal se lee como tal en la cota y no lo es.
 */
const D = Math.SQRT1_2;
// Espacio del patrón: `y` crece hacia abajo, así que «arriba» es `y` negativa
// (la convención de `polarPoint`: 90° es hacia arriba en pantalla).
const DIRECCIONES: readonly Point2D[] = [
  { x: 1, y: 0 }, { x: D, y: -D }, { x: 0, y: -1 }, { x: -D, y: -D },
  { x: -1, y: 0 }, { x: -D, y: D }, { x: 0, y: 1 }, { x: D, y: D },
];

/**
 * El punto sobre la dirección de la hoja más cercana al rumbo `desde → cursor`,
 * a la distancia de la proyección del cursor sobre ella. Proyectar, y no
 * conservar la distancia al cursor, es lo que deja la línea bajo la mano:
 * el extremo cae donde el cursor «pisa» la guía.
 */
export function restringirAHoja45(desde: Point2D, cursor: Point2D): Point2D {
  const dx = cursor.x - desde.x;
  const dy = cursor.y - desde.y;
  if (Math.hypot(dx, dy) < 1e-9) return { ...desde };
  let mejor = DIRECCIONES[0];
  let largo = -Infinity;
  for (const u of DIRECCIONES) {
    const proyeccion = dx * u.x + dy * u.y;
    if (proyeccion > largo) { largo = proyeccion; mejor = u; }
  }
  return { x: desde.x + largo * mejor.x, y: desde.y + largo * mejor.y };
}

const ORIGEN: Point2D = { x: 0, y: 0 };

/**
 * Lo mismo para un DESPLAZAMIENTO en vez de un punto: lo que mueve un
 * arrastre en Editar patrón, desde donde estaba el punto (#1112, «cuánto lo
 * quieres mover en esa dirección»).
 */
export function enderezarDesplazamiento(delta: Point2D): Point2D {
  return restringirAHoja45(ORIGEN, delta);
}
