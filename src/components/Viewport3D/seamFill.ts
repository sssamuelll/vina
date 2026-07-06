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
 * SOLO PARES COSIDOS (fotos de Samuel 2026-07-06, desde dentro del avatar):
 * la v1 puenteaba TODOS los pares en init — en la almendra abierta
 * (3-13cm) los dos bordes quedan a lados opuestos del brazo y la cuerda
 * recta entre ellos ATRAVIESA el brazo ("la tela como un hacha
 * desmembrando al avatar"). Cosido solo se conoce en runtime → los puentes
 * se construyen en init con sus compuertas (los pares de costura del
 * hinge) y se APLICAN en el settle (frame 150, mismo readback del
 * tether/planchado F1): pasa solo el puente cuyos DOS pares están al piso.
 * Los abiertos se quedan abiertos — ventana honesta hasta el fix de la
 * junction dorso-hombro.
 *
 * El piso físico NO se toca: bajarlo a 0 reabre el mecanismo 2 del
 * skin-poke (la cuerda de la sisa atravesando el hombro convexo,
 * diagnóstico 2026-06-26) — este strip compra el look sin ese riesgo.
 */

import type { SeamPair } from '../../utils/cloth/seamPairs';
import { DEFAULT_SEAM_CONFIG } from '../../utils/cloth/seamAssembly';

/**
 * Umbral "cosido" del filtro (m): piso terminal del decay + ε de
 * asentamiento — el MISMO gate del press F1 (pressCrossSeamAngles). A 5mm
 * el par está cosido de verdad; una almendra abierta (3-10cm) NO pasa.
 */
export const SEAM_FILL_SEWN_THRESHOLD_M = DEFAULT_SEAM_CONFIG.restLengthFloor + 0.003;

/** Un puente candidato: sus triángulos + los dos pares de costura que lo gatean. */
export interface SeamFillBridge {
  /** Índices GLOBALES de triángulos (múltiplo de 3). */
  tris: number[];
  /** Pares de costura del segmento [a0,b0,a1,b1] — compuertas del filtro sewn. */
  gates: [number, number, number, number];
}

/**
 * Construye los puentes candidatos entre los dos bordes de cada costura.
 *
 * Por cada par consecutivo (k, k+1) de una costura (pares LOCAL en orden t,
 * invariante matchVertices): quad (a0,b0)-(a1,b1) → 2 triángulos. Fans del
 * matching bidireccional (driver repite índice) degradan a 1 triángulo.
 * Winding: el material de tela es DoubleSide — no significativo.
 *
 * NO añade nada al render por sí solo — el consumidor aplica
 * `filterSewnBridges` en el settle con las posiciones reales.
 *
 * @param seamPairs      Pares por costura (seamInitDataToPairs) — índices
 *                       LOCAL por pieza.
 * @param vertexOffsets  pieceId → offset de vértice GLOBAL en el mesh merged
 *                       (orden acumulativo idéntico al packing del solver).
 */
export function buildSeamFillBridges(
  seamPairs: SeamPair[],
  vertexOffsets: Map<string, number>,
): SeamFillBridge[] {
  const bridges: SeamFillBridge[] = [];
  for (const sp of seamPairs) {
    const offA = vertexOffsets.get(sp.pieceAId);
    const offB = vertexOffsets.get(sp.pieceBId);
    if (offA === undefined || offB === undefined) continue;
    for (let k = 0; k + 1 < sp.vertexPairs.length; k++) {
      const a0 = sp.vertexPairs[k][0] + offA;
      const b0 = sp.vertexPairs[k][1] + offB;
      const a1 = sp.vertexPairs[k + 1][0] + offA;
      const b1 = sp.vertexPairs[k + 1][1] + offB;
      let tris: number[] | null = null;
      if (a0 !== a1 && b0 !== b1) {
        tris = [a0, b0, b1, a0, b1, a1];
      } else if (a0 === a1 && b0 !== b1) {
        tris = [a0, b0, b1]; // fan sobre A
      } else if (b0 === b1 && a0 !== a1) {
        tris = [a0, b0, a1]; // fan sobre B
      }
      // a0===a1 && b0===b1: par duplicado — nada que puentear
      if (tris) bridges.push({ tris, gates: [a0, b0, a1, b1] });
    }
  }
  return bridges;
}

/**
 * Filtra puentes por estado COSIDO real: pasan solo aquellos cuyos dos
 * pares de costura están a ≤ threshold en `positions` (las posiciones
 * asentadas del readback del settle — no las de init, donde TODO está
 * abierto). Devuelve los índices aplanados listos para concatenar al
 * index buffer base.
 */
export function filterSewnBridges(
  bridges: SeamFillBridge[],
  positions: Float32Array,
  thresholdM: number = SEAM_FILL_SEWN_THRESHOLD_M,
): number[] {
  const gap = (u: number, v: number) => Math.hypot(
    positions[u * 3] - positions[v * 3],
    positions[u * 3 + 1] - positions[v * 3 + 1],
    positions[u * 3 + 2] - positions[v * 3 + 2],
  );
  const indices: number[] = [];
  for (const br of bridges) {
    const [a0, b0, a1, b1] = br.gates;
    if (gap(a0, b0) <= thresholdM && gap(a1, b1) <= thresholdM) {
      indices.push(...br.tris);
    }
  }
  return indices;
}
