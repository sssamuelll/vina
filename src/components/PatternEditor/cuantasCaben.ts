/**
 * Cuántas opciones de la herramienta quedan a la vista en la línea al pie
 * (spec 2026-10-02 «la interfaz en papel» § 5.3: «se recorta primero la frase,
 * que conserva al menos 200 px; las opciones que aun así no quepan pasan a un
 * botón «Más» al final»).
 *
 * `anchos`, los de cada control en su orden; `hueco`, lo que la sección deja a
 * las opciones después de reservar el mínimo de la frase; `separacion`, el
 * aire entre dos controles; `anchoMas`, lo que ocupa «Más». Si caben todas,
 * todas. Si no, las primeras que quepan junto a «Más», que se lleva el resto.
 */
export function cuantasCaben(anchos: readonly number[], hueco: number, separacion: number, anchoMas: number): number {
  const todas = anchos.reduce((s, a) => s + a, 0) + separacion * Math.max(0, anchos.length - 1);
  if (todas <= hueco) return anchos.length;
  let usado = anchoMas;
  let cuantas = 0;
  for (const ancho of anchos) {
    if (usado + separacion + ancho > hueco) break;
    usado += separacion + ancho;
    cuantas += 1;
  }
  return cuantas;
}
