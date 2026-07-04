/**
 * seamPalette — identidad de color por costura + acentos del viewport
 * (pedido de Samuel 2026-07-04: "cada costura diferente color, colores más
 * fancy a todo — ese amarillo no me gusta").
 *
 * CLO3D usa un hue distinto por seam para que el ojo empareje "este tramo de
 * A se cose con este de B" sin leer nada. La paleta: 12 hues vivos y
 * separados, legibles sobre el fondo gris claro del viewport y sobre tela
 * blanca. Asignación por HASH ESTABLE del seam.id (FNV-1a) — el color de una
 * costura no cambia al reordenar/agregar/borrar otras.
 *
 * La PROVENIENCIA (antes ámbar IA / verde humano, seamColor) ahora se
 * expresa como saturación: IA = versión pálida del mismo hue ("propuesta,
 * revísame"), humano = hue pleno ("confirmada"). Un solo LineSegments
 * mergeado sigue bastando (el dim va en el color de vértice, no en un
 * material aparte).
 */

/** 12 hues vivos, separados perceptualmente, sin amarillo-mostaza. */
export const SEAM_PALETTE = [
  '#e23c5f', // frambuesa
  '#2f7de1', // azul
  '#18a05c', // esmeralda
  '#e2662f', // naranja quemado
  '#8b5cf6', // violeta
  '#0e9fb5', // cian profundo
  '#d63bb0', // magenta
  '#6fa821', // lima oscura
  '#4f46e5', // índigo
  '#c2453c', // teja
  '#0d9488', // teal
  '#b8722c', // ámbar tierra
] as const;

/** Acento de selección de pieza (reemplaza el oro plano #ffd700). */
export const SELECTION_ACCENT = '#8b7cf8';

/** FNV-1a 32-bit — estable, sin dependencias. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hue estable de una costura (por id — sobrevive reordenes del array). */
export function seamPaletteColor(seamId: string): string {
  return SEAM_PALETTE[fnv1a(seamId) % SEAM_PALETTE.length];
}

/** Mezcla hex hacia otro hex (t ∈ [0,1]). Para el dim de proveniencia IA. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sa: number, sb: number) => Math.round(sa + (sb - sa) * t);
  const r = ch((pa >> 16) & 255, (pb >> 16) & 255);
  const g = ch((pa >> 8) & 255, (pb >> 8) & 255);
  const bl = ch(pa & 255, pb & 255);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/** Color final del hilo: hue de identidad, palidecido si es propuesta IA. */
export function seamThreadColor(seamId: string, createdBy: 'ai' | 'human' | undefined): string {
  const base = seamPaletteColor(seamId);
  return createdBy === 'ai' ? mixHex(base, '#f3f4f6', 0.22) : base; // dim sutil: 0.45 lavaba los hilos sobre el fondo claro (visto en capturas)
}
