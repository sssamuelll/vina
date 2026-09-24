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
import type { InternalLine, PathCommand, PatternPiece } from '../../types/types';
import { esInternaEditable } from '../../types/types';
import { reanchorNotches } from '../../utils/notchReanchor';
import { compensatePositionForPivotChange } from './pieceTransform';
import { refrescarPinzas } from '../../utils/dartEntity';
import { coincidentAnchorGroups, deletePoint, getAnchor } from './nodeEditorUtils';

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

/** Las internas que Q edita en esta pieza, en orden de pintado (la última, encima). */
export function internasEditables(piece: PatternPiece): InternalLine[] {
  return piece.internals.filter(esInternaEditable);
}

/**
 * La pieza con los paths nuevos de sus líneas.
 *
 * - El contorno compensa el pivote de giro (una pieza girada no salta al
 *   cambiar su caja) y re-ancla los piquetes al borde nuevo (#171). Es lo que
 *   construía a mano `dispatchAndRefresh`.
 * - Una interna cambia su path, y `null` la quita. No mueve el pivote: el
 *   giro se hace sobre la caja del contorno, que no cambió.
 * - Si la pieza guarda la copia `darts`, se refresca con `refrescarPinzas` (§ 7).
 */
export function conPaths(
  piece: PatternPiece,
  cambios: ReadonlyMap<ClaveLinea, PathCommand[] | null>,
): PatternPiece {
  const contorno = cambios.get(CLAVE_CONTORNO) ?? null;
  let internals = piece.internals;
  const quitadas = new Set<string>();
  const tocaInternas = [...cambios.keys()].some(k => k !== CLAVE_CONTORNO);
  if (tocaInternas) {
    internals = internals.flatMap(line => {
      const clave = claveDeInterna(line.id);
      if (!cambios.has(clave)) return [line];
      const path = cambios.get(clave);
      if (!path) {
        quitadas.add(line.id);
        return [];
      }
      return [{ ...line, path }];
    });
  }
  const r: PatternPiece = contorno
    ? {
        ...piece,
        position: compensatePositionForPivotChange(piece, contorno),
        outline: contorno,
        // piece.outline is the pre-edit shape, which lets a dragged reference
        // corner be re-identified instead of stranding its notch.
        internals: reanchorNotches(internals, contorno, piece.outline),
        updatedAt: Date.now(),
      }
    : { ...piece, internals, updatedAt: Date.now() };
  if (tocaInternas && piece.darts) r.darts = refrescarPinzas(piece.darts, r.internals, piece.edges, quitadas);
  return r;
}

/**
 * Quita puntos de una línea (spec 2026-09-24 § 4.6).
 *
 * El contorno y una interna cerrada necesitan tres anclas: si no llegan,
 * `'insuficiente'` y no se toca nada (el todo o nada de siempre). Una línea
 * abierta que se queda con una sola ancla deja de existir: `null`, como ya
 * hacen los trazos (spec de trazos § 5.4). Las gemelas cuentan como una.
 */
export function quitarPuntos(
  path: PathCommand[],
  indices: ReadonlySet<number>,
  esContorno: boolean,
): PathCommand[] | null | 'insuficiente' {
  const cerrada = esContorno || path.some(c => c.type === 'Z');
  const restantes = path.filter((_, i) => !indices.has(i));
  const anclasRestantes = coincidentAnchorGroups(restantes).size;
  if (cerrada) {
    if (anclasRestantes < 3) return 'insuficiente';
    let out = path;
    for (const i of [...indices].sort((a, b) => b - a)) out = deletePoint(out, i);
    return out;
  }
  if (anclasRestantes < 2) return null;
  const out = restantes.map(c => ({ ...c, values: [...c.values] }));
  if (out[0] && out[0].type !== 'M') {
    const a = getAnchor(out[0]);
    if (a) {
      out[0] = {
        ...(out[0].authoredAnchor ? { authoredAnchor: true as const } : {}),
        type: 'M',
        values: [a.x, a.y],
      };
    }
  }
  return out;
}

/**
 * Quita tramos de una línea y devuelve lo que queda, en trozos abiertos de al
 * menos dos anclas (spec § 4.6: *"Supr borra solo BC"*). El tramo `k` es el que
 * llega al comando `k`; en una línea cerrada, el cierre es el tramo del índice
 * de su `Z`. El primer tramo quitado de una cerrada la abre por ahí: el trozo
 * empieza en el ancla a la que llegaba y da la vuelta.
 *
 * Si ningún índice es un tramo, devuelve `[path]` con la MISMA referencia: el
 * reductor lo usa para no ensuciar el proyecto con un paso de deshacer vacío.
 */
export function quitarTramos(path: PathCommand[], tramos: ReadonlySet<number>): PathCommand[][] {
  const copia = (c: PathCommand): PathCommand => ({ ...c, values: [...c.values] });
  const idxAnclas: number[] = [];
  path.forEach((c, i) => { if (c.type !== 'Z' && getAnchor(c)) idxAnclas.push(i); });
  if (idxAnclas.length < 2) return [path];
  const zIndex = path.findIndex(c => c.type === 'Z');
  const primera = getAnchor(path[idxAnclas[0]])!;

  // Los tramos en orden de recorrido: cada uno con el comando que llega.
  const secuencia: { indice: number; llega: PathCommand }[] = idxAnclas.slice(1).map(i => ({ indice: i, llega: path[i] }));
  if (zIndex >= 0) secuencia.push({ indice: zIndex, llega: { type: 'L', values: [primera.x, primera.y] } });
  if (!secuencia.some(t => tramos.has(t.indice))) return [path];

  let inicio = primera;
  let orden = secuencia;
  if (zIndex >= 0) {
    const k = secuencia.findIndex(t => tramos.has(t.indice));
    inicio = getAnchor(secuencia[k].llega)!;
    orden = [...secuencia.slice(k + 1), ...secuencia.slice(0, k)];
  }

  const trozos: PathCommand[][] = [];
  let actual: PathCommand[] = [{ type: 'M', values: [inicio.x, inicio.y] }];
  for (const t of orden) {
    if (tramos.has(t.indice)) {
      if (actual.length >= 2) trozos.push(actual);
      const a = getAnchor(t.llega)!;
      actual = [{ type: 'M', values: [a.x, a.y] }];
    } else {
      actual.push(copia(t.llega));
    }
  }
  if (actual.length >= 2) trozos.push(actual);
  return trozos;
}
