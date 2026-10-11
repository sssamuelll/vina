/**
 * Cuánto espera un worker de tela (WASM o CPU) antes del paso siguiente. Cada
 * paso simula 1/60 s: si tardó menos, espera lo que falta para no correr más
 * rápido que el tiempo real; si tardó más, sigue en el acto.
 *
 * Antes esperaba lo que había tardado el paso (hasta 50 ms) cuando iba lento,
 * «para no saturar al hilo principal»: en el equipo que más lo necesita la
 * física pasaba hasta la mitad del tiempo parada (un paso de 20 ms esperaba
 * otros 20). Saturar no pasa: el hilo principal solo guarda el último cuadro y
 * lo copia una vez por cuadro de render (2026-10-11).
 */
export function esperaTrasElPaso(pasoMs: number): number {
  return Math.max(0, 1000 / 60 - pasoMs);
}
