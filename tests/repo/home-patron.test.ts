import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — módulo .mjs sin tipos
import { generarPatronSvg } from '../../scripts/home/dxf-a-svg.mjs';

const dxf = readFileSync('tests/fixtures/garments/maria_patrones_samuel_2M.dxf', 'utf8');
const { svg, dobladilloMm } = generarPatronSvg(dxf);

describe('patrón del hero', () => {
  it('el fichero commiteado es exactamente lo que genera el script (determinista y al día)', () => {
    expect(readFileSync('home/img/patron.svg', 'utf8')).toBe(svg);
  });
  it('caja de 720×540', () => expect(svg).toMatch(/viewBox="0 0 720 540"/));
  it('dos piezas: delantero y una manga', () => {
    expect(svg.match(/class="pieza"/g)).toHaveLength(2);
    expect(svg).toContain('DELANTERO · ×1');
    expect(svg).toContain('MANGA · ×2');
  });
  it('rótulos que los datos no sostienen, fuera', () => {
    for (const falso of ['DOBLEZ', 'CAMISA', 'T38', 'pinza']) expect(svg).not.toContain(falso);
  });
  it('elige el delantero por el escote más hondo (SAMUEL-5: 51 mm frente a 12 de la espalda)', () => {
    expect(svg).toContain('data-pieza="PATRONES PARA SAMUEL-5"');
  });
  it('la cota es la medida real del dobladillo del delantero', () => {
    expect(dobladilloMm).toBe(520);
    expect(svg).toContain(`${dobladilloMm} mm · dobladillo`);
    expect(svg).not.toContain('328 mm');
  });
  it('el rótulo del archivo sale del DXF', () => expect(svg).toContain('PATRONES PARA SAMUEL · AAMA · mm'));
  it('sin colores literales: el color lo ponen los tokens', () => {
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|fill="(?!none)|stroke="(?!none)/);
  });
  it('accesible como imagen', () => expect(svg).toMatch(/<svg[^>]*role="img"[^>]*aria-label="[^"]+"/));
  it('cabe en su caja', () => {
    const nums = [...svg.matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
    for (const [x, y] of nums) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(720); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(540); }
  });
});
