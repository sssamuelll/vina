import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Revisión adversarial de UI del 2026-09-04 — la regresión que la limpieza de
 * tokens estuvo a punto de dejar dentro.
 *
 * Al sustituir los colores literales por tokens, seis sitios que pintaban texto
 * con un azul claro pasaron a `var(--accent)`. Sobre el cromo oscuro eso baja de
 * ~5,0:1 a ~4,1:1: **cruza el umbral de AA de cumplir a no cumplir**, y ningún
 * test lo veía porque el trinquete solo cuenta literales, no mide contraste.
 *
 * De ahí sale el tercer rol del acento. Los tres NO son intercambiables y cada
 * uno tiene su requisito de contraste, que es lo que fija este archivo:
 *
 *   --accent         bordes, tintes y superficies      (no lleva texto)
 *   --accent-fuerte  relleno sólido con texto blanco    blanco ≥ 4,5:1
 *   --accent-ink     el acento escrito sobre el cromo   sobre el fondo ≥ 4,5:1
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 2 F5.
 */

const TOKENS = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function token(name: string): string {
  const m = TOKENS.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'));
  if (!m) throw new Error(`El token ${name} no existe en tokens.css`);
  return m[1].trim();
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminancia(c: [number, number, number]): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(rgb(a)), luminancia(rgb(b))];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const AA = 4.5;
/** Los tres fondos del cromo sobre los que puede caer una etiqueta de acento. */
const FONDOS = ['--bg-surface', '--bg-primary', '--bg-secondary', '--bg-elevated'].filter((n) => {
  try { token(n); return true; } catch { return false; }
});

describe('la familia del acento: cada rol cumple lo suyo', () => {
  it.each(FONDOS)('--accent-ink se lee sobre %s', (fondo) => {
    expect(contraste(token('--accent-ink'), token(fondo))).toBeGreaterThanOrEqual(AA);
  });

  it('--accent-fuerte aguanta texto blanco encima', () => {
    expect(contraste('#ffffff', token('--accent-fuerte'))).toBeGreaterThanOrEqual(AA);
  });

  it('--accent NO se usa como tinta: no llega a AA sobre el cromo, y por eso existe --accent-ink', () => {
    // Este test documenta el porqué. Si algún día --accent sí llegara, se
    // podrían fusionar los roles — y este test fallaría avisando de ello.
    expect(contraste(token('--accent'), token('--bg-surface'))).toBeLessThan(AA);
  });

  it('los tres son de la misma familia, no tres azules distintos', () => {
    // Mismo tono dominante: el canal azul manda en los tres.
    for (const t of ['--accent', '--accent-fuerte', '--accent-ink']) {
      const [r, g, b] = rgb(token(t));
      expect(b, `${t} no es de la familia índigo`).toBeGreaterThan(Math.max(r, g));
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
  ];

  it.each(FUENTES)('%s usa --accent-ink para el texto, no --accent', (ruta) => {
    const css = readFileSync(join(process.cwd(), ruta), 'utf8');
    // `(?<![-\w])color:` para no confundir `border-color` ni `accent-color`
    // con `color`: un BORDE sí puede usar --accent, lo que no puede es la tinta.
    const malos = [...css.matchAll(/^.*(?<![-\w])color:\s*var\(--accent\)\s*;.*$/gm)].map((m) => m[0].trim());
    expect(
      malos,
      'el acento como color de texto se queda en ~4,1:1 sobre el cromo; el rol para tinta es --accent-ink',
    ).toEqual([]);
  });
});
