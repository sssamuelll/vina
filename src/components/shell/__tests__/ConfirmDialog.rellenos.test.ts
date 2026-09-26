import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un relleno que lleva texto blanco encima usa el paso FUERTE de su familia
 * (spec 2026-09-24 § 4.3): --accent da 3,95:1 con blanco y --destructive
 * 3,96:1; los pasos fuertes dan 5,04 y 6,05. El diálogo de confirmación es la
 * última pantalla antes de perder algo: es donde más importa leer el botón.
 */
const CSS = readFileSync(join(process.cwd(), 'src/components/shell/ConfirmDialog.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function regla(sel: string): string {
  for (const m of CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (m[1].split(',').map((s) => s.trim()).includes(sel)) return m[2];
  }
  return '';
}
const prop = (cuerpo: string, nombre: string) =>
  (cuerpo.match(new RegExp(`(?:^|;)\\s*${nombre}\\s*:\\s*([^;]+)`)) ?? [])[1]?.trim() ?? '';

describe('ConfirmDialog — los botones con texto blanco llevan el paso fuerte', () => {
  it('el primario', () => {
    expect(prop(regla('.confirm-dialog__btn--primary'), 'background')).toBe('var(--accent-fuerte)');
    expect(prop(regla('.confirm-dialog__btn--primary'), 'color')).toBe('var(--on-accent)');
  });
  it('el destructivo', () => {
    expect(prop(regla('.confirm-dialog__btn--destructive'), 'background')).toBe('var(--destructive-fuerte)');
  });
  it('el hover aclara un paso, no oscurece ni brilla', () => {
    expect(prop(regla('.confirm-dialog__btn--primary:hover'), 'background')).toBe('var(--accent)');
    expect(prop(regla('.confirm-dialog__btn--destructive:hover'), 'background')).toBe('var(--destructive)');
  });
});
