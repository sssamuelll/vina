import type { Page } from '@playwright/test';

export interface FalloDeContraste {
  texto: string;
  selector: string;
  color: string;
  fondo: string;
  ratio: number;
  minimo: number;
}

/**
 * Contraste real de cada texto del cromo contra su fondo COMPUESTO (los
 * fondos con alfa de todos los ancestros, uno sobre otro). El navegador hace
 * la conversión de color: un canvas de 1×1 lee cualquier sintaxis que el
 * motor entienda (`oklch()`, `color-mix()`, `rgba()`), así que si el motor no
 * entendiera la piel, aquí se vería.
 *
 * Fuera de la medida: el `<svg>` del papel (lo miden HintText.legibilidad y
 * cotas-contraste), lo deshabilitado (WCAG lo exime), lo atenuado por debajo
 * de 0,6 de opacidad (es un estado inerte), lo que está bajo un degradado
 * (fondo indeterminado) y el cromo solo de desarrollo.
 */
export async function medirContraste(page: Page): Promise<FalloDeContraste[]> {
  return page.evaluate(() => {
    const lienzo = document.createElement('canvas');
    lienzo.width = 1;
    lienzo.height = 1;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
    const aRgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const lum = (c: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const sobre = (fg: number[], alfa: number, bg: number[]) => [0, 1, 2].map((i) => fg[i] * alfa + bg[i] * (1 - alfa));

    const raiz = aRgba(getComputedStyle(document.body).backgroundColor);
    /** Fondo compuesto bajo `el`, o null si un ancestro pinta un degradado. */
    const fondoDe = (el: Element): number[] | null => {
      const capas: Array<[number, number, number, number]> = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none') return null;
        const c = aRgba(cs.backgroundColor);
        if (c[3] > 0) capas.push(c);
        if (c[3] >= 0.999) break;
      }
      let fondo: number[] = raiz.slice(0, 3);
      for (const c of capas.reverse()) fondo = sobre(c.slice(0, 3), c[3], fondo);
      return fondo;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    };
    const opacidadDe = (el: Element) => {
      let o = 1;
      for (let n: Element | null = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity || '1');
      return o;
    };
    const selectorDe = (el: Element) => {
      const partes: string[] = [];
      for (let n: Element | null = el, i = 0; n && n !== document.body && i < 4; n = n.parentElement, i++) {
        const clases = typeof n.className === 'string' && n.className.trim()
          ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
        partes.unshift(n.tagName.toLowerCase() + clases);
      }
      return partes.join(' > ');
    };

    const fallos: Array<{ texto: string; selector: string; color: string; fondo: string; ratio: number; minimo: number }> = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (el.closest('svg') || el.closest('[data-superficie="dev"]')) continue;
      if (el.matches(':disabled, [aria-disabled="true"], :disabled *')) continue;
      const texto = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!texto || !visible(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || opacidadDe(el) < 0.6) continue;
      const fondo = fondoDe(el);
      if (!fondo) continue;
      const c = aRgba(cs.color);
      const tinta = sobre(c.slice(0, 3), c[3], fondo);
      const px = parseFloat(cs.fontSize);
      const peso = parseInt(cs.fontWeight, 10) || 400;
      const minimo = px >= 24 || (px >= 18.66 && peso >= 700) ? 3 : 4.5;
      const r = ratio(tinta, fondo);
      if (r < minimo) {
        fallos.push({
          texto: texto.slice(0, 40),
          selector: selectorDe(el),
          color: cs.color,
          fondo: `rgb(${fondo.map(Math.round).join(', ')})`,
          ratio: Math.round(r * 100) / 100,
          minimo,
        });
      }
    }
    return fallos;
  });
}
