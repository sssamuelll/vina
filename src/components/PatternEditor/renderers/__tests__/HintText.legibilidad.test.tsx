// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import HintText from '../HintText';
import type { Tool2D } from '../../../../types/types';

afterEach(cleanup);

/**
 * Estos tests existen por un defecto medido el 2026-08-14 (auditoría de UI):
 * la pista que le explica a María el gesto de arrastre de #1029 se pintaba con
 * `fill="rgba(255, 215, 0, 0.5)"` —oro al 50%— sobre el crema del lienzo.
 * Contraste real: 1.05:1, cuando AA exige 4.5:1. O sea: la funcionalidad que
 * acabábamos de construir se explicaba con un texto invisible.
 *
 * La causa raíz no fue el color: fue que NO HABÍA REGLA que dijera con qué
 * tinta se escribe sobre el papel. Estos dos tests son esa regla, ejecutable:
 *   1. la tinta sale de un token, nunca de un literal;
 *   2. ese token es legible sobre el lienzo.
 *
 * Ver docs/reports/2026-08-14-auditoria-ui-deriva-de-diseno.md § 2.1
 */

const TOKENS = readFileSync(
  join(process.cwd(), 'src/styles/tokens.css'),
  'utf8',
);

function token(name: string): string {
  const m = TOKENS.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'));
  if (!m) throw new Error(`El token ${name} no existe en tokens.css`);
  return m[1].trim();
}

/** Luminancia relativa WCAG de un color #rrggbb. */
function luminancia(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const base = { pieces: [], penNodesLength: 0, nodeEditorIsEditing: false };

/** Toda herramienta que hoy pinta una pista al pie del lienzo. */
const HERRAMIENTAS_CON_PISTA: Array<{ tool: Tool2D; props?: Record<string, unknown> }> = [
  { tool: 'seam' as Tool2D, props: { seamPhase: 'idle' } },
  { tool: 'seam' as Tool2D, props: { seamPhase: 'holdingA' } },
  { tool: 'seamEdit' as Tool2D },
  { tool: 'seamAllowance' as Tool2D, props: { saDefaultWidthMm: 10 } },
  { tool: 'walkSeam' as Tool2D, props: { walkSeamPhase: 'idle' } },
  { tool: 'topstitchSeamline' as Tool2D, props: { topstitchMode: 'seamline' } },
];

describe('HintText — la tinta sale del sistema, no del ojo de quien la escribió', () => {
  it.each(HERRAMIENTAS_CON_PISTA)(
    'la pista de $tool no lleva ningún color literal',
    ({ tool, props }) => {
      const { container } = render(
        <svg><HintText {...base} activeTool={tool} {...props} /></svg>,
      );
      const textos = [...container.querySelectorAll('text')];
      expect(textos.length).toBeGreaterThan(0);
      for (const t of textos) {
        const fill = t.getAttribute('fill') ?? '';
        expect(
          fill,
          `<text> con fill literal "${fill}". La tinta sobre el lienzo se toma de un token ` +
          `(ver § 5.1 "ley de materiales": lo que se dibuja sobre el papel usa --ink-*).`,
        ).toMatch(/^var\(--[\w-]+\)$/);
      }
    },
  );

  it('el editor de nodos tampoco', () => {
    const { container } = render(
      <svg><HintText {...base} nodeEditorIsEditing activeTool={'select' as Tool2D} /></svg>,
    );
    for (const t of container.querySelectorAll('text')) {
      expect(t.getAttribute('fill') ?? '').toMatch(/^var\(--[\w-]+\)$/);
    }
  });
});

describe('la tinta de pista es legible sobre el lienzo', () => {
  it('--ink-hint alcanza el mínimo AA contra --canvas-2d', () => {
    const tinta = token('--ink-hint');
    const papel = token('--canvas-2d');
    // El defecto original daba 1.05:1. AA para texto normal pide 4.5:1.
    expect(contraste(tinta, papel)).toBeGreaterThanOrEqual(4.5);
  });

  it('sigue siendo legible sobre el blanco del interior de una pieza', () => {
    // Las pistas van al pie del lienzo, pero una pieza puede quedar debajo:
    // --piece-fill-2d es blanco puro y es el peor caso de los dos fondos.
    expect(contraste(token('--ink-hint'), token('--piece-fill-2d')))
      .toBeGreaterThanOrEqual(4.5);
  });
});

describe('las pistas están en el idioma del producto', () => {
  // Regla dura del glosario docs/specs/2026-07-16-ui-copy-es-glosario.md:
  // "cero mezcla de idiomas dentro de una misma superficie".
  const DELATORES = /\b(click|drag|to move|to exit|to apply|across|corner type|editing|nodes|width)\b/i;

  it.each(HERRAMIENTAS_CON_PISTA)('la pista de $tool está en español', ({ tool, props }) => {
    const { container } = render(
      <svg><HintText {...base} activeTool={tool} {...props} /></svg>,
    );
    const texto = [...container.querySelectorAll('text')].map((t) => t.textContent).join(' ');
    expect(texto, `pista con inglés colado: "${texto}"`).not.toMatch(DELATORES);
  });

  it('el editor de nodos está en español', () => {
    const { container } = render(
      <svg><HintText {...base} nodeEditorIsEditing activeTool={'select' as Tool2D} /></svg>,
    );
    const texto = [...container.querySelectorAll('text')].map((t) => t.textContent).join(' ');
    expect(texto).not.toMatch(DELATORES);
  });
});
