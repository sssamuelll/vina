import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — módulo .mjs sin tipos
import { generarPatronSvg } from '../../scripts/home/dxf-a-svg.mjs';

const dxf = readFileSync('tests/fixtures/garments/maria_patrones_samuel_2M.dxf', 'utf8');
const ROTULOS = {
  en: { delantero: 'FRONT · ×1', manga: 'SLEEVE · ×2', cota: 'mm · hem', aria: 'The front and the sleeve of a T-shirt pattern' },
  es: { delantero: 'DELANTERO · ×1', manga: 'MANGA · ×2', cota: 'mm · dobladillo', aria: 'El delantero y la manga del patrón de una camiseta' },
} as const;

describe.each(['en', 'es'] as const)('patrón del hero (%s)', (idioma) => {
  const { svg, dobladilloMm } = generarPatronSvg(dxf, idioma);
  const r = ROTULOS[idioma];
  it('el fichero commiteado es exactamente lo que genera el script (determinista y al día)', () => {
    expect(readFileSync(`home/img/patron.${idioma}.svg`, 'utf8')).toBe(svg);
  });
  it('caja de 720×540', () => expect(svg).toMatch(/viewBox="0 0 720 540"/));
  it('dos piezas: delantero y una manga, rotuladas en su idioma', () => {
    expect(svg.match(/class="pieza"/g)).toHaveLength(2);
    expect(svg).toContain(r.delantero);
    expect(svg).toContain(r.manga);
  });
  it('rótulos que los datos no sostienen, fuera', () => {
    for (const falso of ['DOBLEZ', 'CAMISA', 'T38', 'pinza', 'FOLD']) expect(svg).not.toContain(falso);
  });
  it('elige el delantero por el escote más hondo (SAMUEL-5)', () => expect(svg).toContain('data-pieza="PATRONES PARA SAMUEL-5"'));
  it('la cota es la medida real del dobladillo del delantero', () => {
    expect(dobladilloMm).toBe(520);
    expect(svg).toContain(`${dobladilloMm} ${r.cota}`);
    expect(svg).not.toContain('328 mm');
  });
  it('el rótulo del archivo sale del DXF y no se traduce', () => expect(svg).toContain('PATRONES PARA SAMUEL · AAMA · mm'));
  it('la descripción accesible va en su idioma', () => expect(svg).toMatch(new RegExp(`aria-label="${r.aria}`)));
  it('sin colores literales', () => expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|fill="(?!none)|stroke="(?!none)/));
  it('cabe en su caja', () => {
    const nums = [...svg.matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
    for (const [x, y] of nums) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(720); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(540); }
  });
});

it('un idioma que no existe revienta en vez de salir mudo', () => {
  // @ts-expect-error — a propósito
  expect(() => generarPatronSvg(dxf, 'de')).toThrow(/idioma/);
});
