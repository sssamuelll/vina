import type { PathCommand, PatternPiece, Point2D } from '../../types/types';
import { patternToPieceLocal } from '../../utils/geometry/pieceSpace';

/**
 * Lleva un path de espacio de PATRÓN al espacio local de una pieza, par de
 * coordenadas por par de coordenadas (índice par = x, impar = y; `Z` no lleva
 * valores).
 *
 * Los internals se guardan piece-local y `PieceRenderer.tsx:130` los envuelve
 * en `translate(position) rotate(rotation, cx, cy)`, así que guardar bien es
 * deshacer las DOS cosas. `polyPen` dibuja en patrón — esto es el puente, para
 * la herramienta Forma interna (#529) y para la pluma poligonal en modo línea
 * interna.
 *
 * Recibía `origin: Point2D` y restaba solo eso, o sea el fantasma sin girar.
 * Pedía la posición SUELTA, así que el archivo no mencionaba `piece.position`
 * y el trinquete del #1068 lo contaba en cero. Ahora pide la pieza: el giro ya
 * no se puede olvidar.
 */
export function toPieceLocalPath(
  path: PathCommand[],
  piece: Pick<PatternPiece, 'position' | 'outline' | 'rotation'>,
): PathCommand[] {
  return path.map((cmd) => {
    const values = [...cmd.values];
    for (let i = 0; i + 1 < values.length; i += 2) {
      const local: Point2D = patternToPieceLocal({ x: values[i], y: values[i + 1] }, piece);
      values[i] = local.x;
      values[i + 1] = local.y;
    }
    return { ...cmd, values };
  });
}
