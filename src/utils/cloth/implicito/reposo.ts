/**
 * El reposo de la tela (spec 2026-10-13 §4.1.2 y §4.1.6): cada triángulo recuerda su forma en el patrón
 * plano, ya girado al marco del hilo, y cada vértice recibe gramaje·A0/3 de cada triángulo vecino.
 */

export interface Reposo {
  /**
   * Por triángulo a0 a1 a2 b0 b1 b2 A0: las columnas de F = Ds·Dm⁻¹ son f_u = Σ a_k·x_k (a lo ancho) y
   * f_v = Σ b_k·x_k (a lo largo del hilo); A0 es el área en el patrón (m²).
   */
  coef: Float64Array;
  /** kg por vértice */
  masa: Float64Array;
}

/** `uv`: el patrón en el marco del hilo (m), de `aMarcoDelHilo`; `densidad` en kg/m². */
export function prepararReposo(uv: Float64Array, tris: Uint32Array, densidad: number, piezaDeTri?: ArrayLike<number>): Reposo {
  const n = uv.length / 2, nt = tris.length / 3;
  const coef = new Float64Array(7 * nt), masa = new Float64Array(n);
  const signos = new Map<number, number>();
  for (let t = 0; t < nt; t++) {
    const i0 = tris[3 * t], i1 = tris[3 * t + 1], i2 = tris[3 * t + 2];
    const d00 = uv[2 * i1] - uv[2 * i0], d01 = uv[2 * i2] - uv[2 * i0];
    const d10 = uv[2 * i1 + 1] - uv[2 * i0 + 1], d11 = uv[2 * i2 + 1] - uv[2 * i0 + 1];
    const det = d00 * d11 - d01 * d10;
    if (!(Math.abs(det) > 1e-14)) throw new Error(`prepararReposo: el triángulo ${t} no tiene área en el patrón`);
    const pieza = piezaDeTri ? piezaDeTri[t] : 0, signo = signos.get(pieza);
    if (signo === undefined) signos.set(pieza, Math.sign(det));
    else if (Math.sign(det) !== signo) throw new Error(`prepararReposo: el triángulo ${t} va al revés que los demás de su pieza`);
    // Dm⁻¹ = [[d11, −d01], [−d10, d00]] / det
    const a1 = d11 / det, a2 = -d10 / det, b1 = -d01 / det, b2 = d00 / det;
    const A0 = Math.abs(det) / 2;
    coef.set([-(a1 + a2), a1, a2, -(b1 + b2), b1, b2, A0], 7 * t);
    masa[i0] += (densidad * A0) / 3;
    masa[i1] += (densidad * A0) / 3;
    masa[i2] += (densidad * A0) / 3;
  }
  const suelto = masa.findIndex((m) => m === 0);
  if (suelto >= 0) throw new Error(`prepararReposo: el vértice ${suelto} no está en ningún triángulo`);
  return { coef, masa };
}
