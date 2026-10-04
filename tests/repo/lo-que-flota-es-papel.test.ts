import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Lo que flota es papel (spec 2026-10-02 «la interfaz en papel» § 6.3, § 7.1,
 * § 7.2 y la fila P1b de § 11): los menús, los avisos, los tooltips, los
 * modales y la barrita de la pieza. Archivo por archivo, como
 * superficies-declaradas.test.ts:
 *
 *  1. su raíz lleva data-material="papel", que vuelve blanco el fondo y
 *     oscura la tinta de todo lo que hay dentro;
 *  2. no pinta con un fondo que solo existe en el marco: el ámbito no
 *     redefine --bg-surface, --bg-base ni --bg-deeper, y un campo pintado así
 *     dentro de un modal blanco queda negro con tinta negra encima. El
 *     trinquete de contraste no lo ve: el valor de un campo no es un nodo de
 *     texto;
 *  3. no escribe colores a mano: con dos modos (P7) un color fijo queda mal en
 *     uno de los dos (§ 11);
 *  4. no escribe con --accent: sobre blanco da 3,95:1; la tinta del acento es
 *     --accent-ink.
 *
 * Fuera a propósito: la barra de IA (pasa en P2c), la fila, que
 * desde P2 vive en la barra superior y es marco (su menú plegado sí flota),
 * el cromo del 3D (P5) y los paneles, que son marco. El margen de
 * herramientas no flota, pero es papel: su raíz lleva la marca desde P2.
 */
const lee = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const veces = (texto: string, aguja: string) => texto.split(aguja).length - 1;
const MARCA = 'data-material="papel"';

/** [componente, cuántas raíces de lo que flota marca] */
const RAICES: Array<[string, number]> = [
  // Menús
  ['src/components/shell/LogoMenu.tsx', 1],
  ['src/components/PatternEditor/ContextMenu.tsx', 1],
  ['src/components/Viewport3D/ContextMenu3D.tsx', 1],
  ['src/components/shared/SubMenu.tsx', 1],
  ['src/components/shell/DockToolPicker.tsx', 1],
  ['src/components/LayerPanel/LayerPanel.tsx', 1],
  ['src/components/LayerPanel/LayerColorPicker.tsx', 1],
  ['src/components/Viewport3D/SurfaceModePill.tsx', 1],
  ['src/components/PatternEditor/FilaDeCapas.tsx', 1],
  ['src/components/PatternEditor/SeccionDelPatron.tsx', 1],
  // Avisos y tooltips
  ['src/components/shell/ToastContainer.tsx', 1],
  ['src/components/shell/ToolTooltip.tsx', 1],
  ['src/components/shell/AppShell.tsx', 1],
  // Modales
  ['src/components/shell/ConfirmDialog.tsx', 1],
  ['src/components/PatternEditor/NotchPrecisionModal.tsx', 1],
  ['src/components/PatternEditor/CalibrationModal.tsx', 1],
  ['src/copilot/connections/ConnectionModal.tsx', 1],
  // La barrita de la pieza
  ['src/components/PatternEditor/FloatingActionBar.tsx', 1],
  // El margen de herramientas: no flota, es la orilla de la hoja (P2)
  ['src/components/shell/Dock.tsx', 1],
  // La hoja: tampoco flota, es el papel (P2b, cuando se fue la tira)
  ['src/components/PatternEditor/PatternEditor.tsx', 1],
];

/**
 * Dónde se pinta lo que flota. `'*'`: el archivo entero. Si no, las reglas
 * cuyo selector empieza por uno de esos prefijos, porque la misma hoja pinta
 * también cromo del marco (el dock, la píldora del 3D). Los ocho colores de
 * LayerColorPicker.tsx no están: son los que la usuaria escoge para una capa,
 * un dato y no la piel.
 */
const PINTA: Array<[string, string[] | '*']> = [
  // Menús
  ['src/styles/floating.css', ['.logo-menu', '.context-menu']],
  ['src/components/shared/SubMenu.css', '*'],
  ['src/components/shell/Dock.css', ['.dock-picker', '.margen']],
  ['src/styles/layout.css', ['.grupo-del-patron__menu', '.opcion-del-pie']],
  // El menú «Más» de la línea al pie y los controles que lleva dentro
  ['src/components/PatternEditor/SeccionDelPatron.css', ['.seccion-del-patron__menu', '.opcion-del-pie']],
  ['src/components/PatternEditor/ToolOptionControls.css', '*'],
  ['src/components/LayerPanel/LayerPanel.css', ['.layer-context-menu', '.layer-color-popover', '.layer-color-swatch']],
  ['src/components/Viewport3D/SurfaceModePill.css', ['.surface-pill__flyout', '.surface-pill__option']],
  // Avisos y tooltips
  ['src/components/shell/ToastContainer.css', '*'],
  ['src/components/shell/ToolTooltip.css', '*'],
  // Modales
  ['src/components/shell/ConfirmDialog.css', '*'],
  ['src/components/PatternEditor/NotchPrecisionModal.css', '*'],
  ['src/components/PatternEditor/CalibrationModal.css', '*'],
  ['src/copilot/connections/ConnectionModal.tsx', '*'],
  ['src/copilot/connections/DynamicProviderForm.tsx', '*'],
  // La barrita de la pieza
  ['src/components/PatternEditor/FloatingActionBar.tsx', '*'],
];

const FONDO_DEL_MARCO = /var\(--(bg-surface|bg-base|bg-deeper|bg-primary|panel-bg|surface-chrome-bg)\)/;
const COLOR_A_MANO = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/;
const ACENTO_COMO_TINTA = /(?<![-\w])color:\s*['"]?var\(--accent\)/;

/** Las reglas de lo que flota en una hoja; en un componente o con '*', sus líneas. */
function loQuePinta(ruta: string, prefijos: string[] | '*'): string[] {
  const texto = sinComentarios(lee(ruta));
  if (prefijos === '*' || !ruta.endsWith('.css')) return texto.split('\n');
  return [...texto.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => m[1].split(',').some((s) => prefijos.some((p) => s.trim().startsWith(p))))
    .map((m) => `${m[1].trim()} { ${m[2].replace(/\s+/g, ' ').trim()} }`);
}

describe('lo que flota es papel', () => {
  it.each(RAICES)('%s marca %i raíz con data-material="papel"', (ruta, n) => {
    expect(veces(lee(ruta), MARCA)).toBe(n);
  });

  it.each(PINTA)('%s no pinta lo que flota con un fondo del marco', (ruta, prefijos) => {
    expect(loQuePinta(ruta, prefijos).filter((r) => FONDO_DEL_MARCO.test(r))).toEqual([]);
  });

  it.each(PINTA)('%s no escribe colores a mano en lo que flota', (ruta, prefijos) => {
    expect(loQuePinta(ruta, prefijos).filter((r) => COLOR_A_MANO.test(r))).toEqual([]);
  });

  it.each(PINTA)('%s no escribe con --accent', (ruta, prefijos) => {
    expect(loQuePinta(ruta, prefijos).filter((r) => ACENTO_COMO_TINTA.test(r))).toEqual([]);
  });
});

describe('dentro de lo que flota, lo que separa es línea de pelo', () => {
  // En el ámbito de papel, --border es el borde de un campo (#8a857e, 3,66:1
  // sobre blanco): de separador, en un menú blanco, pesa como un campo.
  const regla = (ruta: string, selector: string) =>
    [...sinComentarios(lee(ruta)).matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .find((m) => m[1].split(',').map((s) => s.trim()).includes(selector))?.[2].replace(/\s+/g, ' ') ?? '';
  it.each([
    ['src/styles/floating.css', '.logo-menu__separator', 'background: var(--border-subtle)'],
    ['src/styles/floating.css', '.context-menu__separator', 'background: var(--border-subtle)'],
    ['src/styles/floating.css', '.context-menu__header', 'border-bottom: var(--hairline)'],
    ['src/components/shared/SubMenu.css', '.submenu-separator', 'background: var(--border-subtle)'],
    ['src/components/shell/Dock.css', '.dock-picker__reset', 'border-top: var(--hairline)'],
  ])('%s: %s lleva %s', (ruta, selector, declaracion) => {
    expect(regla(ruta, selector)).toContain(declaracion);
  });
});

describe('la tarjeta de «suelta tu archivo» es un aviso, y es papel', () => {
  // El velo de arrastre (AppShell) es un tinte de acento sobre la hoja; la
  // tarjeta que dice qué pasa al soltar flota encima: material entero.
  const appShell = sinComentarios(lee('src/components/shell/AppShell.tsx'));
  it.each([
    "background: 'var(--surface-overlay-bg)'",
    "border: 'var(--surface-overlay-border)'",
    "boxShadow: 'var(--surface-overlay-shadow)'",
  ])('lleva %s', (declaracion) => {
    expect(appShell).toContain(declaracion);
  });
});

describe('todo portal es algo que flota, y nace papel', () => {
  // Un portal cuelga de <body>, fuera del árbol del marco, y hereda la tinta
  // clara que <body> ya calculó: sin la marca, un menú blanco con letra
  // clara. Vale también para el portal que se escriba mañana.
  const componentes = execFileSync('git', ['ls-files', 'src/**/*.tsx'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !/__tests__|\.test\./.test(f));
  it('cada archivo marca al menos tantas raíces de papel como portales abre', () => {
    const sinMarca = componentes.filter((ruta) => {
      const texto = sinComentarios(lee(ruta));
      return veces(texto, 'createPortal(') > veces(texto, MARCA);
    });
    expect(sinMarca).toEqual([]);
  });
});
