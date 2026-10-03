import { contrastRatio, cssDelAmbito, tokenColor } from './colorMath';

/**
 * Los pares de la piel que tienen que cumplir un piso (spec 2026-09-24
 * «cromo callado» § 4). Texto normal: AA 4,5:1. Objeto gráfico (una línea,
 * un borde, un relleno sin texto): 3:1. Deshabilitado: 2,5:1 — WCAG lo exime,
 * pero por debajo de eso ni se ve que hay un control.
 *
 * Un par con `ambito` se lee desde dentro de `data-material="<ámbito>"`
 * (spec 2026-10-02 § 7.2).
 */
export interface Par { tinta: string; fondo: string; minimo: number; por: string; ambito?: 'papel' }
export interface Resultado extends Par { ratio: number; ok: boolean }

/** Los pares del ámbito de papel: sobre la hoja (que lo gana en P2), sobre el
 *  blanco de lo que flota y, el texto, sobre el papel hundido del hover y las
 *  teclas. Son los números de la tabla de § 7.2. */
const papel = (tinta: string, fondos: string[], minimo: number, por: string): Par[] =>
  fondos.map((fondo) => ({ tinta, fondo, minimo, por: `papel · ${por}`, ambito: 'papel' as const }));
const HOJA_Y_BLANCO = ['--canvas-2d', '--surface-overlay-bg'];
const Y_HUNDIDO = [...HOJA_Y_BLANCO, '--bg-elevated'];

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
  { tinta: '--grid-2d', fondo: '--canvas-2d', minimo: 1.4, por: 'la cuadrícula se ve siempre sobre el papel' },
  { tinta: '--piece-fill-2d', fondo: '--canvas-2d', minimo: 1.09, por: 'la pieza blanca se separa del papel' },
  { tinta: '--cota-ink-2d', fondo: '--cota-bg-2d', minimo: 4.5, por: 'el número de la cota' },
  { tinta: '--cota-line-2d', fondo: '--canvas-2d', minimo: 3, por: 'la línea de cota' },
  { tinta: '--cota-edit-ink-2d', fondo: '--cota-edit-bg-2d', minimo: 4.5, por: 'la cota en edición' },
  ...papel('--text-primary', Y_HUNDIDO, 4.5, 'texto principal'),
  ...papel('--text-secondary', Y_HUNDIDO, 4.5, 'rótulos'),
  ...papel('--text-tertiary', Y_HUNDIDO, 4.5, 'atajos, placeholder, lo inactivo'),
  ...papel('--text-disabled', HOJA_Y_BLANCO, 2.5, 'solo deshabilitado'),
  ...papel('--border', HOJA_Y_BLANCO, 3, 'el borde de un campo'),
  ...papel('--accent-ink', HOJA_Y_BLANCO, 4.5, 'el acento escrito'),
  ...papel('--ai', HOJA_Y_BLANCO, 4.5, '«lo hizo la IA»'),
  ...papel('--success', HOJA_Y_BLANCO, 4.5, 'semántico'),
  ...papel('--warning', HOJA_Y_BLANCO, 4.5, 'semántico'),
  ...papel('--destructive', HOJA_Y_BLANCO, 4.5, 'texto destructivo'),
  ...papel('--destructive-hover', HOJA_Y_BLANCO, 4.5, 'texto destructivo al pasar el mouse'),
];

export function verificarContraste(css: string): Resultado[] {
  return PARES.map((p) => {
    const fuente = p.ambito ? cssDelAmbito(css, p.ambito) : css;
    const ratio = contrastRatio(tokenColor(fuente, p.tinta).rgb, tokenColor(fuente, p.fondo).rgb);
    return { ...p, ratio, ok: ratio >= p.minimo };
  });
}
