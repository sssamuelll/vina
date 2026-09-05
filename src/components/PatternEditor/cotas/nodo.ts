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
 *
 * Escribir una mueve el nodo A LO LARGO de la recta que lo une con ese vecino,
 * conservando la dirección. Es la misma semántica que ya tiene el largo de un
 * tramo de línea interna («escribir el largo mueve el nodo final»), y es la
 * única lectura sin ambigüedad de «ponlo a 150 de este punto».
 *
 * Con dos o más nodos seleccionados no hay cotas de nodo: lo único que un grupo
 * comparte es su desplazamiento, y eso es otra cota (decisión 5 del spec de la
 * tanda 6). Aquí se devuelve vacío y quien llama decide.
 */
export function cotasDelNodo(piece: PatternPiece, commandIndex: number): Cota[] {
  const propio = getAnchor(piece.outline[commandIndex] ?? { type: 'Z', values: [] });
  if (!propio) return [];
  const { anterior, siguiente } = vecinosDelNodo(piece.outline, commandIndex);

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
      id: `nodo-${commandIndex}-${lado}`,
      // Las DOS son largos, así que las dos son `tramo-largo`. Tentaba poner
      // `tramo-angulo` en una para heredar el desplazamiento ±36 px que
      // `chipScreenPosition` da a ese par — pero ese desplazamiento existe
      // porque Largo y Ángulo comparten punto medio, y estas dos cotas van
      // sobre tramos DISTINTOS: sus puntos medios ya difieren. Mentir en el
      // `kind` para heredar un layout es la clase de atajo que se cobra dos
      // meses después, cuando alguien filtre por kind y encuentre un ángulo en
      // milímetros.
      kind: 'tramo-largo',
      label: lado === 'anterior' ? 'Al punto anterior' : 'Al punto siguiente',
      valueMm: largo,
      unit: 'mm',
      min: 0.1,
      max: 10000,
      primary: true,
      rotulo: 'del punto',
      // Por el helper, no sumando `position`: sumarla ignora el GIRO, y sobre
      // una pieza girada los chips saldrían en otro sitio del lienzo. Lo cazó
      // el trinquete de `pieceSpace`, que existe justo por esto.
      a: pieceLocalToPattern(v.punto, piece),
      b: pieceLocalToPattern(propio, piece),
      // La normal TAMBIÉN pasa por el giro. Escribí lo contrario y estaba al
      // revés: `a` y `b` van girados, así que una normal sin girar queda
      // PARALELA al segmento que dibuja. Medido sobre una pieza a 90°: los dos
      // chips aterrizaban encima de su propia línea en vez de al lado.
      // `cotasDeLineaInterna` ya lo hacía bien; el helper existe desde #1068.
      outward: pieceLocalToPatternDirection(haciaFuera, piece),
      // No construye el contorno aquí: devuelve A DÓNDE va el nodo y deja que
      // lo escriba `useEditPattern`, que es quien ya lo hace en el arrastre —
      // con su compensación de pivote, su re-anclado de piquetes y su lote de
      // deshacer. Reconstruirlo aquí sería un segundo escritor del mismo hecho,
      // que es el fallo que este repo tiene escrito con nombre propio.
      apply: (v2) => ({
        kind: 'nodo' as const,
        pieceId: piece.id,
        commandIndex,
        destino: { x: v.punto.x + dir.x * v2, y: v.punto.y + dir.y * v2 },
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
  if (!piece || seleccionados.size === 0) return null;
  const nodos = [...seleccionados];
  const grupo = anchorGroupOf(piece.outline, nodos[0]);
  if (nodos.length !== grupo.length || !nodos.every((n) => grupo.includes(n))) return null;
  return { pieceId: piece.id, commandIndex: nodos[0] };
}
