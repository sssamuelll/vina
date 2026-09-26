import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Spec 2026-09-24 «cromo callado» § 4.5 (decisión D3 de Samuel):
 *   1. una sola sans (Inter) en 400/500/600 y una sola mono (JetBrains Mono);
 *      Schibsted Grotesk y el 700 salen de index.html;
 *   2. sin Inter 700 cargada, un `font-weight: 700` se sintetiza (negrita
 *      falsa): no puede quedar ninguno en el cromo;
 *   3. mono = un dato cuya alineación carácter a carácter significa algo
 *      (contrato § 5). La prosa va en sans. Este test lista, selector a
 *      selector, dónde es legal la mono en CSS.
 */
const lee = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
const rastreados = (patron: string) =>
  execFileSync('git', ['ls-files', patron], { encoding: 'utf8' }).split('\n').filter(Boolean);

describe('1. las familias que se cargan', () => {
  const html = lee('index.html');
  it('Inter 400/500/600 y JetBrains Mono 400/500, nada más', () => {
    expect(html).toContain('family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
    expect(html).not.toContain('Schibsted');
    expect(html).not.toMatch(/Inter:wght@[^"]*700/);
  });
});

describe('2. ningún 700 en el cromo', () => {
  const archivos = [
    ...rastreados('src/styles/*.css'),
    ...rastreados('src/components/shell/*.css'),
    ...rastreados('src/components/shell/*.tsx').filter((f) => !/__tests__|\.test\./.test(f)),
    'src/copilot/connections/ConnectionCard.tsx',
  ];
  it.each(archivos)('%s no declara font-weight 700 ni bold', (ruta) => {
    const sitios = [...lee(ruta).matchAll(/font-?[wW]eight:\s*['"]?(700|bold)\b/g)].map((m) => m[0]);
    expect(sitios, `${ruta}: sin Inter 700 esto se sintetiza; usa var(--weight-semibold)`).toEqual([]);
  });
});

describe('3. la mono solo viste datos', () => {
  /** Dónde es legal `var(--font-mono)` / `var(--font-mono-2d)` en CSS. `*` = todo el archivo. */
  const PERMITIDOS: Record<string, string[] | '*'> = {
    'src/styles/base.css': ['.mono'],
    'src/styles/floating.css': ['.logo-menu__shortcut', '.context-menu__shortcut'],
    'src/styles/unified-bar.css': ['.chat-markdown code'],
    'src/components/shared/SubMenu.css': ['.submenu-shortcut'],
    'src/components/shell/ToolTooltip.css': ['.tool-tooltip-shortcut'],
    'src/components/shell/Dock.css': ['.dock-picker__kbd'],
    'src/components/PatternEditor/ToolStrip2D.css': ['.tool-strip__shortcut'],
    'src/components/PatternEditor/cotas/cotas.css': '*',
  };
  const css = rastreados('src/**/*.css');
  it.each(css)('%s: cada regla con mono está en la lista', (ruta) => {
    const permitido = PERMITIDOS[ruta];
    if (permitido === '*') return;
    const sinComentarios = lee(ruta)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Las líneas `@import …;` no tienen llaves y se pegaban al primer selector real.
      .replace(/^\s*@import[^;]*;\s*$/gm, '');
    const malos: string[] = [];
    for (const m of sinComentarios.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/font-family:\s*var\(--font-mono(-2d)?\)/.test(m[2])) continue;
      for (const sel of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!(permitido ?? []).includes(sel)) malos.push(sel);
      }
    }
    expect(malos, `${ruta}: mono en prosa. Si es un dato (kbd, número), añade el selector a PERMITIDOS; si es prosa, usa var(--font-sans)`).toEqual([]);
  });
});
