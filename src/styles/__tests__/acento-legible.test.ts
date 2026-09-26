import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, resolveToken, tokenColor } from '../colorMath';

/**
 * Revisión adversarial de UI del 2026-09-04 — la regresión que la limpieza de
 * tokens estuvo a punto de dejar dentro: seis sitios pasaron texto a
 * `var(--accent)` y cruzaron el umbral de AA sin que nadie lo viera.
 *
 * De ahí salen los tres roles del acento, que NO son intercambiables:
 *
 *   --accent         bordes, tintes y superficies      (no lleva texto)
 *   --accent-fuerte  relleno sólido con texto blanco    blanco ≥ 4,5:1
 *   --accent-ink     el acento escrito sobre el cromo   sobre el fondo ≥ 4,5:1
 *
 * Desde el 26-09 (cromo callado) el acento es el azul 248 del papel y todos los
 * neutros están en oklch(); por eso la aritmética viene de colorMath.
 */

const TOKENS = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const rgb = (name: string) => tokenColor(TOKENS, name).rgb;
const contraste = (a: string, b: string) => contrastRatio(rgb(a), rgb(b));

const AA = 4.5;
/** Los fondos del cromo sobre los que puede caer una etiqueta de acento. */
const FONDOS = ['--bg-surface', '--bg-elevated', '--bg-base', '--bg-primary', '--bg-secondary'];

describe('la familia del acento: cada rol cumple lo suyo', () => {
  it.each(FONDOS)('--accent-ink se lee sobre %s', (fondo) => {
    expect(contraste('--accent-ink', fondo)).toBeGreaterThanOrEqual(AA);
  });

  it('--accent-fuerte aguanta texto blanco encima', () => {
    expect(contraste('--on-accent', '--accent-fuerte')).toBeGreaterThanOrEqual(AA);
  });

  it('--destructive-fuerte aguanta texto blanco encima (el botón Eliminar)', () => {
    expect(contraste('--on-accent', '--destructive-fuerte')).toBeGreaterThanOrEqual(AA);
  });

  it('--accent-ink es el paso más legible: escribir con --accent es usar el rol equivocado', () => {
    // Hasta el 26-09 --accent (índigo) se quedaba en ~4,1:1 y este test lo
    // documentaba como "no llega a AA". El acento 248 sí llega (4,67:1), pero
    // el rol de tinta sigue siendo --accent-ink: más claro y más legible.
    expect(contraste('--accent-ink', '--bg-surface')).toBeGreaterThan(contraste('--accent', '--bg-surface'));
  });

  it('los tres son del mismo tono (248), no tres azules distintos', () => {
    for (const t of ['--accent', '--accent-fuerte', '--accent-ink']) {
      const valor = resolveToken(TOKENS, t);
      const m = valor.match(/^oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/i);
      expect(m, `${t} debería declararse en oklch para comparar el tono: "${valor}"`).toBeTruthy();
      expect(parseFloat(m![1]), `${t} no es del tono 248`).toBe(248);
    }
  });
});

describe('nadie escribe el acento como tinta sobre el cromo', () => {
  const FUENTES = [
    'src/components/BottomPanel/BOMTab.css',
    'src/components/BottomPanel/GradingTab.css',
    'src/components/LayerPanel/LayerPanel.css',
    'src/components/Viewport3D/AvatarPanel.css',
    'src/components/Viewport3D/CollisionBodyPanel.css',
    'src/components/Viewport3D/SnapshotBar.css',
    'src/components/Viewport3D/SurfaceModePill.css',
    // Cromo callado (26-09): el shell entero escribe el acento con --accent-ink.
    'src/styles/base.css',
    'src/styles/floating.css',
    'src/styles/unified-bar.css',
    'src/components/shell/Dock.css',
    'src/components/shell/ToolTooltip.css',
  ];

  it.each(FUENTES)('%s usa --accent-ink para el texto, no --accent', (ruta) => {
    const css = readFileSync(join(process.cwd(), ruta), 'utf8');
    // `(?<![-\w])color:` para no confundir `border-color` ni `accent-color`
    // con `color`: un BORDE sí puede usar --accent, lo que no puede es la tinta.
    const malos = [...css.matchAll(/^.*(?<![-\w])color:\s*var\(--accent\)\s*;.*$/gm)].map((m) => m[0].trim());
    expect(malos, 'el acento como color de texto: el rol para tinta es --accent-ink').toEqual([]);
  });
});
