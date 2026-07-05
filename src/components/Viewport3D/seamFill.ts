/**
 * Seam fill strip (consejo costura-proceso-real 2026-07-05, sesión 07-06).
 *
 * EL HALLAZGO: la "línea marrón" a lo largo de cada costura cosida no era
 * hilo ni surco — era la PIEL del avatar asomando por la ranura del piso
 * físico (2mm, A3 shell physics: las superficies medias de dos plies en
 * contacto no coinciden). La física es correcta; el render no tiene grosor,
 * así que 2mm de separación = ventana continua a la piel. CLO3D no la
 * muestra porque renderiza tela CON grosor.
 *
 * EL FIX (render-only): triángulos puente entre pares consecutivos de cada
 * costura, añadidos SOLO al index buffer del mesh de render. Usan los
 * vértices existentes — cero vértices nuevos, cero costo por frame (se
 * deforman con la tela vía el mismo position buffer), cero física tocada.
 * El normal-weld ya iguala las normales de ambos lados, así que el strip
 * se sombrea continuo: la costura se lee como superficie, no como void.
 *
 * El piso físico NO se toca: bajarlo a 0 reabre el mecanismo 2 del
 * skin-poke (la cuerda de la sisa atravesando el hombro convexo,
 * diagnóstico 2026-06-26) — este strip compra el look sin ese riesgo.
 *
 * Nota almendra: donde la costura queda abierta (junction dorso-hombro),
 * el puente se estira como membrana de tela — se lee como tensión de
 * prenda en vez de hueco a la piel. El cierre real de la junction es el
 * fix pendiente; el strip lo acompaña sin estorbarlo.
 */

import type { SeamPair } from '../../utils/cloth/seamPairs';

/**
 * Triángulos puente entre los dos bordes de cada costura resuelta.
 *
 * Por cada par consecutivo (k, k+1) de una costura (pares LOCAL en orden t,
 * invariante matchVertices): quad (a0,b0)-(a1,b1) → 2 triángulos. Fans del
 * matching bidireccional (driver repite índice) degradan a 1 triángulo.
 * Winding: el material de tela es DoubleSide — no significativo.
 *
 * @param seamPairs      Pares por costura (seamInitDataToPairs) — índices
 *                       LOCAL por pieza.
 * @param vertexOffsets  pieceId → offset de vértice GLOBAL en el mesh merged
 *                       (orden acumulativo idéntico al packing del solver).
 * @returns              Índices de triángulos GLOBALES para añadir al index
 *                       buffer del render (múltiplo de 3).
 */
export function buildSeamFillIndices(
  seamPairs: SeamPair[],
  vertexOffsets: Map<string, number>,
): number[] {
  const indices: number[] = [];
  for (const sp of seamPairs) {
    const offA = vertexOffsets.get(sp.pieceAId);
    const offB = vertexOffsets.get(sp.pieceBId);
    if (offA === undefined || offB === undefined) continue;
    for (let k = 0; k + 1 < sp.vertexPairs.length; k++) {
      const a0 = sp.vertexPairs[k][0] + offA;
      const b0 = sp.vertexPairs[k][1] + offB;
      const a1 = sp.vertexPairs[k + 1][0] + offA;
      const b1 = sp.vertexPairs[k + 1][1] + offB;
      if (a0 !== a1 && b0 !== b1) {
        indices.push(a0, b0, b1, a0, b1, a1);
      } else if (a0 === a1 && b0 !== b1) {
        indices.push(a0, b0, b1); // fan sobre A
      } else if (b0 === b1 && a0 !== a1) {
        indices.push(a0, b0, a1); // fan sobre B
      }
      // a0===a1 && b0===b1: par duplicado — nada que puentear
    }
  }
  return indices;
}
