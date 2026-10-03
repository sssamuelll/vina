import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El ámbito de papel (spec 2026-10-02 «la interfaz en papel» § 7.2): un bloque
 * `[data-material="papel"]` en tokens.css que redefine, para lo que está
 * dentro, los nombres que usa el marco. Lo lleva la raíz de lo que flota.
 * Los ratios los fija contrasteDeTokens.ts; aquí, que el bloque exista, que
 * diga lo que la spec dice y que no deje escapar un valor del marco.
 */
const TOKENS = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function bloque(selector: string): string | null {
  const i = TOKENS.indexOf(`${selector} {`);
  return i === -1 ? null : TOKENS.slice(i, TOKENS.indexOf('}', i));
}
const declaraciones = (cuerpo: string) =>
  new Map([...cuerpo.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]));

const ambito = bloque('[data-material="papel"]');
const papel = declaraciones(ambito ?? '');
const raiz = declaraciones(bloque(':root') ?? '');

describe('el ámbito de papel (spec 2026-10-02 § 7.2)', () => {
  it('existe: un bloque [data-material="papel"] en tokens.css', () => {
    expect(ambito, 'falta el bloque [data-material="papel"] en tokens.css').not.toBeNull();
  });

  it.each([
    '--text-primary', '--text-secondary', '--text-tertiary', '--text-disabled',
    '--bg-elevated', '--field-bg', '--border', '--border-subtle', '--hairline',
    '--accent-ink', '--ai', '--success', '--warning', '--destructive', '--destructive-hover',
    '--surface-overlay-shadow', '--scrim',
  ])('redefine %s', (token) => {
    expect(papel.has(token), `${token} no está en el ámbito de papel`).toBe(true);
  });

  it('lo que flota es blanco (§ 7.1)', () => {
    expect(papel.get('--surface-overlay-bg')).toBe('#ffffff');
  });

  it('declara color: sin eso, un portal colgado de <body> hereda la tinta clara del marco', () => {
    expect(ambito ?? '').toMatch(/^\s*color:\s*var\(--text-primary\);/m);
  });

  it('--field-bg existe también en el marco, y ahí es el elevado de siempre', () => {
    expect(raiz.get('--field-bg')).toBe('var(--bg-elevated)');
  });

  it('todo alias de :root que lee un nombre del ámbito se vuelve a declarar en el ámbito', () => {
    // CSS resuelve var() donde se DECLARA: `--text-muted: var(--text-tertiary)`
    // en :root baja ya resuelto al terciario del marco, que sobre blanco da
    // 3,35:1. Y colorMath.cssDelAmbito, que lo leería con el del ámbito, daría
    // un verde falso: esta regla es la que hace coincidir las dos lecturas.
    const faltan = [...raiz]
      .filter(([nombre, valor]) => !papel.has(nombre)
        && [...valor.matchAll(/var\((--[\w-]+)\)/g)].some((m) => papel.has(m[1])))
      .map(([nombre]) => nombre);
    expect(faltan).toEqual([]);
  });

  it('el acento no cambia en ningún ámbito', () => {
    for (const t of ['--accent', '--accent-fuerte', '--accent-fuerte-hover', '--on-accent', '--accent-subtle', '--accent-border']) {
      expect(papel.has(t), `${t} no se redefine: es el mismo en el marco y en el papel`).toBe(false);
    }
  });
});
