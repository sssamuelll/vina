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

// Spec § 5.3: «la herramienta del patrón ocupa lo que necesita; la sección del 3D, lo que
// sobra, y es la primera que se recorta». El reparto del plan (`.linea-al-pie__patron
// { flex: 1 1 0 }`: el patrón se queda con lo que SOBRA del 3D) cortaba la frase de Línea
// interna y la de Margen de costura en Split a 1366 y tumbaba cinco casos de e2e de P2b
// («la frase entera en una línea»). Lo que se mide está en `el-3d-en-papel.spec.ts` y en
// `linea-al-pie.spec.ts`; esto fija la decisión para que nadie vuelva al reparto de antes.
// Ocultar el avatar (el interruptor de la barra superior, Shift+A, el menú del 3D y el panel de
// render son lo mismo: `avatarRenderStyle === 'hidden'`). El modelo NO se desmonta al ocultarlo:
// se esconde solo (`AvatarModel`: `scene.visible = false`). Desmontarlo soltaba la raíz del
// horneado de colisión (`registerAvatarRenderRoot(null)`) y una simulación arrancada con el avatar
// oculto pasaba al camino por URL, que se desalinea 10-15 mm de lo que se ve (`renderCollisionBake`):
// al volver a mostrarlo, la tela le atravesaba el cuerpo (revisión final de P5, A5). `Viewport3D` no
// se monta en jsdom: se fija sobre las fuentes.
describe('ocultar el avatar no cambia el cuerpo con el que choca la tela', () => {
  const visor = sinComentarios(lee('src/components/Viewport3D/Viewport3D.tsx'));
  const modelo = sinComentarios(lee('src/components/Viewport3D/AvatarModel.tsx'));

  it('el visor monta el modelo aunque el avatar esté oculto', () => {
    expect(visor, 'el modelo se desmonta al ocultarlo y la colisión pasa a otro cuerpo').not.toMatch(/avatarVisible\s*&&\s*avatarMode\s*===\s*'model'/);
    expect(visor).toMatch(/avatarMode\s*===\s*'model'\s*&&\s*avatarModelUrl/);
  });

  it('el maniquí, que no hornea colisión desde lo que se ve, sí se desmonta', () => {
    expect(visor).toMatch(/avatarVisible\s*&&\s*avatarMode\s*===\s*'dressform'\s*&&\s*<Mannequin/);
  });

  it('el modelo se esconde solo con el estilo «hidden», sin soltar su raíz de colisión', () => {
    expect(modelo).toMatch(/scene\.visible\s*=\s*avatarRenderStyle\s*!==\s*'hidden'/);
    expect(modelo).toMatch(/registerAvatarRenderRoot\(groupRef\.current\)/);
  });
});

describe('el pie reparte el ancho: el patrón ocupa lo que necesita y la sección del 3D, lo que sobra', () => {
  const layout = lee('src/styles/layout.css');
  const seccion = lee('src/components/shell/SeccionDel3D.css');

  it('la ranura del patrón mide lo que pide su sección y solo se encoge si no hay sitio', () => {
    const r = regla(layout, '.linea-al-pie__patron');
    expect(r).toContain('flex: 0 1 auto');
    expect(r, 'sin mínimo la ranura se iría a cero').toContain('min-width: 320px');
  });

  it('la sección del 3D crece a lo que sobra y es la que cede casi todo', () => {
    // Desde el 2026-10-11 el estado de la simulación ya no está en el pie (va al pie del
    // margen del 3D): lo único que le queda a la sección es su relleno.
    const r = regla(layout, '.linea-al-pie__3d');
    expect(r).toContain('flex: 1 100 auto');
  });

  it('con la vista 3D sola el 3D ocupa todo el pie, sin la línea de pelo del patrón', () => {
    const r = regla(layout, '.linea-al-pie--3d-solo .linea-al-pie__3d');
    expect(r).toContain('flex: 1 1 auto');
    expect(r).toContain('border-left: 0');
  });

  it('la voz del 3D no cuenta para el tamaño de la sección: es lo primero que se recorta', () => {
    const r = regla(seccion, '.seccion-del-3d__voz');
    expect(r, 'sin `width: 0` la voz entera sería el mínimo de la sección').toContain('width: 0');
    expect(r).toContain('flex: 1 1 0');
    expect(r).toContain('min-width: 0');
  });

  it('ceder es recortar: la voz del 3D recorta lo que no cabe, y el nombre cede con puntos suspensivos', () => {
    // Sin `overflow: hidden`, la caja de la voz medía 0 px pero el nombre se desbordaba y se
    // pintaba encima del estado (revisión final de P5, a 1366 px en Split con Piquete y la
    // Plancha a vapor): `quien` era `flex: none`.
    expect(regla(seccion, '.seccion-del-3d__voz'), 'sin recorte el nombre se pinta sobre el estado').toContain('overflow: hidden');
    const quien = regla(seccion, '.seccion-del-3d__quien');
    expect(quien, 'un nombre que no se encoge se desborda de la voz').toContain('flex: 0 1 auto');
    expect(quien).toContain('min-width: 0');
    const nombre = regla(seccion, '.seccion-del-3d__nombre');
    expect(nombre).toContain('text-overflow: ellipsis');
    expect(nombre).toContain('min-width: 0');
    // La frase cede antes que el nombre: su `flex-shrink` es mayor que el de «quién».
    expect(regla(seccion, '.seccion-del-3d__frase')).toMatch(/flex:\s*1\s+1000\s+auto/);
  });

  it('la frase del 3D se corta con puntos suspensivos en vez de empujar lo de al lado', () => {
    const r = regla(seccion, '.seccion-del-3d__texto');
    expect(r).toContain('text-overflow: ellipsis');
    expect(r).toContain('white-space: nowrap');
    expect(r).toContain('overflow: hidden');
  });
});

describe('la línea al pie es papel, como los márgenes (enmienda 2026-10-11)', () => {
  // Samuel, con P5 desplegada: «me equivoqué con la línea al pie … creo que va mejor en los
  // colores de la barra de herramientas: Herramientas del patrón». Es lo que hace el margen
  // (Dock.css): --papel, la tinta del ámbito y una línea de pelo como borde. Hasta el 20-10
  // los dos pintaban la hoja; con la hoja en el gris de CLO tienen su propio papel.
  const layout = lee('src/styles/layout.css');
  const margen = lee('src/components/shell/Dock.css');
  const appShell = lee('src/components/shell/AppShell.tsx');

  it('pinta el papel de los márgenes con la línea de pelo, los mismos tokens que el margen', () => {
    const pie = regla(layout, '.linea-al-pie');
    expect(regla(margen, '.margen'), 'el margen cambió de fondo: el pie lo copia').toContain('background: var(--papel)');
    expect(pie).toContain('background: var(--papel)');
    expect(pie, 'lo que separa es línea de pelo, no el borde de un campo').toContain('border-top: var(--hairline)');
  });

  it('su raíz lleva el ámbito de papel: la tinta de dentro es la oscura', () => {
    const raiz = appShell.slice(appShell.indexOf('className={`linea-al-pie'));
    expect(raiz.slice(0, raiz.indexOf('>'))).toContain('data-material="papel"');
  });
});
