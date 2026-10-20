/**
 * Lo que mide «Caminar costura», sacado del hook para que lo usen igual la
 * herramienta y la superficie de los agentes (spec 2026-10-05 § 5.1): una
 * sola medida de si dos tramos caminan juntos.
 */
export const TOLERANCIA_CAMINAR_MM = 3;

export type BandaDeDesajuste = 'green' | 'yellow' | 'red';

/** Verde por debajo de la tolerancia, amarillo hasta el doble, rojo más allá. */
export function bandaDeDesajuste(deltaAbsMm: number, toleranciaMm: number): BandaDeDesajuste {
  if (deltaAbsMm < toleranciaMm) return 'green';
  if (deltaAbsMm < 2 * toleranciaMm) return 'yellow';
  return 'red';
}

export interface MetricasDeCaminar {
  lengthA: number;
  lengthB: number;
  /** B menos A, con signo: lo que enseña el panel de la herramienta. */
  delta: number;
  /** El delta sobre A, en %. */
  easePercent: number;
  /** La banda de lo que sobra después de la holgura buscada. */
  band: BandaDeDesajuste;
  /** Camina: la banda es verde. */
  walks: boolean;
}

/**
 * `holguraBuscadaMm` es la holgura que se quiere a propósito, B menos A (el
 * embebido de una manga): camina si |delta − holgura| < tolerancia. Vale 0
 * salvo que quien llama la diga; Vina no la adivina.
 */
export function metricasDeCaminar(
  lenA: number,
  lenB: number,
  toleranciaMm: number = TOLERANCIA_CAMINAR_MM,
  holguraBuscadaMm = 0,
): MetricasDeCaminar {
  const delta = lenB - lenA;
  const easePercent = lenA > 0 ? (delta / lenA) * 100 : 0;
  const band = bandaDeDesajuste(Math.abs(delta - holguraBuscadaMm), toleranciaMm);
  return { lengthA: lenA, lengthB: lenB, delta, easePercent, band, walks: band === 'green' };
}
