/**
 * Las telas medidas en la referencia privada, llevadas al modelo del motor (tela.ts, E12 del spec 2026-10-13). Cada tela
 * trae la tracción de una tira colgada de su peso a lo largo, a lo ancho y en los dos bies (modo exacto de la
 * referencia), la flexión de un voladizo de Peirce en las tres direcciones y su gramaje y grosor:
 *
 * - kTrama y kUrdimbre: la rigidez de la tira a lo ancho y a lo largo.
 * - kCizalla: la que da a 45° la rigidez medida en bies, promedio de los dos, con nuestra membrana sin Poisson:
 *   1/E45 = ¼·(1/kTrama + 1/kUrdimbre + 1/kCizalla).
 * - bTrama, bUrdimbre y bBies: G = ρ·g·c³ del voladizo (c, la longitud de flexión), en µN·m; la tira cortada a lo
 *   ancho se curva a lo ancho (bTrama). Sin bies medido, el promedio de las otras dos.
 */
import { PANDEO_CALIBRADO, type TelaFisica } from '../tela';

type Direccion = 'urdimbre' | 'trama' | 'bies+45' | 'bies-45';

/** Una corrida del voladizo apoyado de la referencia: el largo fuera de la mesa y sobre ella (mm) y el ángulo de la cuerda. */
export interface CorridaDePeirce {
  L_nominal_mm: number;
  S_mm: number;
  theta_deg: number;
  /** el ángulo cae entre 10 y 70°, donde la fórmula de Peirce vale */
  valida_10_70: boolean;
}

/** El registro de una tela en `telas/resultados.json` (solo lo que se lee aquí). */
export interface TelaMedidaEnLaReferencia {
  gramaje_g_m2: number;
  grosor_mm_informacion: number;
  traccion?: Partial<Record<Direccion, { fitting?: { k_mean_N_m: number } }>>;
  peirce?: Partial<Record<'urdimbre' | 'trama' | 'bies', { G_ef_media_N_m?: number | null; corridas?: CorridaDePeirce[] }>>;
  cusick?: Record<string, { calidad: number; pd_mm: number; dc_final: number; ondas_final_umbral4?: number; dc_primeros_3s?: Array<[number, number, number]> }>;
}

/** El Cusick de la referencia en su modo exacto a 5 mm: coeficiente, ondas y la caída de los primeros 3 s (t, coeficiente). */
export function cusickDeLaReferencia(m: TelaMedidaEnLaReferencia): { coeficiente: number; ondas: number | null; primeros: Array<[number, number]> } | null {
  const c = m.cusick?.cusick_q2_pd5;
  if (!c) return null;
  return { coeficiente: c.dc_final, ondas: c.ondas_final_umbral4 ?? null, primeros: (c.dc_primeros_3s ?? []).map(([t, dc]) => [t, dc]) };
}

/** La tela del motor; null si falta la tracción a lo largo o a lo ancho o la flexión a lo largo o a lo ancho. */
export function telaMedida(m: TelaMedidaEnLaReferencia, friccion: { cuerpo: number; tela: number }): TelaFisica | null {
  const k = (d: Direccion) => m.traccion?.[d]?.fitting?.k_mean_N_m;
  const G = (d: 'urdimbre' | 'trama' | 'bies') => m.peirce?.[d]?.G_ef_media_N_m ?? undefined;
  const kT = k('trama'), kU = k('urdimbre'), gT = G('trama'), gU = G('urdimbre');
  if (!kT || !kU || !gT || !gU) return null;
  const sesgos = [k('bies+45'), k('bies-45')].filter((v): v is number => !!v);
  let kCizalla = Math.max(kT, kU);
  if (sesgos.length > 0) {
    const e45 = sesgos.reduce((a, b) => a + b, 0) / sesgos.length;
    const inversa = 4 / e45 - 1 / kT - 1 / kU;
    if (inversa > 1 / kCizalla) kCizalla = 1 / inversa;
  }
  const gB = G('bies') ?? (gT + gU) / 2;
  return {
    gramaje: m.gramaje_g_m2,
    grosor: m.grosor_mm_informacion,
    kTrama: kT,
    kUrdimbre: kU,
    kCizalla,
    pandeo: PANDEO_CALIBRADO,
    bTrama: 1e6 * gT,
    bUrdimbre: 1e6 * gU,
    bBies: 1e6 * gB,
    friccionCuerpo: friccion.cuerpo,
    friccionTela: friccion.tela,
  };
}
