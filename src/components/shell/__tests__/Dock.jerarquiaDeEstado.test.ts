import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ley de estado del contrato de interfaz (§ 5.3 del informe 2026-08-14):
 *
 *     seleccionado  >  hover  >  reposo,  siempre, en peso visual.
 *
 * Hasta el 2026-08-14 estaba al revés en el dock: `:hover` pintaba un fondo
 * OPACO (`--bg-elevated`) con el icono en blanco, mientras `--active` pintaba
 * un lavado del 13% (`--accent-subtle`) con el icono índigo. Resultado medido:
 * la herramienta que el mouse apenas rozaba se veía más seleccionada que la que
 * de verdad estaba activa, y María no podía saber con qué estaba trabajando.
 *
 * Y el estado activo se distinguía casi solo por TONO en un icono de 16px: la
 * señal más débil que existe, y la que falla para quien no distingue colores.
 *
 * Estos tests fijan las dos mitades de la regla. No prueban píxeles: prueban
 * las dos decisiones que hacían falta y que nadie había escrito.
 */

const CSS = readFileSync(
  join(process.cwd(), 'src/components/shell/Dock.css'),
  'utf8',
);

/**
 * Cuerpo de la primera regla cuya LISTA de selectores incluya exactamente
 * `sel`. Tiene que entender listas con coma: la regla del estado activo declara
 * `.dock__tool--active, .dock__tool--active:hover` a propósito.
 */
function regla(sel: string): string {
  const sinComentarios = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of sinComentarios.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectores = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (selectores.includes(sel)) return m[2];
  }
  return '';
}

const prop = (cuerpo: string, nombre: string) =>
  (cuerpo.match(new RegExp(`(?:^|;)\\s*${nombre}\\s*:\\s*([^;]+)`)) ?? [])[1]?.trim() ?? '';

describe('Dock — la herramienta activa se ve más que la apuntada', () => {
  it('el estado activo no se pinta con un lavado translúcido', () => {
    const activo = prop(regla('.dock__tool--active'), 'background');
    expect(activo, 'no hay regla .dock__tool--active con background').not.toBe('');
    // --accent-subtle es el lavado al 13% que perdía contra el hover.
    expect(
      activo,
      'el estado activo usa un lavado translúcido y vuelve a perder contra :hover',
    ).not.toMatch(/subtle|dim/);
  });

  it('hover NO derriba el estado activo: existe la regla combinada', () => {
    // Sin esto, la regla que gane depende del orden en el archivo — que es
    // exactamente el tipo de acuerdo tácito que produjo la deriva.
    const combinada = CSS.match(/\.dock__tool--active:hover/);
    expect(
      combinada,
      'falta .dock__tool--active:hover — el estado activo queda a merced del orden de las reglas',
    ).toBeTruthy();
  });

  it('la diferencia entre activo y reposo no depende solo del tono', () => {
    const reposo = regla('.dock__tool');
    const activo = regla('.dock__tool--active');
    // En reposo el fondo es transparente. Si el activo también lo fuera, la
    // única señal sería el color del icono: insuficiente a 16px y nula para
    // quien no distingue tonos.
    expect(prop(reposo, 'background')).toMatch(/transparent|none/);
    expect(
      prop(activo, 'background'),
      'activo y reposo comparten fondo: la única diferencia sería el tono',
    ).not.toMatch(/transparent|none/);
  });

  it('el icono activo contrasta contra su propio fondo lleno', () => {
    // Un fondo lleno de acento con el icono en el mismo acento sería ilegible.
    const activo = regla('.dock__tool--active');
    const fondo = prop(activo, 'background');
    const tinta = prop(activo, 'color');
    expect(tinta).not.toBe('');
    expect(tinta, 'icono y fondo del estado activo usan el mismo token').not.toBe(fondo);
  });
});
