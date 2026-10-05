import type { PatternPiece, Seam } from '../../types/types';
import { largosDeCostura } from '../../utils/seam/largoCosido';
import { metricasDeCaminar, TOLERANCIA_CAMINAR_MM, type BandaDeDesajuste } from '../../utils/seam/caminarCostura';

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
  return {
    id: seam.id,
    a: {
      piece_id: seam.pieceA.pieceId, edge: seam.pieceA.edgeName,
      t_start: seam.pieceA.tStart ?? 0, t_end: seam.pieceA.tEnd ?? 1, length: a != null ? unDecimal(a) : null,
    },
    b: {
      piece_id: seam.pieceB.pieceId, edge: seam.pieceB.edgeName,
      t_start: seam.pieceB.tStart ?? 0, t_end: seam.pieceB.tEnd ?? 1,
      reversed: seam.pieceB.reversed === true, length: b != null ? unDecimal(b) : null,
    },
    delta: m ? unDecimal(m.delta) : null,
    ease_percent: m ? unDecimal(m.easePercent) : null,
    expected_ease: holgura,
    tolerance: tolerancia,
    band: m?.band ?? null,
    walks: m?.walks ?? null,
  };
}
