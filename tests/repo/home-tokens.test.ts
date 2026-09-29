import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const tokensCss = readFileSync('home/tokens.css', 'utf8');
const homeCss = existsSync('home/home.css') ? readFileSync('home/home.css', 'utf8') : '';
const html = existsSync('index.html') ? readFileSync('index.html', 'utf8') : '';

const tokens = Object.fromEntries(
  [...tokensCss.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
);
function lum(hex: string) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(tokens[a]), lum(tokens[b])].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('home/tokens.css', () => {
  it.each([
    ['--tinta', '--papel', 14.5],
    ['--tinta-70', '--papel', 4.5],
    ['--senal-texto', '--papel', 4.5],
    ['--blanco', '--senal', 4.5],
    ['--papel', '--tinta', 14.5],
    ['--papel-60', '--tinta', 4.5],
    ['--tinta-70', '--papel-hundido', 4.5],
  ])('%s sobre %s ≥ %s:1', (texto, fondo, umbral) => {
    expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(umbral);
  });

  it('el oro y el gris de verdad no alcanzan como texto (por eso están prohibidos)', () => {
    expect(contraste('--oro', '--papel')).toBeLessThan(3);
    expect(contraste('--gris', '--papel')).toBeLessThan(3);
  });

  it('solo Inter y JetBrains Mono', () => {
    expect(tokens['--font-sans']).toBe("'Inter Variable', 'Inter Fallback', system-ui, sans-serif");
    expect(tokens['--font-mono']).toBe("'JetBrains Mono Variable', 'JetBrains Mono Fallback', ui-monospace, monospace");
    // Los *Fallback son la misma familia: Arial con las métricas del .woff2 (Capsize).
    const familias = [...(homeCss + html).matchAll(/font-family\s*:\s*([^;]+);/g)].map((m) => m[1]);
    for (const f of familias) expect(f).toMatch(/^(var\(--font-(sans|mono)\)|'(Inter|JetBrains Mono) (Variable|Fallback)')$/);
  });

  it('cada familia nombrada en las pilas tiene su @font-face en home.css', () => {
    const declaradas = [...homeCss.matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*([^;]+);/g)].map((m) => m[1].trim());
    const nombradas = (tokens['--font-sans'] + ',' + tokens['--font-mono']).match(/'[^']+'/g) ?? [];
    expect(nombradas).toHaveLength(4);
    for (const n of nombradas) expect(declaradas).toContain(n);
  });
});

describe('home/home.css respeta los tokens', () => {
  it('sin var(--x, fallback)', () => expect(homeCss).not.toMatch(/var\(--[\w-]+\s*,/));
  it('sin colores literales', () => expect(homeCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/));
  it('el oro y el gris nunca como color de texto', () => {
    expect(homeCss).not.toMatch(/(^|[;{\s])color\s*:\s*var\(--(oro|gris)\)/m);
  });
  it('sin sombras ni clamp()', () => {
    expect(homeCss).not.toMatch(/box-shadow\s*:\s*(?!none)/);
    expect(homeCss).not.toMatch(/clamp\(/);
  });
});
