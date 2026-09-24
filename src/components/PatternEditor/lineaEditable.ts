/**
 * Una línea que Editar patrón (`Q`) sabe editar, y la ÚNICA puerta por la que
 * se escribe (spec 2026-09-24 §§ 3.1 y 8).
 *
 * Una pieza tiene varias líneas: su contorno y sus internas. Todas viven en el
 * marco local de la pieza, así que se leen, se arrastran y se escriben igual;
 * lo que cambia es qué más hay que rehacer al escribir, y eso vive aquí y en
 * ningún otro sitio (dos escritores del mismo hecho se desincronizan: es el
 * fallo con nombre propio de este repo).
 */
import type { PathCommand, PatternPiece } from '../../types/types';
import { reanchorNotches } from '../../utils/notchReanchor';
import { compensatePositionForPivotChange } from './pieceTransform';

/** La clave de una línea dentro de su pieza: estable mientras la línea exista. */
export type ClaveLinea = 'contorno' | `interna:${string}`;

export const CLAVE_CONTORNO: ClaveLinea = 'contorno';

export function claveDeInterna(lineId: string): ClaveLinea {
  return `interna:${lineId}`;
}

/** El id de la interna de una clave, o null si es el contorno. */
export function lineIdDeClave(clave: ClaveLinea): string | null {
  return clave === CLAVE_CONTORNO ? null : clave.slice('interna:'.length);
}

/** El path de una línea en la pieza de hoy, o null si ya no existe. */
export function pathDeLinea(piece: PatternPiece, clave: ClaveLinea): PathCommand[] | null {
  const lineId = lineIdDeClave(clave);
  if (lineId === null) return piece.outline;
  return piece.internals.find(l => l.id === lineId)?.path ?? null;
}

/**
 * La pieza con los paths nuevos de sus líneas.
 *
 * - El contorno compensa el pivote de giro (una pieza girada no salta al
 *   cambiar su caja) y re-ancla los piquetes al borde nuevo (#171). Es lo que
 *   construía a mano `dispatchAndRefresh`.
 * - Una interna cambia su path, y `null` la quita. No mueve el pivote: el
 *   giro se hace sobre la caja del contorno, que no cambió.
 */
export function conPaths(
  piece: PatternPiece,
  cambios: ReadonlyMap<ClaveLinea, PathCommand[] | null>,
): PatternPiece {
  const contorno = cambios.get(CLAVE_CONTORNO) ?? null;
  let internals = piece.internals;
  const tocaInternas = [...cambios.keys()].some(k => k !== CLAVE_CONTORNO);
  if (tocaInternas) {
    internals = internals.flatMap(line => {
      const clave = claveDeInterna(line.id);
      if (!cambios.has(clave)) return [line];
      const path = cambios.get(clave);
      return path ? [{ ...line, path }] : [];
    });
  }
  if (!contorno) return { ...piece, internals, updatedAt: Date.now() };
  return {
    ...piece,
    position: compensatePositionForPivotChange(piece, contorno),
    outline: contorno,
    // piece.outline is the pre-edit shape, which lets a dragged reference
    // corner be re-identified instead of stranding its notch.
    internals: reanchorNotches(internals, contorno, piece.outline),
    updatedAt: Date.now(),
  };
}
