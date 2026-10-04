import { describe, it, expect } from 'vitest';
import { loQueSobra } from '../e2e/helpers/reposo';

describe('lo que sobra en reposo (spec 2026-10-02 § 9)', () => {
  it('la frase de ayuda no sobra', () => {
    expect(loQueSobra(['pista'], false)).toEqual([]);
  });

  it('las opciones al pie y la barra de IA sobran en reposo, y salen ordenadas', () => {
    expect(loQueSobra(['pie', 'pista', 'barra'], false)).toEqual(['barra', 'pie']);
  });

  it('el estado vacío solo se permite en la pantalla vacía', () => {
    expect(loQueSobra(['estado-vacio', 'pista'], true)).toEqual([]);
    expect(loQueSobra(['estado-vacio', 'pista'], false)).toEqual(['estado-vacio']);
  });

  it('control: sin nada visible no sobra nada', () => {
    expect(loQueSobra([], false)).toEqual([]);
    expect(loQueSobra([], true)).toEqual([]);
  });
});
