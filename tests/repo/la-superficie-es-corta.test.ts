import { describe, it, expect } from 'vitest';
import { SUPERFICIE, definicionesDeLaSuperficie } from '../../src/copilot/superficie';

/**
 * La superficie es corta (spec 2026-10-05 § 7): pocos verbos, y poco de lo
 * que viaja en cada llamada al modelo. Hoy el registro manda unos 203.000
 * caracteres por llamada (~58.000 tokens). Es un trinquete: los techos solo bajan.
 */
const TECHO_DE_VERBOS = 24;
const TECHO_DE_CARACTERES = 30_000;

describe('la superficie es corta', () => {
  it(`como mucho ${TECHO_DE_VERBOS} verbos`, () => {
    expect(SUPERFICIE.length).toBeLessThanOrEqual(TECHO_DE_VERBOS);
  });
  it(`las definiciones que viajan en cada llamada no pasan de ${TECHO_DE_CARACTERES} caracteres`, () => {
    expect(JSON.stringify(definicionesDeLaSuperficie()).length).toBeLessThanOrEqual(TECHO_DE_CARACTERES);
  });
  it('nombres en inglés, en snake_case y sin repetir', () => {
    const nombres = SUPERFICIE.map(v => v.name);
    for (const n of nombres) expect(n).toMatch(/^[a-z]+(_[a-z]+)*$/);
    expect(new Set(nombres).size).toBe(nombres.length);
  });
  it('cada verbo trae descripción, y su esquema es un objeto sin la cabecera $schema', () => {
    for (const d of definicionesDeLaSuperficie()) {
      expect(d.description.length).toBeGreaterThan(20);
      expect(d.input_schema.type).toBe('object');
      expect(d.input_schema).not.toHaveProperty('$schema');
    }
  });
});
