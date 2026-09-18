// #1194 — los errores de la validación se pintan en inglés y con jerga de JSON
// Schema en el chat de María.
//
// El camino: la guardia de #1189 (`registry.ts`) y la rama zod (`validation.ts`)
// → `AgenticLoop` → `useAgenticLoop` → `UnifiedBarChat.tsx:310`, donde se pinta
// LITERAL, en rojo, rodeada de copy en español.
//
// La traducción va al LEER, no al escribir: `classifyError` (errorRecovery.ts:92-99)
// clasifica por subcadenas en inglés —'missing required', 'validation', 'not found'—
// y el mensaje también se le manda al LLM (`AgenticLoop.ts:560`). Traducir en el
// productor reclasificaría en silencio. Así que el productor sigue en inglés y este
// test compone las DOS piezas: salida real del productor → `mensajeDeErrorEs`.
//
// Lo que sí cambia en el productor es la rama zod, y no por idioma: emitía cuatro
// cláusulas idénticas SIN nombre de campo ('Invalid input: expected string,
// received undefined' ×4). Eso es información perdida, que ninguna traducción
// recupera. Ahora habla el mismo vocabulario canónico que la rama JSON.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ToolRegistry, type ToolDefinition, type ToolResult } from '../registry';
import { mensajeDeErrorEs } from '../mensajeDeErrorEs';
import { CreateSeamSchema } from '../validation';
import type { AppDispatch, RootState } from '../../../../store';

// ─── Sondas: una por rama de `execute()` ────────────────────────────────────

/** Rama JSON: la que cubre 230 de las 232 tools (la guardia de #1189). */
const sondaJson: ToolDefinition = {
  name: 'sondaJson',
  description: 'Sonda de la rama JSON',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Pieza' },
      distance: { type: 'number', description: 'Distancia' },
      joinType: { type: 'string', enum: ['miter', 'round', 'square'], description: 'Unión' },
    },
    required: ['pieceId'],
  },
  execute: async (): Promise<ToolResult> => ({ success: true }),
};

/** Rama zod: la de las 2 tools con `schema` (createSeam, setSeamRange). */
const sondaZod: ToolDefinition = {
  name: 'sondaZod',
  description: 'Sonda de la rama zod',
  parameters: {
    type: 'object',
    properties: {
      pieceAId: { type: 'string', description: 'Pieza A' },
      edgeAName: { type: 'string', description: 'Borde A' },
      pieceBId: { type: 'string', description: 'Pieza B' },
      edgeBName: { type: 'string', description: 'Borde B' },
      seamType: { type: 'string', description: 'Tipo' },
      rangeA: { type: 'array', description: 'Tramo A' },
    },
    required: [],
  },
  schema: CreateSeamSchema,
  execute: async (): Promise<ToolResult> => ({ success: true }),
};

function registro() {
  const registry = new ToolRegistry();
  registry.register(sondaJson);
  registry.register(sondaZod);
  registry.setContext(vi.fn() as unknown as AppDispatch, (() => ({}) as RootState));
  return registry;
}

/** Lo que de verdad llega a la línea 310: el error del productor, traducido. */
async function loQuePinta(tool: string, params: Record<string, unknown>): Promise<string> {
  const res = await registro().execute(tool, params);
  expect(res.success).toBe(false);
  return mensajeDeErrorEs(res.error ?? '');
}

/** Vocabulario que no existe en la UI de Vina. */
const JERGA = ['Parameter', 'Missing', 'must be', 'got ', 'Invalid input', 'expected', 'received'];

function sinJerga(msg: string) {
  for (const palabra of JERGA) expect(msg).not.toContain(palabra);
}

const SEAM_OK = {
  pieceAId: 'p1', edgeAName: 'lado', pieceBId: 'p2', edgeBName: 'lado',
};

describe('#1194 — rama JSON: la guardia de #1189 habla español', () => {
  it('un requerido que falta nombra el dato, sin «Missing required parameter»', async () => {
    const msg = await loQuePinta('sondaJson', {});

    expect(msg).toBe('Falta el dato pieceId');
    sinJerga(msg);
  });

  it('un tipo equivocado dice qué se esperaba y qué llegó', async () => {
    const msg = await loQuePinta('sondaJson', { pieceId: 'p1', distance: 'abc' });

    expect(msg).toBe('El dato distance tiene que ser un número y llegó un texto');
    sinJerga(msg);
  });

  // Las comas de la lista son parte del dato. Un traductor que parta el mensaje
  // por ', ' —el separador con el que `validate()` une los errores— se come las
  // opciones. Por eso traduce por patrón sobre el texto entero, sin partirlo.
  it('un enum inválido conserva la lista de opciones entera', async () => {
    const msg = await loQuePinta('sondaJson', { pieceId: 'p1', joinType: 'chaflán' });

    expect(msg).toBe('El dato joinType tiene que ser uno de: miter, round, square');
  });

  // El caso que de verdad puede romper el traductor: la lista de opciones tiene
  // que parar donde empieza el error siguiente, ni antes ni después.
  it('un enum seguido de otro error no se come la lista ni el vecino', async () => {
    const msg = await loQuePinta('sondaJson', { pieceId: 'p1', joinType: 'chaflán', distance: 'abc' });

    expect(msg).toBe(
      'El dato joinType tiene que ser uno de: miter, round, square, '
      + 'el dato distance tiene que ser un número y llegó un texto',
    );
    sinJerga(msg);
  });

  it('dos errores a la vez salen los dos, en español', async () => {
    const msg = await loQuePinta('sondaJson', { distance: 'abc' });

    expect(msg).toContain('Falta el dato pieceId');
    expect(msg).toContain('distance tiene que ser un número');
    sinJerga(msg);
  });
});

describe('#1194 — rama zod: la peor de las dos', () => {
  // Antes: 'Invalid input: expected string, received undefined' ×4, sin UN nombre
  // de campo. Cuatro cláusulas idénticas no le dicen a nadie qué falta.
  it('sin campos nombra los cuatro datos que faltan', async () => {
    const msg = await loQuePinta('sondaZod', {});

    // Solo la primera cláusula va con mayúscula: las otras tres son la
    // continuación de la misma frase.
    for (const campo of ['pieceAId', 'edgeAName', 'pieceBId', 'edgeBName']) {
      expect(msg).toMatch(new RegExp(`[Ff]alta el dato ${campo}`));
    }
    sinJerga(msg);
  });

  it('un enum inválido de zod dice las opciones', async () => {
    const msg = await loQuePinta('sondaZod', { ...SEAM_OK, seamType: 'zurcido' });

    expect(msg).toBe('El dato seamType tiene que ser uno de: standard, french, flat-felled, overlock');
  });

  // `.min(1, 'pieceAId required')` nunca disparaba en el fallo más común (el de
  // tipo corre antes), y en el que sí —cadena vacía— salía en inglés. Una cadena
  // vacía es un dato que falta, y se lee igual que si no hubiera llegado.
  it('una cadena vacía se lee como dato que falta', async () => {
    const msg = await loQuePinta('sondaZod', { ...SEAM_OK, pieceAId: '' });

    expect(msg).toContain('Falta el dato pieceAId');
    sinJerga(msg);
  });

  it('un tramo al revés lo dice en español', async () => {
    const msg = await loQuePinta('sondaZod', { ...SEAM_OK, rangeA: [80, 20] });

    expect(msg).toContain('tiene que empezar antes de terminar');
    sinJerga(msg);
  });

  it('un porcentaje fuera de rango lo dice en español', async () => {
    const msg = await loQuePinta('sondaZod', { ...SEAM_OK, rangeA: [0, 120] });

    expect(msg).toContain('entre 0 y 100');
    sinJerga(msg);
  });
});

describe('#1194 — lo que no reconoce pasa intacto', () => {
  it('un mensaje que ya está en español no se toca', () => {
    const msg = 'No hay piezas que exportar.';
    expect(mensajeDeErrorEs(msg)).toBe(msg);
  });

  it('una cadena vacía no inventa texto', () => {
    expect(mensajeDeErrorEs('')).toBe('');
  });
});

// La puerta, no el cuarto: que el traductor funcione no prueba que la línea que
// María lee lo llame. Si alguien vuelve a pintar `tc.error` crudo, esto se pone
// rojo — que es lo único que impide que la deriva regrese por donde entró.
describe('#1194 — el sitio donde se pinta usa el traductor', () => {
  it('UnifiedBarChat no pinta tc.error crudo', () => {
    const fuente = readFileSync(
      new URL('../../../../components/shell/UnifiedBarChat.tsx', import.meta.url),
      'utf8',
    );

    // Booleanos y no `toContain`: el diff de un fallo imprimiría el archivo entero.
    expect(fuente.includes('mensajeDeErrorEs(tc.error)')).toBe(true);
    expect(/\{tc\.error\}/.test(fuente)).toBe(false);
  });
});
