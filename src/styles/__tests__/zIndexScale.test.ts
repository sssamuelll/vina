import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ley de emplazamiento (§ 5.2 del informe 2026-08-14, § 2.3 de la spec de
 * Fase 3+4): los 14 sitios de z-index que compiten de verdad en el espacio
 * global pasan a la escala con nombre. Esto no es solo "sin literal" —
 * ui-contract-lint.mjs ya cuenta eso — es que el ORDEN entre roles sea el
 * correcto: un modal por encima de un menú contextual, un toast por encima
 * de un modal. Antes de esta fase, CalibrationModal y el menú contextual
 * compartían el mismo 1000; ConnectionModal (que SÍ tiene velo) estaba al
 * nivel de un menú (200); NotchPrecisionModal (que el propio archivo dice
 * "deliberately no scrim") estaba al nivel de un modal (1000).
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
const ZBar = valorDeToken(tokens, '--z-bar');
const ZM = valorDeToken(tokens, '--z-menu');
const ZCM = valorDeToken(tokens, '--z-context-menu');
const ZMod = valorDeToken(tokens, '--z-modal');
const ZT = valorDeToken(tokens, '--z-toast');

describe('la escala de z-index ordena por urgencia, no por antigüedad', () => {
  it('dock < barra < menú < menú-contextual < modal < toast', () => {
    expect(ZD).toBeLessThan(ZBar);
    expect(ZBar).toBeLessThan(ZM);
    expect(ZM).toBeLessThan(ZCM);
    expect(ZCM).toBeLessThan(ZMod);
    expect(ZMod).toBeLessThan(ZT);
  });

  it('--z-panel existe para SolverMetrics, aunque ContextPanel ya no lo use', () => {
    expect(ZP).toBeGreaterThan(0);
  });
});

/** Cada fila: archivo, patrón que debe existir en el archivo (var(--token) o
 *  var(--token) + N para los anidados), y una nota de por qué. */
const SITIOS_GLOBALES: Array<{ archivo: string; patron: RegExp; nota: string }> = [
  { archivo: 'src/components/shell/Dock.css', patron: /z-index:\s*var\(--z-dock\)/, nota: 'dock' },
  { archivo: 'src/styles/layout.css', patron: /\.top-bar\s*\{[^}]*z-index:\s*var\(--z-bar\)/, nota: 'top-bar' },
  { archivo: 'src/styles/unified-bar.css', patron: /z-index:\s*var\(--z-bar\)/, nota: 'unified-bar' },
  { archivo: 'src/styles/floating.css', patron: /\.logo-menu\s*\{[^}]*z-index:\s*var\(--z-menu\)/, nota: 'menú del logo' },
  { archivo: 'src/copilot/connections/ConnectionModal.tsx', patron: /zIndex:\s*['"]var\(--z-modal\)['"]/, nota: 'ConnectionModal reclasificado a modal (tiene velo)' },
  { archivo: 'src/styles/floating.css', patron: /\.context-menu\s*\{[^}]*z-index:\s*var\(--z-context-menu\)/, nota: 'menú contextual' },
  { archivo: 'src/components/shared/SubMenu.css', patron: /z-index:\s*calc\(var\(--z-context-menu\)\s*\+\s*10\)/, nota: 'submenú del menú contextual, anidado' },
  { archivo: 'src/components/PatternEditor/CalibrationModal.css', patron: /z-index:\s*var\(--z-modal\)/, nota: 'CalibrationModal reclasificado a modal (tiene velo)' },
  { archivo: 'src/components/PatternEditor/NotchPrecisionModal.css', patron: /z-index:\s*var\(--z-menu\)/, nota: 'NotchPrecisionModal reclasificado a la baja (el propio archivo dice sin velo)' },
  { archivo: 'src/components/Debug/SolverMetrics.css', patron: /z-index:\s*var\(--z-panel\)/, nota: 'el 9999 era pánico, no necesidad real' },
  { archivo: 'src/components/shell/ToolTooltip.css', patron: /z-index:\s*var\(--z-toast\)/, nota: 'un tooltip necesita ganarle a todo' },
];

describe('los 11 sitios verificables por texto usan el token que les toca', () => {
  it.each(SITIOS_GLOBALES)('$archivo — $nota', ({ archivo, patron }) => {
    const contenido = leer(archivo);
    expect(contenido).toMatch(patron);
  });
});
