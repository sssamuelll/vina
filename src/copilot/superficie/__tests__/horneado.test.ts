import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { definicionesDeLaSuperficie } from '../index';
import { INSTRUCCIONES } from '../instrucciones';

/**
 * `vina-mcp` lleva la superficie horneada para responder `tools/list` antes de
 * que llegue la pestaña (spec 2026-10-09, P7). Tiene que ser la de hoy:
 * `MCP_SUPERFICIE_UPDATE=1` la regenera, como las líneas base del repo.
 */
const RUTA = resolve(process.cwd(), 'mcp/superficie.json');
const hoy = () =>
  JSON.stringify({ instrucciones: INSTRUCCIONES, definiciones: definicionesDeLaSuperficie() }, null, 2) + '\n';

describe('la superficie horneada en vina-mcp', () => {
  it('es la de hoy (MCP_SUPERFICIE_UPDATE=1 la regenera)', () => {
    if (process.env.MCP_SUPERFICIE_UPDATE) writeFileSync(RUTA, hoy());
    expect(existsSync(RUTA), 'falta mcp/superficie.json').toBe(true);
    expect(readFileSync(RUTA, 'utf8').replace(/\r\n/g, '\n')).toBe(hoy());
  });

  it('cada verbo tiene un objeto en la raíz de su esquema, como pide MCP', () => {
    for (const d of definicionesDeLaSuperficie()) expect(d.input_schema.type, d.name).toBe('object');
  });

  it('las instrucciones dicen lo que el agente necesita, en inglés', () => {
    const t = INSTRUCCIONES.toLowerCase();
    for (const clave of ['millimetres', 'receipt', 'done: false', 'undo', 'revision', 'locked']) expect(t).toContain(clave);
    // El glosario trae las palabras de María tal cual («patrón»); el resto va en inglés (D8).
    const prosa = INSTRUCCIONES.split('\n').filter(l => !l.startsWith('The user works in Spanish'));
    expect(prosa.join('\n')).not.toMatch(/[áéíóúñ¿¡]/);
  });
});
