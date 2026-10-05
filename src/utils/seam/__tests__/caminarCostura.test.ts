import { describe, it, expect } from 'vitest';
import { bandaDeDesajuste, metricasDeCaminar, TOLERANCIA_CAMINAR_MM } from '../caminarCostura';

/** Lo que mide «Caminar costura», sacado del hook: una sola medida para la herramienta y la superficie. */
describe('caminarCostura', () => {
  it('la tolerancia de siempre es 3 mm', () => {
    expect(TOLERANCIA_CAMINAR_MM).toBe(3);
  });
  it('bandas: verde por debajo de la tolerancia, amarillo hasta el doble, rojo más allá', () => {
    expect(bandaDeDesajuste(2.9, 3)).toBe('green');
    expect(bandaDeDesajuste(3, 3)).toBe('yellow');
    expect(bandaDeDesajuste(5.9, 3)).toBe('yellow');
    expect(bandaDeDesajuste(6, 3)).toBe('red');
  });
  it('delta es B menos A, con signo, y la holgura se mide sobre A, como en el panel de la herramienta', () => {
    const m = metricasDeCaminar(200, 190);
    expect(m.delta).toBe(-10);
    expect(m.easePercent).toBeCloseTo(-5, 6);
    expect(m.band).toBe('red');
    expect(m.walks).toBe(false);
  });
  it('con una holgura buscada, camina lo que sobra después de descontarla', () => {
    expect(metricasDeCaminar(400, 440, 10, 40).walks).toBe(true);
    expect(metricasDeCaminar(400, 410, 10, 40).walks).toBe(false);
  });
});
