import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ContextPanel deja de flotar sobre el lienzo y pasa a ser un hijo flex real
 * (§ 2.1 de la spec de Fase 3+4). Consecuencia menos obvia, verificada aquí:
 * z-index solo aplica a elementos posicionados — al dejar de ser
 * position:absolute, su z-index deja de hacer nada, así que se ELIMINA (no
 * se migra a un token).
 */
function leer(ruta: string): string {
  return readFileSync(join(process.cwd(), ruta), 'utf8');
}

describe('.context-panel es un hijo flex, no un overlay', () => {
  const css = leer('src/styles/floating.css');
  const regla = css.match(/\.context-panel\s*\{[^}]*\}/)?.[0] ?? '';

  it('la regla existe: sin ella, los demás casos pasarían sin mirar nada', () => {
    expect(regla).not.toBe('');
  });

  it('ya no declara position: absolute', () => {
    expect(regla).not.toMatch(/position:\s*absolute/);
  });

  it('ya no declara z-index — dejó de servir para nada', () => {
    expect(regla).not.toMatch(/z-index/);
  });

  it('tiene un ancho fijo que no crece ni encoge', () => {
    expect(regla).toMatch(/flex:\s*0\s+0\s+300px/);
  });

  it('es marco a ras: el material chrome entero, sin margen, sin radio y sin sombra (spec 2026-10-02 § 6.1)', () => {
    expect(regla).toMatch(/background:\s*var\(--surface-chrome-bg\)/);
    expect(regla).toMatch(/border-left:\s*var\(--surface-chrome-border\)/);
    expect(regla).toMatch(/border-radius:\s*var\(--surface-chrome-radius-flush\)/);
    expect(regla).toMatch(/box-shadow:\s*var\(--surface-chrome-shadow-flush\)/);
    expect(regla).not.toMatch(/margin|max-height|--surface-overlay/);
  });

  it('no entra deslizándose ni encierra lo de dentro: sin animación, transform, filter, will-change ni contain', () => {
    expect(regla).not.toMatch(/animation|transform|filter|will-change|contain\s*:/);
  });

  it('se desplaza por dentro: con «Producción» abierta a 643 px de alto, lo de abajo se alcanza con la rueda', () => {
    expect(regla).toMatch(/overflow-y:\s*auto/);
  });
});
