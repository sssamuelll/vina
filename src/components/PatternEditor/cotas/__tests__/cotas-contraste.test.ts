import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Revisión adversarial de UI del 2026-09-04, hallazgo F5.
 *
 * Medido en la app viva, componiendo los fondos reales de todos los ancestros:
 *
 *   chip de cota relleno   blanco sobre oklch(0.66 0.16 248)   3,10:1   a 11 px
 *   chip de cota hueco     oklch(0.66 0.16 248) sobre blanco   3,10:1   a 11 px
 *
 * AA pide 4,5:1 para texto de menos de 18 px. El chip es *el número que María
 * lee y escribe*: es el texto más importante del lienzo y es el que peor se lee.
 *
 * La causa: `--accent-2d` se eligió en su día para "selección + costuras" —una
 * línea sobre papel crema, donde ese azul claro funciona— y las cotas lo
 * heredaron tal cual para poner texto encima. Nadie le probó texto.
 *
 * La regla que falta, ejecutable: **el acento sobre el que se escribe un número
 * no es el mismo que el que dibuja una línea.** `--accent-2d` sigue siendo el
 * de la selección; la familia de cotas usa un paso más oscuro del MISMO tono.
 *
 * Nota de método: la suite anterior (HintText.legibilidad) solo sabía leer
 * `#rrggbb`. Los tokens de cota están en `oklch()`, así que aquí va la
 * conversión OKLab → sRGB completa. Sin ella este defecto es invisible para
 * los tests, que es exactamente por qué sobrevivió.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 2 F5.
 */

const TOKENS = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

/** Valor declarado de un token, resolviendo `var(--otro)` en cadena. */
function token(name: string, vistos = new Set<string>()): string {
  if (vistos.has(name)) throw new Error(`ciclo de tokens en ${name}`);
  vistos.add(name);
  const m = TOKENS.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'));
  if (!m) throw new Error(`El token ${name} no existe en tokens.css`);
  const valor = m[1].trim();
  const ref = valor.match(/^var\((--[\w-]+)\)$/);
  return ref ? token(ref[1], vistos) : valor;
}

type RGB = [number, number, number];

function oklchARgb(L: number, C: number, hDeg: number): RGB {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((v) => {
    const c = Math.max(0, Math.min(1, v));
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
  }) as RGB;
}

/** Acepta las tres sintaxis que hay en tokens.css: #rgb, #rrggbb y oklch(). */
function aRgb(css: string): RGB {
  const ok = css.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i);
  if (ok) return oklchARgb(parseFloat(ok[1]), parseFloat(ok[2]), parseFloat(ok[3]));
  const hex = css.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
  }
  throw new Error(`no sé leer el color "${css}"`);
}

function luminancia([r, g, b]: RGB): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(aRgb(a)), luminancia(aRgb(b))];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** AA para texto normal de menos de 18 px. Los chips son de 11 px. */
const AA = 4.5;
/** WCAG 1.4.11 para objetos gráficos: una línea de cota es uno. */
const AA_GRAFICO = 3;

describe('F5 — el número que María lee cumple AA', () => {
  it('el chip relleno: su tinta sobre su fondo', () => {
    expect(contraste(token('--cota-ink-2d'), token('--cota-bg-2d'))).toBeGreaterThanOrEqual(AA);
  });

  it('el chip hueco: su tinta sobre su fondo blanco', () => {
    // El hueco (cota de verificación) escribe el acento sobre --cota-edit-bg-2d.
    expect(contraste(token('--cota-line-2d'), token('--cota-edit-bg-2d'))).toBeGreaterThanOrEqual(AA);
  });

  it('el chip en edición: su tinta sobre su campo', () => {
    expect(contraste(token('--cota-edit-ink-2d'), token('--cota-edit-bg-2d'))).toBeGreaterThanOrEqual(AA);
  });

  it('el chip relleno también se distingue del papel del lienzo', () => {
    // Si no, el chip se pierde en el fondo aunque su texto sea legible.
    expect(contraste(token('--cota-bg-2d'), token('--canvas-2d'))).toBeGreaterThanOrEqual(AA_GRAFICO);
  });

  it('la línea de cota se ve sobre el papel', () => {
    expect(contraste(token('--cota-line-2d'), token('--canvas-2d'))).toBeGreaterThanOrEqual(AA_GRAFICO);
  });

  it('y sobre el blanco del interior de una pieza, que es el otro fondo posible', () => {
    expect(contraste(token('--cota-line-2d'), token('--piece-fill-2d'))).toBeGreaterThanOrEqual(AA_GRAFICO);
  });
});

describe('F5 — arreglar la cota no puede cambiar la selección', () => {
  // El arreglo perezoso sería oscurecer --accent-2d y ya. Pero ese token es el
  // color de la selección y de las costuras, ratificado con mockups aprobados
  // (spec 2026-08-30). Se toca la familia de cotas, no el acento del lienzo.
  it('--accent-2d sigue siendo el azul aprobado para selección y costuras', () => {
    expect(token('--accent-2d')).toBe('oklch(0.66 0.16 248)');
  });

  it('la familia de cotas es del mismo tono que la selección (no un azul nuevo)', () => {
    const tono = (css: string) => {
      const m = css.match(/^oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)$/i);
      expect(m, `--cota-* debería declararse en oklch para poder compararle el tono: "${css}"`).toBeTruthy();
      return parseFloat(m![1]);
    };
    expect(tono(token('--cota-bg-2d'))).toBeCloseTo(tono(token('--accent-2d')), 0);
  });
});
