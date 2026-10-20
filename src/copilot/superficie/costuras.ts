import type { PatternPiece, Seam } from '../../types/types';
import { largosDeCostura } from '../../utils/seam/largoCosido';
import { metricasDeCaminar, TOLERANCIA_CAMINAR_MM, type BandaDeDesajuste } from '../../utils/seam/caminarCostura';
import { mirrorPctRange } from '../../utils/seam/seamRange';

/** Los números de la superficie van en mm, con un decimal. */
export const unDecimal = (v: number) => Math.round(v * 10) / 10;

export interface CosturaMedida {
  id: string;
  a: { piece_id: string; edge: string; t_start: number; t_end: number; length: number | null };
  b: { piece_id: string; edge: string; t_start: number; t_end: number; reversed: boolean; length: number | null };
  /** B menos A, en mm. */
  delta: number | null;
  ease_percent: number | null;
  expected_ease: number;
  tolerance: number;
  band: BandaDeDesajuste | null;
  walks: boolean | null;
  /** El frunce o el embebido que María le puso, en % (100 = ninguno): una diferencia puede ser a propósito. */
  tension: number;
  /** Apagada, la costura queda fuera de la simulación. */
  active: boolean;
}

/**
 * Una costura medida en el momento por sus dos tramos cosidos (spec § 5.3,
 * regla 2). La holgura buscada es 0 salvo que quien llama la pase: Vina no la
 * adivina por la categoría de la pieza (decisión 2 del plan de 1a).
 */
export function medirCostura(
  seam: Seam,
  pieces: readonly PatternPiece[],
  opciones: { toleranceMm?: number; easeMm?: number } = {},
): CosturaMedida {
  const { a, b } = largosDeCostura(seam, pieces);
  const tolerancia = opciones.toleranceMm ?? TOLERANCIA_CAMINAR_MM;
  const holgura = opciones.easeMm ?? 0;
  const m = a != null && b != null ? metricasDeCaminar(a, b, tolerancia, holgura) : null;
  // Un B invertido guarda su rango en el sentido de cosido (`seamRange.ts`);
  // aquí se lee en el de su borde, como lo recibe `sew` y lo mide `measure`.
  const [bDesde, bHasta] = seam.pieceB.reversed === true
    ? mirrorPctRange([seam.pieceB.tStart ?? 0, seam.pieceB.tEnd ?? 1])
    : [seam.pieceB.tStart ?? 0, seam.pieceB.tEnd ?? 1];
  return {
    id: seam.id,
    a: {
      piece_id: seam.pieceA.pieceId, edge: seam.pieceA.edgeName,
      t_start: seam.pieceA.tStart ?? 0, t_end: seam.pieceA.tEnd ?? 1, length: a != null ? unDecimal(a) : null,
    },
    b: {
      piece_id: seam.pieceB.pieceId, edge: seam.pieceB.edgeName,
      t_start: bDesde, t_end: bHasta,
      reversed: seam.pieceB.reversed === true, length: b != null ? unDecimal(b) : null,
    },
    delta: m ? unDecimal(m.delta) : null,
    ease_percent: m ? unDecimal(m.easePercent) : null,
    expected_ease: holgura,
    tolerance: tolerancia,
    band: m?.band ?? null,
    walks: m?.walks ?? null,
    tension: seam.tension,
    active: seam.active !== false,
  };
}
