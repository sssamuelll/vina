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

  it('ya no declara position: absolute', () => {
    expect(regla).not.toMatch(/position:\s*absolute/);
  });

  it('ya no declara z-index — dejó de servir para nada', () => {
    expect(regla).not.toMatch(/z-index/);
  });

  it('tiene un ancho fijo que no crece ni encoge', () => {
    expect(regla).toMatch(/flex:\s*0\s+0\s+300px/);
  });

  it('conserva el material overlay (fondo, blur, borde, sombra)', () => {
    expect(regla).toMatch(/background:\s*var\(--surface-overlay-bg\)/);
    expect(regla).toMatch(/backdrop-filter:\s*var\(--surface-overlay-blur\)/);
  });
});
