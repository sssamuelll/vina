import { describe, it, expect } from 'vitest';
import {
  oklchToRgb, parseCssColor, toHex, contrastRatio, compositeOver, resolveToken, tokenColor,
} from '../colorMath';

describe('colorMath — OKLCH → sRGB', () => {
  it('convierte el acento de la piel al hex que documenta tokens.css', () => {
    expect(toHex(oklchToRgb(0.6, 0.16, 248))).toBe('#0584da');
    expect(toHex(oklchToRgb(0.19, 0.005, 80))).toBe('#151411');
  });
  it('recorta a gama en vez de devolver negativos', () => {
    // --accent-2d-fuerte queda apenas fuera de sRGB; el navegador lo recorta igual.
    expect(toHex(oklchToRgb(0.54, 0.15, 248))).toBe('#0072c0');
  });
});

describe('colorMath — parseCssColor acepta lo que hay en tokens.css', () => {
  it('hex corto, largo y con alfa', () => {
    expect(parseCssColor('#fff')).toEqual({ rgb: [255, 255, 255], alpha: 1 });
    expect(parseCssColor('#0584da')).toEqual({ rgb: [5, 132, 218], alpha: 1 });
    expect(parseCssColor('#00000080').alpha).toBeCloseTo(0.5, 1);
  });
  it('rgb() y rgba() con comas o con barra', () => {
    expect(parseCssColor('rgba(255, 255, 255, 0.07)')).toEqual({ rgb: [255, 255, 255], alpha: 0.07 });
    expect(parseCssColor('rgb(8 7 6 / 55%)')).toEqual({ rgb: [8, 7, 6], alpha: 0.55 });
  });
  it('oklch() con y sin alfa', () => {
    expect(parseCssColor('oklch(0.60 0.16 248)')).toEqual({ rgb: [5, 132, 218], alpha: 1 });
    expect(parseCssColor('oklch(0.60 0.16 248 / 14%)').alpha).toBeCloseTo(0.14);
  });
  it('rechaza lo que no sabe leer, en vez de devolver negro', () => {
    expect(() => parseCssColor('var(--accent)')).toThrow(/no sé leer/);
  });
  it('los tres nombres del cromo: white, black, transparent', () => {
    expect(parseCssColor('white')).toEqual({ rgb: [255, 255, 255], alpha: 1 });
    expect(parseCssColor('black')).toEqual({ rgb: [0, 0, 0], alpha: 1 });
    expect(parseCssColor('transparent').alpha).toBe(0);
  });
});

describe('colorMath — contraste y composición', () => {
  it('blanco sobre negro es 21:1', () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
  });
  it('compone un color con alfa sobre un fondo opaco', () => {
    expect(compositeOver({ rgb: [255, 255, 255], alpha: 0.5 }, [0, 0, 0])).toEqual([128, 128, 128]);
  });
});

describe('colorMath — tokens', () => {
  const CSS = `:root {\n  --a: oklch(0.60 0.16 248);\n  --b: var(--a);\n  --c: var(--b);\n  --ciclo: var(--ciclo);\n}`;
  it('resuelve una cadena de var()', () => {
    expect(resolveToken(CSS, '--c')).toBe('oklch(0.60 0.16 248)');
    expect(tokenColor(CSS, '--c').rgb).toEqual([5, 132, 218]);
  });
  it('avisa del token que no existe y del ciclo', () => {
    expect(() => resolveToken(CSS, '--nada')).toThrow(/no existe/);
    expect(() => resolveToken(CSS, '--ciclo')).toThrow(/ciclo/);
  });
});
