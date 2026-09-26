import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
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

  it('los pasos de hover de los dos rellenos siguen en AA con el blanco', () => {
    // Re-revisión final F1 (26-09): el hover de un relleno con texto no puede
    // subir a --accent (3,95:1). Sube un paso, y ese paso se mide aquí.
    expect(contraste('--on-accent', '--accent-fuerte-hover')).toBeGreaterThanOrEqual(AA);
    expect(contraste('--on-accent', '--destructive-fuerte-hover')).toBeGreaterThanOrEqual(AA);
  });

  it('--accent-ink es el paso más legible: escribir con --accent es usar el rol equivocado', () => {
    // Hasta el 26-09 --accent (índigo) se quedaba en ~4,1:1 y este test lo
    // documentaba como "no llega a AA". El acento 248 sí llega (4,67:1), pero
    // el rol de tinta sigue siendo --accent-ink: más claro y más legible.
    expect(contraste('--accent-ink', '--bg-surface')).toBeGreaterThan(contraste('--accent', '--bg-surface'));
  });

  it('los tres son del mismo tono (248), no tres azules distintos', () => {
    for (const t of ['--accent', '--accent-fuerte', '--accent-fuerte-hover', '--accent-ink']) {
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
    'src/components/shell/ConfirmDialog.css',
    'src/components/BottomPanel/InspectorTab.css',
  ];

  it.each(FUENTES)('%s usa --accent-ink para el texto, no --accent', (ruta) => {
    const css = readFileSync(join(process.cwd(), ruta), 'utf8');
    // `(?<![-\w])color:` para no confundir `border-color` ni `accent-color`
    // con `color`: un BORDE sí puede usar --accent, lo que no puede es la tinta.
    const malos = [...css.matchAll(/^.*(?<![-\w])color:\s*var\(--accent\)\s*;.*$/gm)].map((m) => m[0].trim());
    expect(malos, 'el acento como color de texto: el rol para tinta es --accent-ink').toEqual([]);
  });
});

describe('un relleno con texto blanco no sube a --accent al pasar el mouse', () => {
  // Re-revisión final F1 (26-09): la ola de arreglos puso el hover de un botón
  // con texto blanco en --accent (3,95:1) y ninguna prueba lo vio — el test de
  // arriba solo mira `color:`, y el hover hereda el blanco de la regla de
  // reposo. Aquí se cruzan las dos mitades: la regla en reposo que rellena con
  // --accent-fuerte y escribe con --on-accent, y la de `:hover` del MISMO
  // selector que rellena con --accent. Un botón de icono no entra: el dock
  // activo ya está en --accent en reposo y Enviar pone el blanco en su `svg`;
  // a un glifo, además, le basta 3:1.
  const rastreados = (patron: string) =>
    execFileSync('git', ['ls-files', patron], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const reglasDe = (css: string) =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectores: m[1].split(',').map((s) => s.trim()).filter(Boolean),
      cuerpo: m[2],
    }));
  const rellenoConTexto = (cuerpo: string) =>
    /(?<![-\w])color:\s*var\(--on-accent\)/.test(cuerpo) && /background(?:-color)?:\s*var\(--accent-fuerte\)/.test(cuerpo);
  const hoverAlAcento = (cuerpo: string) => /background(?:-color)?:\s*var\(--accent\)\s*;/.test(cuerpo);
  const sinHover = (s: string) => s.replace(/:hover(:not\([^)]*\))?/, '');

  it.each(rastreados('src/**/*.css'))('%s', (ruta) => {
    const reglas = reglasDe(readFileSync(join(process.cwd(), ruta), 'utf8'));
    const enReposo = new Set(
      reglas.filter((r) => rellenoConTexto(r.cuerpo)).flatMap((r) => r.selectores.filter((s) => !s.includes(':hover'))),
    );
    const malos = reglas
      .filter((r) => hoverAlAcento(r.cuerpo))
      .flatMap((r) => r.selectores.filter((s) => s.includes(':hover') && enReposo.has(sinHover(s))));
    expect(malos, 'texto blanco sobre --accent al hover (3,95:1): el paso es --accent-fuerte-hover').toEqual([]);
  });
});
