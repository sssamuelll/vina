import type { PathCommand, Point2D } from '../../types/types';

/**
 * Shift a pattern-space path into a piece's local space by subtracting the
 * piece origin from every (x, y) pair. M/L/C/Q values are coordinate pairs
 * (even index = x, odd = y); Z has no values.
 *
 * Internal lines are stored piece-local (PieceRenderer wraps them in
 * translate(piece.position)), while polyPen produces pattern-space paths — this
 * bridges the two for the Forma interna tool (#529).
 */
export function toPieceLocalPath(path: PathCommand[], origin: Point2D): PathCommand[] {
  return path.map((cmd) => ({
    ...cmd,
    values: cmd.values.map((v, i) => (i % 2 === 0 ? v - origin.x : v - origin.y)),
  }));
}
