import { describe, it, expect } from 'vitest';
import { cuadroDeLaCuadricula, primeraLineaDesde, CUADRO_MIN_PX } from '../cuadricula';
import { ZOOM_MAX, ZOOM_MIN } from '../../../../input/zoom2d';

describe('cuadroDeLaCuadricula — un solo paso, siempre a la vista', () => {
  it('con el patrón de María encuadrado (zoom 0,48) el cuadro es de 50 mm', () => {
    const c = cuadroDeLaCuadricula(10, 0.48, 'mm')!;
    expect(c.mm).toBe(50);
    expect(c.px).toBeCloseTo(24);
    expect(c.rotulo).toBe('50 mm');
  });

  it('en Split (zoom 0,244) sube a 100 mm', () => {
    expect(cuadroDeLaCuadricula(10, 0.244, 'mm')).toMatchObject({ mm: 100, rotulo: '100 mm' });
  });

  it.each([
    [1, 20, '20 mm'],
    [2, 10, '10 mm'],
    [4, 5, '5 mm'],
    [10, 2, '2 mm'],
    [20, 1, '1 mm'],
  ])('a zoom %s el cuadro es de %s mm', (zoom, mm, rotulo) => {
    expect(cuadroDeLaCuadricula(10, zoom, 'mm')).toMatchObject({ mm, rotulo });
  });

  it('nunca baja de 1 mm: al tope de zoom el cuadro crece en pantalla', () => {
    const c = cuadroDeLaCuadricula(10, ZOOM_MAX, 'mm')!;
    expect(c.mm).toBe(1);
    expect(c.px).toBeCloseTo(ZOOM_MAX);
  });

  it('en centímetros dice centímetros, con coma decimal', () => {
    expect(cuadroDeLaCuadricula(10, 0.48, 'cm')!.rotulo).toBe('5 cm');
    expect(cuadroDeLaCuadricula(10, 4, 'cm')!.rotulo).toBe('0,5 cm');
    expect(cuadroDeLaCuadricula(10, 20, 'cm')!.rotulo).toBe('0,1 cm');
  });

  it('con otra cuadrícula (3 mm) el cuadro es un múltiplo 1-2-5 de ella', () => {
    expect(cuadroDeLaCuadricula(3, 1, 'mm')).toMatchObject({ mm: 30, rotulo: '30 mm' });
    expect(cuadroDeLaCuadricula(3, 10, 'mm')).toMatchObject({ mm: 3, rotulo: '3 mm' });
    expect(cuadroDeLaCuadricula(3, 20, 'mm')).toMatchObject({ mm: 1.5, rotulo: '1,5 mm' });
  });

  it('en pulgadas el cuadro es una fracción de pulgada, y lo dice', () => {
    expect(cuadroDeLaCuadricula(10, 1, 'inches')).toMatchObject({ mm: 25.4, rotulo: '1 in' });
    expect(cuadroDeLaCuadricula(10, 4, 'inches')!.rotulo).toBe('1/4 in');
    expect(cuadroDeLaCuadricula(10, 8, 'inches')!.rotulo).toBe('1/8 in');
    expect(cuadroDeLaCuadricula(10, 0.48, 'inches')!.rotulo).toBe('2 in');
    expect(cuadroDeLaCuadricula(10, 0.244, 'inches')!.rotulo).toBe('6 in');
  });

  it('en milímetros el cuadro mide entre 18 y 45 px en todo el rango de zoom', () => {
    for (let zoom = ZOOM_MIN; zoom <= 20; zoom *= 1.01) {
      const c = cuadroDeLaCuadricula(10, zoom, 'mm')!;
      expect(c.px, `zoom ${zoom}`).toBeGreaterThanOrEqual(CUADRO_MIN_PX);
      expect(c.px, `zoom ${zoom}`).toBeLessThanOrEqual(45);
      expect(c.rotulo, `zoom ${zoom}`).toMatch(/^\d+ mm$/);
    }
  });

  it('en pulgadas, entre 18 y 54 px mientras quede escalera', () => {
    for (let zoom = ZOOM_MIN; zoom <= 5.6; zoom *= 1.01) {
      const c = cuadroDeLaCuadricula(10, zoom, 'inches')!;
      expect(c.px, `zoom ${zoom}`).toBeGreaterThanOrEqual(CUADRO_MIN_PX);
      expect(c.px, `zoom ${zoom}`).toBeLessThanOrEqual(54);
    }
  });

  it('una cuadrícula o un zoom imposibles no dan cuadro, y no revientan', () => {
    expect(cuadroDeLaCuadricula(0, 1, 'mm')).toBeNull();
    expect(cuadroDeLaCuadricula(-5, 1, 'mm')).toBeNull();
    expect(cuadroDeLaCuadricula(Number.NaN, 1, 'mm')).toBeNull();
    expect(cuadroDeLaCuadricula(10, 0, 'mm')).toBeNull();
    expect(cuadroDeLaCuadricula(10, Number.POSITIVE_INFINITY, 'mm')).toBeNull();
    expect(cuadroDeLaCuadricula(0, 1, 'inches')).toBeNull();
  });
});

describe('primeraLineaDesde — la primera línea de la cuadrícula a la derecha de un punto', () => {
  it('casos medidos', () => {
    expect(primeraLineaDesde(100, 24, 74)).toBe(76);
    expect(primeraLineaDesde(-37, 24, 74)).toBe(83);
    expect(primeraLineaDesde(74, 24, 74)).toBe(74);
    expect(primeraLineaDesde(300.5, 20, 74)).toBeCloseTo(80.5);
  });

  it('siempre cae sobre una línea, en el punto o a su derecha, a menos de un cuadro', () => {
    for (const pan of [-1234.5, -37, 0, 61.25, 900]) {
      for (const cuadro of [18, 24, 44.9]) {
        const x = primeraLineaDesde(pan, cuadro, 74);
        expect(x).toBeGreaterThanOrEqual(74);
        expect(x - 74).toBeLessThan(cuadro);
        const pasos = (x - pan) / cuadro;
        expect(Math.abs(pasos - Math.round(pasos))).toBeLessThan(1e-9);
      }
    }
  });
});
