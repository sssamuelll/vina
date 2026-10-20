/**
 * Ley 2 de «la interfaz en papel» (spec 2026-10-02 § 3 y § 9): en reposo solo
 * está lo que perdura. `enReposo()` ya descarta `ambiente`, `documento` y
 * `dev`; de lo que queda, lo único que puede estar es la frase de ayuda
 * (`pista`) y, en la pantalla vacía, el estado vacío. Todo lo demás sobra.
 */
const PERDURA = new Set(['pista']);
const PERDURA_EN_LA_VACIA = new Set(['pista', 'estado-vacio']);

export function loQueSobra(visibles: string[], vacia: boolean): string[] {
  const permitidas = vacia ? PERDURA_EN_LA_VACIA : PERDURA;
  return visibles.filter((n) => !permitidas.has(n)).sort();
}
