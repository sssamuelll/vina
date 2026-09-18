/**
 * Semantic Edge Detection — automatically labels edges on pattern pieces.
 *
 * Uses geometry heuristics (position, angle, length) and piece naming
 * to assign meaningful names like "armhole", "hemline", "sideSeam".
 *
 * @module semanticEdges
 */

import type { PathCommand, PatternPiece, SemanticEdge, SemanticEdgeType } from '../types/types';
import { analyzeOutline, type OutlineTram } from './outlineAnalysis';

// ─── Tram facts (geometry via outlineAnalysis, M1 camisa de María) ───────────

function isNearlyHorizontal(angle: number): boolean {
  const a = Math.abs(angle);
  return a < 25 || a > 155;
}

function isNearlyVertical(angle: number): boolean {
  const a = Math.abs(angle);
  return a > 65 && a < 115;
}

// ─── Piece Type Guessing ──────────────────────────────────────────────────────

type PieceCategory = 'bodice-front' | 'bodice-back' | 'sleeve' | 'collar' |
  'skirt' | 'trouser' | 'waistband' | 'unknown';

function guessPieceCategory(name: string): PieceCategory {
  const n = name.toLowerCase();
  if (/front|delantero|frente|devant/.test(n)) return 'bodice-front';
  if (/back|espalda|trasero|dos/.test(n)) return 'bodice-back';
  if (/sleeve|manga|manche/.test(n)) return 'sleeve';
  if (/collar|cuello|col/.test(n)) return 'collar';
  if (/skirt|falda|jupe/.test(n)) return 'skirt';
  if (/trouser|pantal|pantalon/.test(n)) return 'trouser';
  if (/waist|cintura|ceinture|pretina/.test(n)) return 'waistband';
  return 'unknown';
}

/**
 * Resolve the edge-detection category, PREFERRING the piece's explicit
 * `category`/`side` (set by the agent's classifyPiece or the user) over
 * guessing from the name. This is what lets edge detection work for DXF
 * pieces: their CAD block names carry no garment role, but once the agent
 * classifies them (e.g. bodice/front, collar) we map that to the internal
 * category and emit role-bearing edges (armhole, neckline, collarNeckEdge)
 * instead of inert positional ones. Name-guessing remains the fallback.
 */
function resolveCategory(piece: PatternPiece): PieceCategory {
  switch (piece.category) {
    case 'bodice': return piece.side === 'back' ? 'bodice-back' : 'bodice-front';
    case 'sleeve': return 'sleeve';
    case 'collar': return 'collar';
    case 'skirt': return 'skirt';
    case 'trouser': return 'trouser';
    case 'waistband': return 'waistband';
    default: return guessPieceCategory(piece.name);
  }
}

// ─── Main Detection ───────────────────────────────────────────────────────────

/**
 * Auto-detect semantic edges on a pattern piece.
 * Uses geometry heuristics + piece name for classification.
 */
export function detectSemanticEdges(piece: PatternPiece): SemanticEdge[] {
  const analysis = analyzeOutline(piece.outline);
  if (!analysis || analysis.trams.length < 2) return [];

  const category = resolveCategory(piece);
  const edges: SemanticEdge[] = [];

  // ── Tram facts ──────────────────────────────────────────────────────────
  // Curvature is REAL geometry (signed sagitta over the polyline), not the
  // command type: real CAD exports deliver curves as dense `L` polylines,
  // which made the old `isCurved(cmd.type)` check — and with it the
  // neckline/armhole/sleeveCap branches — dead code for every imported
  // pattern (M1, camisa de María).
  const CURVE_MIN_BOW = 0.05;
  type Fact = {
    tram: OutlineTram;
    concave: boolean;
    convex: boolean;
    centerX: boolean;
    zone: 'top' | 'bottom' | 'left' | 'right' | 'center';
  };
  const facts: Fact[] = analysis.trams.map(tram => {
    const curved = tram.bowRatio >= CURVE_MIN_BOW;
    return {
      tram,
      concave: curved && tram.sagitta < 0,
      convex: curved && tram.sagitta > 0,
      centerX: tram.relX > 0.3 && tram.relX < 0.7,
      zone:
        tram.relY < 0.2 ? 'top'
        : tram.relY > 0.8 ? 'bottom'
        : tram.relX < 0.2 ? 'left'
        : tram.relX > 0.8 ? 'right'
        : 'center',
    };
  });

  // Full piece vs half-on-fold: a bodice drawn complete has its neckline in
  // the CENTER of the top — then BOTH verticals are side seams. A half
  // pattern has the neckline at one side and the straight vertical at the
  // other is the fold (centerFront/centerBack). The old code assumed
  // half-on-fold always, mislabeling a full piece's second side seam.
  const hasCenterNeckline = facts.some(
    f => f.concave && f.centerX && f.tram.relY < 0.45,
  );

  for (const f of facts) {
    const { tram, concave, convex, centerX, zone } = f;
    const avgAngle = tram.meanAngle;

    let name = 'edge';
    let edgeType: SemanticEdgeType = 'unknown';
    let matchHint: string | undefined;

    if (category === 'bodice-front' || category === 'bodice-back') {
      const opp = category === 'bodice-front' ? 'back' : 'front';
      if (concave && centerX && tram.relY < 0.45) {
        name = 'neckline'; edgeType = 'opening'; matchHint = 'pairs with collarNeckEdge';
      } else if (concave && !centerX && tram.relY < 0.55) {
        // Armholes scoop into the upper sides — on a real bodice their
        // midpoint sits BELOW the strict top band (relY ≈ 0.27 on María's
        // shirt), which is why the old zone-gated rule never fired.
        name = 'armhole'; edgeType = 'seam'; matchHint = 'pairs with sleeveCap';
      } else if (zone === 'top' && isNearlyHorizontal(avgAngle)) {
        name = 'shoulder'; edgeType = 'seam'; matchHint = `pairs with ${opp}-shoulder`;
      } else if (zone === 'bottom' && isNearlyHorizontal(avgAngle)) {
        name = 'hemline'; edgeType = 'hem';
      } else if (isNearlyVertical(avgAngle) && tram.relX < 0.2) {
        if (hasCenterNeckline) {
          name = 'sideSeam'; edgeType = 'seam'; matchHint = `pairs with ${opp}-sideSeam`;
        } else {
          name = category === 'bodice-front' ? 'centerFront' : 'centerBack';
          edgeType = 'fold';
        }
      } else if (isNearlyVertical(avgAngle) && tram.relX > 0.8) {
        name = 'sideSeam'; edgeType = 'seam'; matchHint = `pairs with ${opp}-sideSeam`;
      } else if (zone === 'top') {
        name = 'neckline'; edgeType = 'opening'; matchHint = 'pairs with collarNeckEdge';
      }
    } else if (category === 'sleeve') {
      if (convex && tram.relY < 0.5) {
        name = 'sleeveCap'; edgeType = 'seam'; matchHint = 'pairs with armhole';
      } else if (zone === 'bottom' && isNearlyHorizontal(avgAngle)) {
        name = 'cuffEdge'; edgeType = 'hem';
      } else if (isNearlyVertical(avgAngle)) {
        name = 'underarmSeam'; edgeType = 'seam'; matchHint = 'self-close';
      }
    } else if (category === 'collar') {
      // A collar is a long strip: the bottom long edge sews to the neckline,
      // the top is the free outer edge, the short ends are collar points.
      if (zone === 'bottom' && isNearlyHorizontal(avgAngle)) {
        name = 'collarNeckEdge'; edgeType = 'seam'; matchHint = 'pairs with neckline';
      } else if (zone === 'top' && isNearlyHorizontal(avgAngle)) {
        name = 'collarOuterEdge'; edgeType = 'hem';
      } else {
        // self-close: los dos extremos cortos de la banda se cosen ENTRE SÍ
        // para cerrar el aro del cuello (el residual nombrado "collar
        // short-end closure") — sin esto nada ancla la banda y rota libre.
        // El pass genérico de autoSew (mismo mecanismo que underarmSeam)
        // emite el cierre cuando la pieza tiene exactamente 2 de estos.
        name = 'collarEnd'; edgeType = 'seam'; matchHint = 'self-close';
      }
    } else if (category === 'skirt') {
      if (zone === 'top' && isNearlyHorizontal(avgAngle)) {
        name = 'waistline'; edgeType = 'seam'; matchHint = 'pairs with waistbandEdge';
      } else if (zone === 'bottom') {
        name = 'hemline'; edgeType = 'hem';
      } else if (isNearlyVertical(avgAngle)) {
        name = 'sideSeam'; edgeType = 'seam'; matchHint = 'pairs with sideSeam';
      }
    } else if (category === 'trouser') {
      if (zone === 'top' && isNearlyHorizontal(avgAngle)) {
        name = 'waistline'; edgeType = 'seam'; matchHint = 'pairs with waistbandEdge';
      } else if (zone === 'bottom') {
        name = 'hemline'; edgeType = 'hem';
      } else if (concave || convex) {
        name = 'crotchCurve'; edgeType = 'seam'; matchHint = 'pairs with crotchCurve';
      } else if (isNearlyVertical(avgAngle)) {
        name = 'sideSeam'; edgeType = 'seam'; matchHint = 'pairs with sideSeam';
      }
    } else if (category === 'waistband') {
      if (zone === 'bottom' && isNearlyHorizontal(avgAngle)) {
        name = 'waistbandEdge'; edgeType = 'seam'; matchHint = 'pairs with waistline';
      } else if (zone === 'top' && isNearlyHorizontal(avgAngle)) {
        name = 'waistbandFold'; edgeType = 'fold';
      } else {
        name = 'waistbandEnd'; edgeType = 'seam';
      }
    } else {
      // Generic: assign by zone
      if (zone === 'top') { name = 'topEdge'; edgeType = concave || convex ? 'seam' : 'unknown'; }
      else if (zone === 'bottom') { name = 'bottomEdge'; edgeType = 'hem'; }
      else if (zone === 'left') { name = 'leftEdge'; edgeType = 'fold'; }
      else if (zone === 'right') { name = 'rightEdge'; edgeType = 'seam'; }
    }

    // Deduplicate names within piece
    const existing = edges.filter(e => e.name === name || e.name.startsWith(`${name}-`));
    const finalName = existing.length > 0 ? `${name}-${existing.length + 1}` : name;

    edges.push({
      id: `${piece.id}:${finalName}`,
      name: finalName,
      segmentRange: tram.cmdRange,
      edgeType,
      matchHint,
      length: Math.round(tram.arcLength * 100) / 100,
    });
  }

  return edges;
}

/**
 * Rango de comandos del borde semántico que contiene `cmdIndex`, o el comando
 * suelto si la pieza no tiene bordes detectados.
 *
 * Es la unidad en la que el usuario VE un borde, y por tanto la unidad en la
 * que tienen que trabajar las herramientas que lo tocan. En un rectángulo
 * dibujado a mano un borde es un comando y da igual; en un patrón importado un
 * borde son 14-20 comandos (los contornos vienen como polilíneas densas de
 * `L`, cabecera de outlineAnalysis.ts) y confundir las dos unidades hace que
 * el gesto no llegue (#1025) o que el resalte enseñe una parte de lo que se va
 * a coser (#1042).
 *
 * Hermana de `resolveEdgeName`: la misma búsqueda, devolviendo el rango en vez
 * del nombre.
 */
export function edgeRangeForCommand(
  piece: Pick<PatternPiece, 'edges'> | undefined,
  cmdIndex: number,
): [number, number] {
  const semantic = piece?.edges?.find(
    e => cmdIndex >= e.segmentRange[0] && cmdIndex < e.segmentRange[1],
  );
  return semantic ? semantic.segmentRange : [cmdIndex, cmdIndex + 1];
}

/**
 * El rango de comandos que de verdad se puede MEDIR de un borde semántico.
 *
 * Hay un tramo de contorno que no tiene comando propio: el de CIERRE, el que
 * la `Z` dibuja de vuelta al punto de la `M`. `flattenPathWithSource` etiqueta
 * su punto con el índice de la `M` (lore de Fase 3, y de ese etiquetado
 * dependen las esquinas de costura, `outlineRing.ts` y el hit-test de bordes),
 * así que un borde hecho SOLO de ese tramo acaba con `segmentRange [0,1]` — un
 * rango que apunta a la `M`, que no dibuja nada, y por tanto mide CERO.
 *
 * En un rectángulo eso es un lado entero. Medido el 2026-09-05: «Medir el
 * borde» sobre el lado izquierdo devolvía «0.0 mm».
 *
 * Se traduce AL LEER, no al escribir. Cambiar lo que emite el productor movería
 * el rango de ese borde para los 56 archivos que lo leen (158 usos), y ya se
 * midió lo
 * que cuesta: sobre el DXF real de María, 42 clics que enganchaban un borde
 * pasaban a caer en «pieza» porque el hit-test del margen busca por la
 * etiqueta vieja. Aquí solo lo ven los tres consumidores que necesitan medir.
 *
 * La traducción es inequívoca porque solo se aplica a un rango de UN comando
 * que además es la `M`: la `M` no dibuja, así que ese rango no puede significar
 * otra cosa. Un rango ancho que empieza en la `M` (p. ej. el contorno entero,
 * `[0, outline.length]`) se deja como está.
 *
 * LO QUE NO ARREGLA, dicho: si el tramo de cierre comparte borde con otros
 * comandos, el productor lo excluye del rango y ese borde sigue midiendo de
 * menos — un segmento de polilínea sobre ~50 en el patrón de María. El caso
 * visible, el del rectángulo, es este.
 */
export function rangoMedibleDeBorde(
  outline: PathCommand[] | undefined,
  rango: readonly [number, number],
): [number, number] {
  const [desde, hasta] = rango;
  if (!outline || hasta !== desde + 1 || outline[desde]?.type !== 'M') {
    return [desde, hasta];
  }
  // Hacia DELANTE hasta la primera `Z`, que es la de este subcamino. Buscar la
  // última hacia atrás parecía equivalente y no lo es: con dos subcaminos
  // —una pieza con agujero— devolvía el cierre del OTRO, y el elástico o el
  // pliegue se dibujaban sobre un borde ajeno. Lo cazó la revisión adversarial
  // del 06-09, midiéndolo: `M0 L1 L2 Z3 M4 L5 L6 Z7`, el cierre del primer
  // subcamino daba `[7,8]`.
  for (let i = desde + 1; i < outline.length; i++) {
    if (outline[i].type === 'M') break;
    if (outline[i].type === 'Z') return [i, i + 1];
  }
  return [desde, hasta];
}

/**
 * ESTE LADO SE QUEDA MUDO POR TRES VÍAS, y esta función solo cierra una.
 *
 * Medido entre el 2026-09-06 y el 2026-09-18, con tres sesiones tirando del
 * hilo por puertas distintas:
 *
 *   1. el RANGO sin traducir — `segmentRange` apunta a la `M`, que no dibuja,
 *      y quien mida ahí obtiene cero. Lo cierra `rangoMedibleDeBorde`, aquí
 *      arriba, y lo vigila `scripts/medir-bordes-lint.mjs` (#1143).
 *   2. el ÍNDICE sin traducir — un hit-test devuelve el índice de la `Z` y
 *      quien lo recibe lo compara contra rangos rotulados con la `M`. Lo cierra
 *      esta función. `useEditPattern.ts:424` hace la misma traducción clavada a
 *      `0`; parecía un bug y no lo es — es consistente con lo que el productor
 *      emite hoy. La causa real es que `nearestSegment` trata dos subcaminos
 *      como uno: reproducido en #1205.
 *   3. el PRODUCTOR, que solo emitía lados dibujados con `L` y dejaba ese tramo
 *      sin entidad propia: sin largo, sin ángulo y sin poder editarse (#1167,
 *      `cotas/segmentPolar.ts`).
 *
 * Ninguna de las tres se ve desde las otras dos: el grep del mecanismo 1 no
 * toca el 2. Lo único que las une es el OBJETO. Si el lado de cierre vuelve a
 * fallar, el censo va por el objeto —quién lo mide, quién lo nombra, quién lo
 * produce, quién lo dibuja— y no por la causa.
 *
 * (La nota va en la cabecera y no en un issue a propósito: las cuatro rondas
 * anteriores tuvieron su issue y el defecto volvió igual. Esto es lo que se lee
 * cuando alguien tropieza.)
 */

/**
 * El índice de comando TAL COMO LO ETIQUETAN los bordes.
 *
 * Hermano de `rangoMedibleDeBorde`, y su inversa: aquel traduce un rango que
 * apunta a la `M` para poder MEDIR el tramo de cierre; este traduce un índice
 * que apunta a la `Z` para poder NOMBRARLO.
 *
 * Hace falta porque los hit-tests recorren `outline` y devuelven el índice del
 * comando que dibuja —para el lado de cierre, el de la `Z`— mientras el
 * productor etiqueta ese mismo tramo con el de la `M` (lore de Fase 3, del que
 * dependen las esquinas de costura y `outlineRing.ts`). Los dos convenios son
 * defendibles; lo que no lo es es que nadie los case.
 *
 * Lo que costaba, medido el 2026-09-06 sobre un rectángulo: clicar el lado
 * IZQUIERDO con Elástico o con Pliegue no hacía absolutamente nada.
 * `resolveEdgeName` caía a `edge-4`, ningún borde se llama así, y los reducers
 * `addElastic`/`addPleat` se van en silencio si el nombre no existe. Un lado
 * entero de cualquier pieza, mudo, en tres herramientas.
 *
 * Se traduce AL LEER, como el hermano: los consumidores de `resolveEdgeName`
 * son tres, no los 56 archivos que leen `segmentRange`.
 */
export function indiceSegunLosBordes(
  outline: PathCommand[] | undefined,
  cmdIndex: number,
): number {
  if (!outline || outline[cmdIndex]?.type !== 'Z') return cmdIndex;
  // La `M` que abre el subcamino de esta `Z`.
  for (let i = cmdIndex - 1; i >= 0; i--) {
    if (outline[i].type === 'M') return i;
  }
  return cmdIndex;
}

/**
 * Find an edge by name (case-insensitive, partial match).
 */
export function findEdgeByName(edges: SemanticEdge[], query: string): SemanticEdge | undefined {
  const q = query.toLowerCase();
  return edges.find(e => e.name.toLowerCase() === q)
    ?? edges.find(e => e.name.toLowerCase().includes(q));
}

/**
 * Get matching edges for auto-sew across two pieces.
 */
export function findMatchingEdges(
  pieceA: PatternPiece,
  pieceB: PatternPiece,
): { edgeA: SemanticEdge; edgeB: SemanticEdge }[] {
  const matches: { edgeA: SemanticEdge; edgeB: SemanticEdge }[] = [];
  if (!pieceA.edges || !pieceB.edges) return matches;

  for (const eA of pieceA.edges) {
    if (!eA.matchHint) continue;
    for (const eB of pieceB.edges) {
      // Check if A's hint mentions B's name or vice versa
      const hintA = eA.matchHint.toLowerCase();
      const hintB = eB.matchHint?.toLowerCase() ?? '';
      if (hintA.includes(eB.name.toLowerCase()) || hintB.includes(eA.name.toLowerCase())) {
        matches.push({ edgeA: eA, edgeB: eB });
      }
    }
  }

  return matches;
}

// ─── Per-edge metadata preservation (parity plan Fase 6) ──────────────────────

/**
 * Carry user-set per-edge SA widths across an edge re-detection, re-keying
 * by edge NAME (stable across re-detection; positional `segmentRange`
 * indices are not).
 *
 * Fase 6 fix: the generative load path (`loadProject` → re-detect after
 * category/side classification) replaced `piece.edges` wholesale —
 * `detectSemanticEdges` never copies `seamAllowanceWidth`, so widths the
 * user set with the Seam Allowance tool silently vanished on every
 * load→save→reload round trip.
 *
 * El nombre es la única identidad que sobrevive a la re-detección; copiar
 * ancho y tramos por esa clave evita perder intención sin inventar un destino
 * para un borde renombrado o desaparecido.
 */
export function preserveEdgeWidthsByName(
  oldEdges: SemanticEdge[] | undefined,
  newEdges: SemanticEdge[],
): SemanticEdge[] {
  if (!oldEdges || oldEdges.length === 0) return newEdges;
  const allowanceByName = new Map<
    string,
    Pick<SemanticEdge, 'seamAllowanceWidth' | 'seamAllowanceSpans'>
  >();
  for (const e of oldEdges) {
    if (e.seamAllowanceWidth != null || e.seamAllowanceSpans != null) {
      allowanceByName.set(e.name, {
        seamAllowanceWidth: e.seamAllowanceWidth,
        seamAllowanceSpans: e.seamAllowanceSpans?.map((span) => ({ ...span })),
      });
    }
  }
  if (allowanceByName.size === 0) return newEdges;
  return newEdges.map(e => {
    const allowance = allowanceByName.get(e.name);
    return allowance ? { ...e, ...allowance } : e;
  });
}
