import { contrastRatio, tokenColor } from './colorMath';

/**
 * Los pares de la piel que tienen que cumplir un piso (spec 2026-09-24
 * «cromo callado» § 4). Texto normal: AA 4,5:1. Objeto gráfico (una línea,
 * un borde, un relleno sin texto): 3:1. Deshabilitado: 2,5:1 — WCAG lo exime,
 * pero por debajo de eso ni se ve que hay un control.
 */
export interface Par { tinta: string; fondo: string; minimo: number; por: string }
export interface Resultado extends Par { ratio: number; ok: boolean }

export const PARES: Par[] = [
  { tinta: '--text-primary', fondo: '--bg-surface', minimo: 4.5, por: 'texto principal' },
  { tinta: '--text-primary', fondo: '--bg-elevated', minimo: 4.5, por: 'texto principal sobre un botón' },
  { tinta: '--text-secondary', fondo: '--bg-surface', minimo: 4.5, por: 'rótulos' },
  { tinta: '--text-secondary', fondo: '--bg-elevated', minimo: 4.5, por: 'rótulos sobre un botón' },
  { tinta: '--text-tertiary', fondo: '--bg-surface', minimo: 4.5, por: 'atajos, meta, placeholder' },
  { tinta: '--text-tertiary', fondo: '--bg-elevated', minimo: 4.5, por: 'kbd sobre elevated' },
  { tinta: '--text-disabled', fondo: '--bg-surface', minimo: 2.5, por: 'solo deshabilitado' },
  { tinta: '--accent-ink', fondo: '--bg-surface', minimo: 4.5, por: 'el acento escrito' },
  { tinta: '--accent-ink', fondo: '--bg-elevated', minimo: 4.5, por: 'el acento escrito sobre un botón' },
  { tinta: '--on-accent', fondo: '--accent-fuerte', minimo: 4.5, por: 'texto blanco sobre relleno de acento' },
  { tinta: '--on-accent', fondo: '--destructive-fuerte', minimo: 4.5, por: 'texto blanco sobre Eliminar' },
  { tinta: '--on-accent', fondo: '--accent-fuerte-hover', minimo: 4.5, por: 'texto blanco sobre el relleno al pasar el mouse' },
  { tinta: '--on-accent', fondo: '--destructive-fuerte-hover', minimo: 4.5, por: 'texto blanco sobre Eliminar al pasar el mouse' },
  { tinta: '--accent', fondo: '--bg-surface', minimo: 3, por: 'borde/relleno del dock activo' },
  { tinta: '--accent', fondo: '--canvas-2d', minimo: 3, por: 'línea de selección sobre el crema' },
  { tinta: '--accent', fondo: '--piece-fill-2d', minimo: 3, por: 'línea de selección sobre la pieza' },
  { tinta: '--accent-fuerte', fondo: '--canvas-2d', minimo: 3, por: 'chip de cota sobre el crema' },
  { tinta: '--ai', fondo: '--bg-surface', minimo: 4.5, por: '«lo hizo la IA»' },
  { tinta: '--success', fondo: '--bg-surface', minimo: 4.5, por: 'semántico' },
  { tinta: '--warning', fondo: '--bg-surface', minimo: 4.5, por: 'semántico' },
  { tinta: '--destructive', fondo: '--bg-surface', minimo: 4.5, por: 'texto destructivo' },
  { tinta: '--border', fondo: '--bg-surface', minimo: 1.3, por: 'un borde igual a su superficie es invisible' },
  { tinta: '--ink-hint', fondo: '--canvas-2d', minimo: 4.5, por: 'pista sobre el papel' },
  { tinta: '--ink-hint', fondo: '--piece-fill-2d', minimo: 4.5, por: 'pista sobre la pieza' },
  { tinta: '--ink-on-light', fondo: '--canvas-2d', minimo: 4.5, por: 'línea de corte y rótulos' },
  { tinta: '--ink-on-light-2', fondo: '--canvas-2d', minimo: 3, por: 'puntos del contorno en reposo' },
  { tinta: '--cota-ink-2d', fondo: '--cota-bg-2d', minimo: 4.5, por: 'el número de la cota' },
  { tinta: '--cota-line-2d', fondo: '--canvas-2d', minimo: 3, por: 'la línea de cota' },
  { tinta: '--cota-edit-ink-2d', fondo: '--cota-edit-bg-2d', minimo: 4.5, por: 'la cota en edición' },
];

export function verificarContraste(css: string): Resultado[] {
  return PARES.map((p) => {
    const ratio = contrastRatio(tokenColor(css, p.tinta).rgb, tokenColor(css, p.fondo).rgb);
    return { ...p, ratio, ok: ratio >= p.minimo };
  });
}
