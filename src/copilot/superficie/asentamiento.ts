/**
 * Cuándo está quieta la tela (IA 1b-2). Medido el 09-10 con la camisa de
 * María en WebGPU: el percentil 95 del desplazamiento por cuadro baja de
 * 4,9 mm a ~0,01 mm hacia el cuadro 500, y ahí se queda entre 0,006 y 0,015;
 * el máximo nunca baja de 0,14, porque unos pocos vértices tiemblan siempre.
 * Plan `docs/superpowers/plans/2026-10-09-ia-superficie-1b2-ajuste.md`.
 */

/** Por debajo de esto por cuadro (percentil 95), la tela no se mueve: ~1,2 mm/s de simulación. */
export const UMBRAL_MM_POR_CUADRO = 0.02;
/** Lecturas seguidas bajo el umbral. */
export const SEGUIDAS = 3;
/** Antes no: a los 150 cuadros el tirante del cuerpo (TSL) recaptura la tela y cambia cómo cae. */
export const MINIMO_DE_CUADROS = 180;
/** Entre dos lecturas: en TSL la malla se relee del GPU cada 15 cuadros. */
export const CUADROS_POR_LECTURA = 30;

/** Cuánto se movió la tela entre dos lecturas: el percentil 95 de sus vértices, en mm por cuadro. */
export function movimientoP95(antes: Float32Array, despues: Float32Array, cuadros: number): number {
  const n = Math.floor(Math.min(antes.length, despues.length) / 3);
  if (n === 0 || cuadros <= 0) return 0;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = 3 * i;
    d[i] = Math.hypot(despues[k] - antes[k], despues[k + 1] - antes[k + 1], despues[k + 2] - antes[k + 2]);
  }
  d.sort();
  return (d[Math.min(n - 1, Math.floor(0.95 * n))] * 1000) / cuadros;
}

/** Dos lecturas idénticas son la misma tela: no hubo dato nuevo entre ellas, no que la tela esté quieta. */
export function mismaTela(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Quieta: pasados los cuadros mínimos, las últimas lecturas se mueven menos que el umbral. */
export function estaAsentada(movimientos: readonly number[], cuadros: number): boolean {
  if (cuadros < MINIMO_DE_CUADROS || movimientos.length < SEGUIDAS) return false;
  return movimientos.slice(-SEGUIDAS).every(m => m < UMBRAL_MM_POR_CUADRO);
}
