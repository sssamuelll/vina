import { describe, it, expect } from 'vitest';
import { parseMedida, formatMedida } from '../parseMedida';

describe('formatMedida con referencia en mm (P3b)', () => {
  it('la referencia acompaña también a una distancia: «de 520 mm»', () => {
    expect(formatMedida(156, 'mm', 'de 520 mm')).toBe('156 mm de 520 mm');
    expect(formatMedida(156, 'mm')).toBe('156 mm');
  });
});

/** Cotas vivas (spec 2026-08-30 § 4.4): lo que María escribe en un chip. */
describe('parseMedida', () => {
  it.each([
    ['300', 300], ['300,5', 300.5], ['300.5', 300.5], [' 12 ', 12], ['-45', -45], ['0', 0],
  ])('acepta %s', (texto, esperado) => expect(parseMedida(texto)).toBe(esperado));
  it.each([['', null], ['abc', null], ['1e3', null], ['3,0,0', null]])('rechaza %s', (t, e) =>
    expect(parseMedida(t)).toBe(e));

  // El parser rechazaba lo que el propio chip pinta (formatMedida): "90°",
  // "12,3 mm" — y el signo menos Unicode (−, U+2212) que el teclado numérico
  // de algún sistema operativo escribe en vez del ASCII.
  it.each([
    ['90°', 90], ['90 °', 90], ['12,3 mm', 12.3], ['12,3mm', 12.3], ['−90', -90], ['−12,5°', -12.5],
  ])('acepta el sufijo que el chip pinta: %s', (texto, esperado) => expect(parseMedida(texto)).toBe(esperado));
  it.each([['90grados', null], ['1e2', null], [',', null], ['30 cm', null]])('sigue rechazando %s', (t, e) =>
    expect(parseMedida(t)).toBe(e));
});

describe('formatMedida', () => {
  it('mm con coma decimal y sin ceros de relleno', () => {
    expect(formatMedida(300, 'mm')).toBe('300 mm');
    expect(formatMedida(213.5, 'mm')).toBe('213,5 mm');
    expect(formatMedida(213.54, 'mm')).toBe('213,5 mm');
  });
  it('grados', () => expect(formatMedida(37, 'deg')).toBe('37°'));
  it('incluye la referencia en el mismo texto que se mide y se pinta', () => {
    expect(formatMedida(90, 'deg', 'al borde')).toBe('90° al borde');
    expect(formatMedida(30, 'deg', 'al tramo')).toBe('30° al tramo');
    // Desde P3b una distancia también la lleva: «156 mm de 520 mm» (el largo del lado).
    expect(formatMedida(100, 'mm', 'de 300 mm')).toBe('100 mm de 300 mm');
  });
});
