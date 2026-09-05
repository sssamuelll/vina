/**
 * Separación vertical de las etiquetas de cinta del avatar (#1108).
 *
 * María, [20:21]: *«mira aquí se cruzan los números, entonces es como ruido
 * visual, ¿no?, de qué me sirve»*. Cada cinta monta su etiqueta a su propia
 * altura y ninguna sabe de las demás, así que dos cintas a menos de unos
 * centímetros escriben sus números uno encima del otro.
 *
 * Es el mismo problema que `separarChips` resuelve para las cotas del lienzo
 * 2D, pero en espacio de mundo y sobre un solo eje: las cintas de contorno son
 * anillos horizontales, así que amontonarse solo pueden amontonarse en Y.
 *
 * La etiqueta se aparta; el anillo NO se mueve. El anillo es el dato y está
 * justo ahí al lado, así que un empujón pequeño se lee como «esta etiqueta es
 * de ese anillo» y no como una medida en otro sitio.
 */

/**
 * Separación mínima entre etiquetas, en unidades de mundo (metros).
 *
 * ponytail: 4 cm es lo que ocupa de alto una etiqueta de 11 px con
 * `distanceFactor={3}` a la distancia de cámara habitual del visor. No se
 * deriva de la cámara porque el `<Html>` de drei no expone su tamaño en
 * mundo; si alguna vez cambia el tamaño de fuente o el `distanceFactor`, este
 * es el número que se toca.
 */
export const SEPARACION_MINIMA_M = 0.04;

/**
 * Sube las etiquetas que se pisen, en orden de abajo hacia arriba.
 *
 * Devuelve una altura por cada entrada, **en el orden en que llegaron** — el
 * llamador las pinta por su índice, así que reordenar la salida las cruzaría.
 */
export function separarEtiquetas(
  alturas: number[],
  minima = SEPARACION_MINIMA_M,
): number[] {
  const orden = alturas
    .map((y, i) => ({ y, i }))
    .sort((a, b) => a.y - b.y);

  const salida = new Array<number>(alturas.length);
  let anterior = -Infinity;

  for (const { y, i } of orden) {
    // La de más abajo se queda donde está; cada siguiente solo sube lo justo
    // para despegarse de la anterior. Empujar siempre hacia arriba mantiene el
    // orden vertical, que es lo que le dice a María cuál cinta es cuál.
    const puesta = Math.max(y, anterior + minima);
    salida[i] = puesta;
    anterior = puesta;
  }

  return salida;
}
