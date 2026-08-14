import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El botón «Nest» deshabilitado se veía y se comportaba como habilitado:
 * mismo fondo, mismo color, y **se iluminaba al pasar el mouse**, porque la
 * regla de hover es un selector descendente (`.nesting-toolbar button:hover`)
 * que no distingue si el botón está deshabilitado. Es el peor caso de un
 * control: promete que se puede pulsar y no hace nada.
 *
 * Encaja con la cifra de la auditoría del 2026-08-14: `:disabled` tenía 18
 * selectores contra 76 de `:hover`. Se estilizó lo que se ve con el mouse.
 *
 * Ley de estado del contrato (§ 5.3): un control deshabilitado se ve
 * deshabilitado, y el hover no puede mentir.
 */

const CSS = readFileSync(
  join(process.cwd(), 'src/components/BottomPanel/NestingTab.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function cuerpo(sel: string): string {
  for (const m of CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (m[1].split(',').map((s) => s.trim()).includes(sel)) return m[2];
  }
  return '';
}

describe('NestingTab — el botón deshabilitado no miente', () => {
  it('existe una regla :disabled que lo distingue', () => {
    const d = cuerpo('.nesting-toolbar button:disabled');
    expect(d, 'no hay regla :disabled: el botón inactivo se ve igual que el activo').not.toBe('');
    // Tiene que cambiar algo perceptible, no solo el cursor.
    expect(d).toMatch(/opacity|background|color|filter/);
  });

  it('el hover no se aplica cuando está deshabilitado', () => {
    const guardado = /\.nesting-toolbar button:hover:not\(:disabled\)/.test(CSS);
    const sinGuardar = /\.nesting-toolbar button:hover\s*[,{]/.test(CSS);
    expect(
      guardado && !sinGuardar,
      'el :hover del botón no excluye :disabled — el botón inactivo se ilumina al pasar el mouse',
    ).toBe(true);
  });

  it('tiene anillo de foco propio', () => {
    // Ley de estado: todo lo que tenga :hover tiene :focus-visible.
    expect(/\.nesting-toolbar button:focus-visible/.test(CSS)).toBe(true);
  });

  it('no usa tokens que no existen', () => {
    // --button-bg, --button-hover-bg, --text-color y --border-color son cuatro
    // de los nueve nombres fantasma que la auditoría encontró: se referencian
    // con fallback y siempre resuelven al hex escrito a mano.
    const fantasmas = ['--button-bg', '--button-hover-bg', '--text-color', '--border-color'];
    const presentes = fantasmas.filter((f) => CSS.includes(f));
    expect(presentes, `tokens fantasma en NestingTab.css: ${presentes.join(', ')}`).toEqual([]);
  });
});
