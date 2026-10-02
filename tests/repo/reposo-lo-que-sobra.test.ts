import { describe, it, expect } from 'vitest';
import { loQueSobra } from '../e2e/helpers/reposo';

describe('lo que sobra en reposo (spec 2026-10-02 § 9)', () => {
  it('la frase de ayuda no sobra', () => {
    expect(loQueSobra(['pista'], false)).toEqual([]);
  });

  it('la tira, la fila y la barra de IA sobran, y salen ordenadas', () => {
    expect(loQueSobra(['tira', 'pista', 'fila', 'barra'], false)).toEqual(['barra', 'fila', 'tira']);
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
