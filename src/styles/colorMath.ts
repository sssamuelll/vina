/**
 * Aritmética de color de la piel: OKLCH → sRGB y contraste WCAG 2.
 *
 * Un solo lugar, porque hasta el 26-09 había tres copias en tests y la que
 * más importaba (`acento-legible`) solo sabía leer `#rrggbb`: un token escrito
 * en `oklch()` la dejaba ciega, que es como sobrevivió el 3,10:1 de las cotas
 * (revisión 2026-09-04, F5). Lo usan los tests de tokens, `contrasteDeTokens.ts`
 * y `scripts/contraste-tokens.ts`.
 */
export type RGB = [number, number, number];
export interface RGBA { rgb: RGB; alpha: number }

/* Los tres nombres que aparecen en el CSS del cromo. Van como valores ya
 * leídos y no como cadenas: el trinquete (R3) cuenta cada «#rrggbb» o
 * «rgba(» fuera de tokens.css, y con razón. */
const NOMBRADOS: Record<string, RGBA> = {
  white: { rgb: [255, 255, 255], alpha: 1 },
  black: { rgb: [0, 0, 0], alpha: 1 },
  transparent: { rgb: [0, 0, 0], alpha: 0 },
};

const canal = (v: number): number => {
  const c = Math.max(0, Math.min(1, v));
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(s * 255);
};

/** OKLCH (L 0-1, C, h en grados) → sRGB 8 bits, recortado a gama como hace el navegador. */
export function oklchToRgb(L: number, C: number, hDeg: number): RGB {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    canal(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    canal(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    canal(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

const alfa = (s: string | undefined): number => {
  if (s === undefined) return 1;
  const t = s.trim();
  return t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t);
};

/** Lee #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() con comas o barra, oklch() con o sin alfa, y tres nombres. */
export function parseCssColor(value: string): RGBA {
  const v = value.trim().toLowerCase();
  const nombrado = NOMBRADOS[v];
  if (nombrado) return { rgb: [...nombrado.rgb] as RGB, alpha: nombrado.alpha };

  const hex = v.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    const n = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { rgb: n, alpha: a };
  }

  const rgb = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/);
  if (rgb) {
    return { rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])], alpha: alfa(rgb[4]) };
  }

  const ok = v.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/);
  if (ok) {
    return { rgb: oklchToRgb(Number(ok[1]), Number(ok[2]), Number(ok[3])), alpha: alfa(ok[4]) };
  }

  throw new Error(`no sé leer el color "${value}"`);
}

export function relativeLuminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `fg` con su alfa, encima de un fondo opaco. */
export function compositeOver(fg: RGBA, bg: RGB): RGB {
  return fg.rgb.map((v, i) => Math.round(v * fg.alpha + bg[i] * (1 - fg.alpha))) as RGB;
}

/** Valor declarado de un token en un CSS, siguiendo cadenas `var(--otro)`. */
export function resolveToken(css: string, name: string, vistos = new Set<string>()): string {
  if (vistos.has(name)) throw new Error(`ciclo de tokens en ${name}`);
  vistos.add(name);
  const m = css.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'));
  if (!m) throw new Error(`El token ${name} no existe`);
  const valor = m[1].trim();
  const ref = valor.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolveToken(css, ref[1], vistos) : valor;
}

export function tokenColor(css: string, name: string): RGBA {
  return parseCssColor(resolveToken(css, name));
}

/**
 * El CSS visto desde dentro de `data-material="<ámbito>"` (spec 2026-10-02
 * § 7.2): lo que el ámbito declara va delante, y `resolveToken`, que toma la
 * primera declaración, encuentra la del ámbito o, si no la hay, la de :root.
 *
 * Una diferencia con el navegador, a sabiendas: aquí un alias de :root
 * (`--text-muted: var(--text-tertiary)`) se sigue con los valores del ámbito, y
 * el navegador lo resuelve en :root, con los del marco. Las dos lecturas
 * coinciden porque ambito-de-papel.test.ts exige que el ámbito vuelva a
 * declarar cada alias que lea uno de sus nombres.
 */
export function cssDelAmbito(css: string, ambito: string): string {
  const bloque = css.match(new RegExp(`\\[data-material="${ambito}"\\]\\s*\\{([^}]*)\\}`));
  if (!bloque) throw new Error(`no hay ámbito "${ambito}" en el CSS`);
  return `${bloque[1]}\n${css}`;
}
