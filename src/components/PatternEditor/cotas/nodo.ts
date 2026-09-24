import type { PathCommand, PatternPiece, Point2D } from '../../../types/types';
import { anchorGroupOf, getAnchor } from '../nodeEditorUtils';
import { pieceLocalToPattern, pieceLocalToPatternDirection } from '../../../utils/geometry/pieceSpace';
import type { Cota } from './cotas';

/** Un vecino: qué comando es y dónde está, en coordenadas LOCALES de la pieza. */
export interface Vecino {
  indice: number;
  punto: Point2D;
}

export interface Vecinos {
  anterior: Vecino | null;
  siguiente: Vecino | null;
}

/** Misma clave exacta que `coincidentAnchorGroups`: sin epsilon, a propósito. */
const clave = (p: Point2D) => `${Math.round(p.x * 1e6)}|${Math.round(p.y * 1e6)}`;

/**
 * Los dos vecinos de un nodo del contorno — #1112, «respecto a este punto,
 * respecto a este punto» [01:37].
 *
 * No existía. El censo del 2026-09-06 encontró cinco copias del bucle «busca el
 * ancla anterior» (`nodeEditorUtils`, `splineSegment`), todas hacia atrás,
 * ninguna con siguiente, ninguna que envuelva por la `Z`. Los tres casos que
 * las rompen están en el test, y los tres son reales:
 *
 *  - La `Z` no es nodo: el siguiente del último ancla de un contorno cerrado es
 *    el ancla de la `M`.
 *  - El DXF de María trae el vértice DUPLICADO en cada esquina (CLO lo hace).
 *    El vecino ingenuo es el gemelo a distancia cero, y una cota de «0,0 mm»
 *    que no se puede mover es peor que ninguna. Se salta el grupo entero.
 *  - Un contorno abierto no envuelve: sus extremos tienen un solo vecino.
 *
 * Trabaja en espacio LOCAL de la pieza, que es donde vive `outline`.
 */
export function vecinosDelNodo(outline: PathCommand[], commandIndex: number): Vecinos {
  const propio = getAnchor(outline[commandIndex] ?? { type: 'Z', values: [] });
  if (!propio) return { anterior: null, siguiente: null };

  // Todos los índices que SON el mismo punto que este: se saltan enteros.
  const grupo = new Set(anchorGroupOf(outline, commandIndex));
  const propioKey = clave(propio);

  // Los índices que tienen ancla, en orden. La `Z` no entra; el anillo se
  // cierra por la `M`, que es lo que la `Z` significa.
  const anclas: Vecino[] = [];
  let cierra = false;
  for (let i = 0; i < outline.length; i++) {
    if (outline[i].type === 'Z') { cierra = true; continue; }
    const p = getAnchor(outline[i]);
    if (p) anclas.push({ indice: i, punto: p });
  }

  const pos = anclas.findIndex((a) => a.indice === commandIndex);
  if (pos < 0) return { anterior: null, siguiente: null };

  const buscar = (paso: -1 | 1): Vecino | null => {
    for (let k = 1; k <= anclas.length; k++) {
      let j = pos + paso * k;
      if (cierra) {
        j = ((j % anclas.length) + anclas.length) % anclas.length;
      } else if (j < 0 || j >= anclas.length) {
        return null;
      }
      const cand = anclas[j];
      if (grupo.has(cand.indice)) continue;
      if (clave(cand.punto) === propioKey) continue;
      return cand;
    }
    // Todo el contorno es el mismo punto: no hay vecino, y decirlo es mejor que
    // dar vueltas al anillo.
    return null;
  };

  return { anterior: buscar(-1), siguiente: buscar(1) };
}

const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Las cotas de un nodo en reposo: su distancia a cada vecino, escribibles.
 */
export function cotasDelNodo(piece: PatternPiece, commandIndex: number): Cota[] {
  return cotasDelNodoEnPath(piece, piece.outline, commandIndex);
}

/**
 * Las cotas de un nodo en reposo: su distancia a cada vecino, escribibles.
 * (… el JSDoc de hoy …)
 *
 * Vale para cualquier línea de la pieza (spec 2026-09-24 § 4.5). `lineId` (una
 * interna) viaja en el id de la cota y en su acción, para que `moveNodeTo`
 * escriba en esa línea.
 */
export function cotasDelNodoEnPath(
  piece: PatternPiece, path: PathCommand[], commandIndex: number, lineId?: string,
): Cota[] {
  const propio = getAnchor(path[commandIndex] ?? { type: 'Z', values: [] });
  if (!propio) return [];
  const { anterior, siguiente } = vecinosDelNodo(path, commandIndex);

  const centro = { x: 0, y: 0 };
  for (const cmd of piece.outline) {
    const p = getAnchor(cmd);
    if (p) { centro.x += p.x; centro.y += p.y; }
  }
  const n = piece.outline.filter((c) => getAnchor(c)).length || 1;
  centro.x /= n; centro.y /= n;

  const cota = (v: Vecino, lado: 'anterior' | 'siguiente'): Cota | null => {
    const largo = dist(propio, v.punto);
    if (largo < 1e-6) return null;
    const dir = { x: (propio.x - v.punto.x) / largo, y: (propio.y - v.punto.y) / largo };
    const medio = { x: (propio.x + v.punto.x) / 2, y: (propio.y + v.punto.y) / 2 };
    const normal = { x: -dir.y, y: dir.x };
    const haciaFuera = (medio.x - centro.x) * normal.x + (medio.y - centro.y) * normal.y < 0
      ? { x: -normal.x, y: -normal.y }
      : normal;

    return {
      id: lineId ? `nodo-${lineId}-${commandIndex}-${lado}` : `nodo-${commandIndex}-${lado}`,
      // (… los comentarios de hoy sobre `kind`, `a`/`b`, `outward` y `apply` …)
      kind: 'tramo-largo',
      label: lado === 'anterior' ? 'Al punto anterior' : 'Al punto siguiente',
      valueMm: largo,
      unit: 'mm',
      min: 0.1,
      max: 10000,
      primary: true,
      rotulo: 'del punto',
      a: pieceLocalToPattern(v.punto, piece),
      b: pieceLocalToPattern(propio, piece),
      outward: pieceLocalToPatternDirection(haciaFuera, piece),
      apply: (v2) => ({
        kind: 'nodo' as const,
        pieceId: piece.id,
        commandIndex,
        destino: { x: v.punto.x + dir.x * v2, y: v.punto.y + dir.y * v2 },
        ...(lineId ? { lineId } : {}),
      }),
    };
  };

  const cotas: Cota[] = [];
  if (anterior) { const c = cota(anterior, 'anterior'); if (c) cotas.push(c); }
  if (siguiente) { const c = cota(siguiente, 'siguiente'); if (c) cotas.push(c); }
  return cotas;
}

/**
 * El punto único elegido en «Editar patrón», si lo hay.
 *
 * «Un punto» NO es «un índice de comando». Un clic sobre un nodo selecciona el
 * grupo de anclas coincidentes entero (`useEditPattern`), porque CLO duplica el
 * vértice en cada esquina y moverlas por separado rompería el contorno en una
 * púa. En el DXF de María eso son DOS índices para un solo punto.
 *
 * Vive aquí y no en `PatternEditor` porque lo consultan dos sitios —las cotas y
 * el gate del menú contextual— y tenerlo dos veces era exactamente la forma de
 * que uno de los dos se quedara con la condición ingenua.
 */
export function puntoUnicoSeleccionado(
  piece: PatternPiece | undefined,
  seleccionados: ReadonlySet<number>,
): { pieceId: string; commandIndex: number } | null {
  if (!piece) return null;
  const commandIndex = puntoUnicoDeLinea(piece.outline, seleccionados);
  return commandIndex === null ? null : { pieceId: piece.id, commandIndex };
}

/** El mismo criterio sobre cualquier línea: el índice del punto, o null. */
export function puntoUnicoDeLinea(
  path: PathCommand[],
  seleccionados: ReadonlySet<number>,
): number | null {
  if (seleccionados.size === 0) return null;
  const nodos = [...seleccionados];
  const grupo = anchorGroupOf(path, nodos[0]);
  if (nodos.length !== grupo.length || !nodos.every((n) => grupo.includes(n))) return null;
  return nodos[0];
}
