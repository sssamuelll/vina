import { describe, it, expect } from 'vitest';
import { parseMedida, formatMedida } from '../parseMedida';

/** Cotas vivas (spec 2026-08-30 § 4.4): lo que María escribe en un chip. */
describe('parseMedida', () => {
  it.each([
    ['300', 300], ['300,5', 300.5], ['300.5', 300.5], [' 12 ', 12], ['-45', -45], ['0', 0],
  ])('acepta %s', (texto, esperado) => expect(parseMedida(texto)).toBe(esperado));
  it.each([['', null], ['abc', null], ['1e3', null], ['3,0,0', null], ['30 mm', null]])('rechaza %s', (t, e) =>
    expect(parseMedida(t)).toBe(e));
});

describe('formatMedida', () => {
  it('mm con coma decimal y sin ceros de relleno', () => {
    expect(formatMedida(300, 'mm')).toBe('300 mm');
    expect(formatMedida(213.5, 'mm')).toBe('213,5 mm');
    expect(formatMedida(213.54, 'mm')).toBe('213,5 mm');
  });
  it('grados', () => expect(formatMedida(37, 'deg')).toBe('37°'));
});
