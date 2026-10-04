import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ley de emplazamiento (§ 5.2 del informe 2026-08-14, § 2.3 de la spec de
 * Fase 3+4): los 13 sitios de z-index que compiten de verdad en el espacio
 * global pasan a la escala con nombre. Esto no es solo "sin literal" —
 * ui-contract-lint.mjs ya cuenta eso — es que el ORDEN entre roles sea el
 * correcto: un modal por encima de un menú contextual, un toast por encima
 * de un modal. Antes de esta fase, CalibrationModal y el menú contextual
 * compartían el mismo 1000; ConnectionModal (que SÍ tiene velo) estaba al
 * nivel de un menú (200); NotchPrecisionModal (que el propio archivo dice
 * "deliberately no scrim") estaba al nivel de un modal (1000).
 *
 * El 14° sitio (`.context-panel`, floating.css) NO se migra: su z-index se
 * ELIMINA cuando el panel deja de ser overlay y pasa a ser hijo de layout,
 * y eso es trabajo de la Ola 2. Migrarlo hoy sería escribir una línea para
 * borrarla después.
 *
 * Cada escalón se prueba contra sus VECINOS, no solo contra cero: un rango
 * suelto (`> 0`) deja pasar que alguien mueva un token a 5000 sin romper
 * nada. Si un rol cambia de lugar en la escala, esto tiene que fallar.
 */

function leer(ruta: string): string {
  return readFileSync(join(process.cwd(), ruta), 'utf8');
}

function valorDeToken(css: string, token: string): number {
  const m = css.match(new RegExp(`${token}\\s*:\\s*(-?\\d+)`));
  if (!m) throw new Error(`Token ${token} no encontrado`);
  return Number(m[1]);
}

const tokens = leer('src/styles/tokens.css');
const ZD = valorDeToken(tokens, '--z-dock');
const ZP = valorDeToken(tokens, '--z-panel');
// Cromo acoplado al lienzo 2D: la tira de herramienta y la fila de capas. No
// son menús transitorios —no se van—, y por eso salieron de `--z-menu` el
// 2026-09-05 (hallazgo F10 de la revisión adversarial del 04-09).
const ZCC = valorDeToken(tokens, '--z-canvas-chrome');
const ZHint = valorDeToken(tokens, '--z-hint');
const ZBar = valorDeToken(tokens, '--z-bar');
const ZM = valorDeToken(tokens, '--z-menu');
const ZCM = valorDeToken(tokens, '--z-context-menu');
const ZMod = valorDeToken(tokens, '--z-modal');
const ZTip = valorDeToken(tokens, '--z-tooltip');
const ZT = valorDeToken(tokens, '--z-toast');
const ZDbg = valorDeToken(tokens, '--z-debug');

describe('la escala de z-index ordena por urgencia, no por antigüedad', () => {
  it('la cadena completa está ordenada, escalón por escalón', () => {
    expect(ZD).toBeLessThan(ZP);
    expect(ZP).toBeLessThan(ZCC);
    expect(ZCC).toBeLessThan(ZHint);
    expect(ZHint).toBeLessThan(ZBar);
    expect(ZBar).toBeLessThan(ZM);
    expect(ZM).toBeLessThan(ZCM);
    expect(ZCM).toBeLessThan(ZMod);
    expect(ZMod).toBeLessThan(ZTip);
    expect(ZTip).toBeLessThan(ZT);
    expect(ZT).toBeLessThan(ZDbg);
  });

  it('el aviso del lienzo va debajo del cromo: no tapa las barras', () => {
    // Era 50 antes de la migración y sigue siendo 50. Si sube por encima de
    // --z-bar, el "suelta el DXF aquí" empieza a tapar la barra superior y la
    // de IA, que es un cambio de comportamiento, no una migración.
    expect(ZHint).toBeLessThan(ZBar);
  });

  it('ningún rol empata con otro: un empate lo desempata el DOM, no el diseño', () => {
    const valores = [ZD, ZP, ZCC, ZHint, ZBar, ZM, ZCM, ZMod, ZTip, ZT, ZDbg];
    expect(new Set(valores).size).toBe(valores.length);
  });

  it('una notificación le gana al tooltip que la explica', () => {
    // ToolTooltip y ToastContainer estuvieron los dos en --z-toast: empatados,
    // ganaba el que el portal insertara después. tokens.css declara que la
    // notificación manda; esto lo prueba en vez de dejarlo al orden de montaje.
    expect(ZTip).toBeLessThan(ZT);
  });
});

/** Cada fila: archivo, patrón que debe existir en el archivo (var(--token) o
 *  var(--token) + N para los anidados), y una nota de por qué. */
const SITIOS_GLOBALES: Array<{ archivo: string; patron: RegExp; nota: string }> = [
  { archivo: 'src/components/shell/Dock.css', patron: /z-index:\s*var\(--z-dock\)/, nota: 'dock' },
  { archivo: 'src/styles/layout.css', patron: /\.top-bar\s*\{[^}]*z-index:\s*var\(--z-bar\)/, nota: 'top-bar' },
  { archivo: 'src/styles/layout.css', patron: /\.grupo-del-patron__menu\s*\{[^}]*z-index:\s*var\(--z-menu\)/, nota: 'menú de «Mostrar», el grupo del patrón plegado: cuelga de <body>' },
  { archivo: 'src/components/PatternEditor/SeccionDelPatron.css', patron: /\.seccion-del-patron__menu\s*\{[^}]*z-index:\s*var\(--z-menu\)/, nota: 'menú «Más» de la línea al pie: cuelga de <body>' },
  { archivo: 'src/styles/unified-bar.css', patron: /z-index:\s*var\(--z-bar\)/, nota: 'unified-bar' },
  { archivo: 'src/styles/floating.css', patron: /\.logo-menu\s*\{[^}]*z-index:\s*var\(--z-menu\)/, nota: 'menú del logo' },
  { archivo: 'src/copilot/connections/ConnectionModal.tsx', patron: /zIndex:\s*['"]var\(--z-modal\)['"]/, nota: 'ConnectionModal reclasificado a modal (tiene velo)' },
  { archivo: 'src/styles/floating.css', patron: /\.context-menu\s*\{[^}]*z-index:\s*var\(--z-context-menu\)/, nota: 'menú contextual' },
  { archivo: 'src/components/shared/SubMenu.css', patron: /z-index:\s*calc\(var\(--z-context-menu\)\s*\+\s*10\)/, nota: 'submenú DENTRO del menú contextual — solo ordena contra sus hermanos, ver nota abajo' },
  { archivo: 'src/styles/floating.css', patron: /\.logo-menu__submenu\s*\{[^}]*z-index:\s*calc\(var\(--z-menu\)\s*\+\s*10\)/, nota: 'submenú DENTRO del menú del logo — misma forma anidada' },
  { archivo: 'src/components/PatternEditor/CalibrationModal.css', patron: /z-index:\s*var\(--z-modal\)/, nota: 'CalibrationModal reclasificado a modal (tiene velo)' },
  { archivo: 'src/components/PatternEditor/NotchPrecisionModal.css', patron: /z-index:\s*var\(--z-menu\)/, nota: 'NotchPrecisionModal reclasificado a la baja (el propio archivo dice sin velo)' },
  { archivo: 'src/components/shell/AppShell.tsx', patron: /zIndex:\s*'var\(--z-hint\)'/, nota: 'aviso de soltar-DXF: encima del lienzo, debajo de las barras' },
  { archivo: 'src/components/Debug/SolverMetrics.css', patron: /z-index:\s*var\(--z-debug\)/, nota: 'el 9999 era pánico, pero 25 lo enterraba bajo las barras: es diagnóstico de dev, tiene rol propio' },
  { archivo: 'src/components/shell/ToolTooltip.css', patron: /z-index:\s*var\(--z-tooltip\)/, nota: 'escalón propio: empatado con el toast, el desempate lo decidía el portal' },
  { archivo: 'src/components/LayerPanel/LayerPanel.css', patron: /\.layer-context-menu\s*\{[^}]*z-index:\s*var\(--z-context-menu\)/, nota: 'menú contextual de Capas — no --z-menu (ese es el menú del logo); portado a body, un empate en 200 lo desempataría el orden del DOM' },
];

/**
 * Sobre los dos `calc(var(--token) + 10)`: los submenús se renderizan DENTRO
 * de su menú padre, que ya es contexto de apilamiento propio (`position` +
 * `z-index`). O sea que ese +10 nunca compite globalmente — solo ordena al
 * submenú contra sus hermanos dentro del menú, donde cualquier valor positivo
 * serviría. Se conserva la forma `calc()` porque hace visible de qué menú
 * depende, y porque sigue al token si alguien mueve el escalón. Lo que NO hay
 * que leer ahí es una promesa de que el submenú le gana a algo de afuera.
 */

describe('los 16 sitios verificables por texto usan el token que les toca', () => {
  it.each(SITIOS_GLOBALES)('$archivo — $nota', ({ archivo, patron }) => {
    const contenido = leer(archivo);
    expect(contenido).toMatch(patron);
  });
});
