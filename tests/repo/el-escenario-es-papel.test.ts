import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El escenario 3D es papel (spec 2026-10-02 «la interfaz en papel» § 4.5 y § 6.1,
 * P5). Contrato de código sobre las fuentes: lo que el diseño decidió y que un
 * cambio futuro podría deshacer sin que ningún test de comportamiento lo note,
 * porque jsdom no pinta. El comportamiento medido está en
 * `tests/e2e/el-3d-en-papel.spec.ts`.
 *
 * Lo que se decidió:
 *   - el escenario es el papel de la hoja, no un color propio (el token del escenario murió);
 *   - el lienzo es transparente de fábrica y el color lo pone el CSS de detrás
 *     (`scene.background` pasa por el mapeo de tonos y un #faf4e3 sale #e1e0da);
 *   - el visor solo pinta la escena: ni suelo con cuadrícula, ni el estado de la
 *     simulación, ni la barra de mapas (bajaron al marco);
 *   - las herramientas del 3D son un margen detrás de los paneles;
 *   - entre las dos vistas de Split hay una línea de pelo sobre papel, no una
 *     franja negra, y sigue siendo arrastrable.
 */
const lee = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** El cuerpo de la primera regla CSS cuyo selector es exactamente `selector`. */
const regla = (css: string, selector: string) =>
  [...sinComentarios(css).matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .find((m) => m[1].split(',').map((s) => s.trim()).includes(selector))?.[2].replace(/\s+/g, ' ').trim() ?? '';

describe('el escenario es el papel de la hoja', () => {
  it('el token propio del escenario ya no existe en ninguna fuente', () => {
    // Armada a trozos para que esta prueba no se encuentre a sí misma.
    const aguja = '--scene' + '-3d';
    const archivos = execFileSync('git', ['ls-files', 'src', 'tests'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n')
      .filter((f) => /\.(ts|tsx|css|mjs|json)$/.test(f));
    expect(archivos.filter((f) => lee(f).includes(aguja))).toEqual([]);
  });

  it('el lienzo es transparente de fábrica: el color lo pone el CSS que tiene detrás', () => {
    expect(sinComentarios(lee('src/store/renderSettingsSlice.ts'))).toMatch(/^\s*backgroundMode:\s*'transparent',/m);
  });

  it('y detrás hay el papel: .canvas-area__3d pinta var(--canvas-2d), el mismo que la hoja', () => {
    const css = lee('src/styles/layout.css');
    expect(regla(css, '.canvas-area__3d')).toContain('background: var(--canvas-2d)');
    expect(regla(css, '.canvas-area__2d')).toContain('background: var(--canvas-2d)');
  });

  it('las exportaciones pintan el papel debajo, salvo que se pida transparente', () => {
    expect(lee('src/utils/export/stillExporter.ts')).toContain('sobreElPapel');
    expect(lee('src/utils/export/turntableRenderer.ts')).toContain('colorDelPapel');
  });
});

describe('el visor solo pinta la escena', () => {
  const visor = lee('src/components/Viewport3D/Viewport3D.tsx');

  it.each(['FloorGrid', 'SimulationStatusOverlay', 'FitMapToggle'])('no usa %s', (nombre) => {
    expect(sinComentarios(visor)).not.toContain(nombre);
  });

  it('no monta el selector de superficie: vive en el grupo de la prenda de la barra superior', () => {
    expect(sinComentarios(visor)).not.toMatch(/<SurfaceModePill/);
  });

  it('el suelo es solo sombra: un plano que recibe sombra y nada más', () => {
    expect(visor).toContain('<shadowMaterial');
  });
});

describe('las herramientas del 3D son un margen detrás de los paneles', () => {
  const shell = lee('src/components/shell/AppShell.tsx');

  it('RightDock se pinta después de los paneles y no dentro de canvas-area__3d', () => {
    const idx3d = shell.indexOf('className="canvas-area__3d"');
    const idxPaneles = shell.indexOf('[...paneles].reverse().map(');
    const idxMargen = shell.indexOf('<RightDock');
    expect(idxMargen, 'falta el margen del 3D').toBeGreaterThan(idxPaneles);
    expect(shell.slice(idx3d, idxPaneles), 'RightDock sigue dentro del área del 3D').not.toContain('<RightDock');
  });
});

describe('entre las dos vistas de Split hay una línea de pelo sobre papel', () => {
  const css = lee('src/styles/layout.css');
  const shell = lee('src/components/shell/AppShell.tsx');

  it('el divisor es papel: la franja de 4 px pinta el papel de la hoja, no lo que hay detrás', () => {
    expect(regla(css, '.canvas-area__divider')).toContain('background: var(--canvas-2d)');
  });

  it('y sigue siendo arrastrable: 4 px de área de agarre y cursor de columna', () => {
    const r = regla(css, '.canvas-area__divider');
    expect(r).toContain('width: 4px');
    expect(r).toContain('cursor: col-resize');
  });

  it('lo que se ve es una línea de 1 px de pelo, la del papel y no la del marco', () => {
    const r = regla(css, '.canvas-area__divider::after');
    expect(r).toContain('width: 1px');
    expect(r).toContain('background: var(--border-subtle)');
  });

  it('el divisor lleva el ámbito de papel: sin él, --border-subtle es la del marco oscuro y no se vería', () => {
    expect(shell).toMatch(/className="canvas-area__divider"[^>]*data-material="papel"|data-material="papel"[^>]*className="canvas-area__divider"/);
  });

  it('al pasar el ratón y al arrastrar conserva su acento', () => {
    expect(regla(css, '.canvas-area__divider:hover')).toContain('var(--accent-subtle)');
    expect(regla(css, '.canvas-area__divider:hover::after')).toContain('background: var(--accent)');
  });
});
