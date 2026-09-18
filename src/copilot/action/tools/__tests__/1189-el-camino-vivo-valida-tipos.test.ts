// #1189 — hay DOS validadores escritos y el camino vivo no llama a ninguno.
//
// `ToolRegistry.execute()` ya tiene el gancho `if (tool.schema)` para zod,
// pero ninguna de las 46 definiciones de `definitions/` define `schema`. Y
// `ToolRegistry.validate()` —que sí valida contra el JSON schema que las
// tools declaran de verdad— solo lo llama `toolExecutor.ts`, que no importa
// nadie fuera de tests.
//
// Consecuencia medida: 415 casts `params.x as boolean|number|string` en 28
// archivos leen lo que venga del function-calling sin mirar. Un `"false"`
// string es truthy y entra en la rama destructiva de `offsetPattern`.
//
// La guardia va DENTRO de `execute()`, no en `AgenticLoop`: execute es el
// único paso por el que entran todas las tools y todos sus llamadores.
import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry, getDefaultRegistry, type ToolDefinition, type ToolResult } from '../registry';
import { tools as patternOpsTools } from '../definitions/patternOpsTools';
import type { AppDispatch, RootState } from '../../../../store';
import type { PatternPiece } from '../../../../types/types';

// ─── Sonda: una tool que anota lo que le llega ──────────────────────────────

function toolSonda(recibido: { params?: Record<string, unknown>; corrio: boolean }): ToolDefinition {
  return {
    name: 'toolSonda',
    description: 'Sonda de tipos / type probe',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        distance: { type: 'number', description: 'Distancia' },
        vueltas: { type: 'integer', description: 'Vueltas' },
        replace: { type: 'boolean', description: 'Reemplazar' },
        joinType: { type: 'string', enum: ['miter', 'round', 'square'], description: 'Unión' },
      },
      required: ['pieceId'],
    },
    execute: async (params): Promise<ToolResult> => {
      recibido.params = params;
      recibido.corrio = true;
      return { success: true };
    },
  };
}

function registroConSonda() {
  const recibido: { params?: Record<string, unknown>; corrio: boolean } = { corrio: false };
  const registry = new ToolRegistry();
  registry.register(toolSonda(recibido));
  registry.setContext(vi.fn() as unknown as AppDispatch, (() => ({}) as RootState));
  return { registry, recibido };
}

describe('#1189 — execute() valida y coerciona los tipos del function-calling', () => {
  it('un boolean que llega como "false" NO entra truthy: la tool recibe false', async () => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', { pieceId: 'p1', replace: 'false' });

    expect(res.success).toBe(true);
    expect(recibido.params?.replace).toBe(false);
  });

  it('un boolean que llega como "true" se coerciona a true', async () => {
    const { registry, recibido } = registroConSonda();

    await registry.execute('toolSonda', { pieceId: 'p1', replace: 'true' });

    expect(recibido.params?.replace).toBe(true);
  });

  it('un number que llega como "5" se coerciona — la llamada viva no se rompe', async () => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', { pieceId: 'p1', distance: '5' });

    expect(res.success).toBe(true);
    expect(recibido.params?.distance).toBe(5);
  });

  // La rama `integer` no tenía test de ÉXITO: quitarla del `if` dejaba los 13
  // en verde mientras un `"3"` —la forma más común en que un LLM manda un
  // contador— pasaba a rechazarse. Se probaba el éxito de `number` y el
  // fracaso de `integer`, nunca el éxito de `integer`.
  it('un integer que llega como "2" se coerciona', async () => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', { pieceId: 'p1', vueltas: '2' });

    expect(res.success).toBe(true);
    expect(recibido.params?.vueltas).toBe(2);
  });

  // `Number('')` es 0: sin la guarda de cadena vacía, un "" —lo que un LLM
  // manda por «sin valor»— se coerciona a 0 y la tool corre con él.
  it('una cadena vacía donde va un number se rechaza y la tool NO corre', async () => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', { pieceId: 'p1', distance: '' });

    expect(res.success).toBe(false);
    expect(recibido.corrio).toBe(false);
  });

  // El arreglo de `"false"` no puede romper `"True"`: antes del candado esos
  // cuatro eran truthy y DABAN el resultado correcto. Rechazarlos sería
  // empeorar justo la superficie que este cambio viene a arreglar.
  it.each(['True', 'TRUE', 'true ', ' true'])('un boolean "%s" se coerciona a true', async (v) => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', { pieceId: 'p1', replace: v });

    expect(res.success).toBe(true);
    expect(recibido.params?.replace).toBe(true);
  });

  it.each(['False', 'FALSE', 'false ', ' false'])('un boolean "%s" se coerciona a false', async (v) => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', { pieceId: 'p1', replace: v });

    expect(res.success).toBe(true);
    expect(recibido.params?.replace).toBe(false);
  });

  // CONTROL de la normalización: `"1"` y `"yes"` SÍ son adivinanza y se
  // siguen rechazando. Sin esto, normalizar de más pasaría inadvertido.
  it.each(['1', '0', 'yes', 'sí', 'quizás'])('un boolean "%s" sigue rechazándose (es adivinanza)', async (v) => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', { pieceId: 'p1', replace: v });

    expect(res.success).toBe(false);
    expect(recibido.corrio).toBe(false);
  });

  it('un number incoercible se rechaza y la tool NO corre', async () => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', { pieceId: 'p1', distance: 'abc' });

    expect(res.success).toBe(false);
    expect(recibido.corrio).toBe(false);
  });

  it('un integer con decimales se rechaza y la tool NO corre', async () => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', { pieceId: 'p1', vueltas: '2.5' });

    expect(res.success).toBe(false);
    expect(recibido.corrio).toBe(false);
  });

  it('un boolean que no es ni "true" ni "false" se rechaza y la tool NO corre', async () => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', { pieceId: 'p1', replace: 'quizás' });

    expect(res.success).toBe(false);
    expect(recibido.corrio).toBe(false);
  });

  it('falta un required: se rechaza y la tool NO corre', async () => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', { distance: 10 });

    expect(res.success).toBe(false);
    expect(recibido.corrio).toBe(false);
  });

  it('un enum fuera de la lista se rechaza y la tool NO corre', async () => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', { pieceId: 'p1', joinType: 'bisel' });

    expect(res.success).toBe(false);
    expect(recibido.corrio).toBe(false);
  });

  // CONTROL — sin él, un validador que rechazara TODO también pasaría los
  // siete de arriba (un detector sin su control es una opinión).
  it('CONTROL: parámetros bien tipados pasan intactos y la tool corre', async () => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', {
      pieceId: 'p1', distance: 10, vueltas: 2, replace: true, joinType: 'round',
    });

    expect(res.success).toBe(true);
    expect(recibido.params).toEqual({
      pieceId: 'p1', distance: 10, vueltas: 2, replace: true, joinType: 'round',
    });
  });

  // CONTROL 2 — los extras que el LLM inventa se siguen dejando pasar, como
  // hoy («Extra params are allowed», registry.ts:250). Si la guardia los
  // empezara a rechazar, rompería llamadas que hoy funcionan.
  it('CONTROL: un parámetro extra no declarado no rompe la llamada', async () => {
    const { registry, recibido } = registroConSonda();

    const res = await registry.execute('toolSonda', { pieceId: 'p1', inventado: 'x' });

    expect(res.success).toBe(true);
    expect(recibido.params?.inventado).toBe('x');
  });
});

// ─── El caso real del issue, sobre la tool de verdad ────────────────────────

const outline: PatternPiece['outline'] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
];

function estadoConPieza(): RootState {
  const piece = {
    id: 'p1', name: 'p1', outline, internals: [], position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, seamAllowance: 10, createdAt: 0, updatedAt: 0,
  } as unknown as PatternPiece;
  return { project: { id: 't', name: 't', pieces: [piece], seams: [], fabrics: [], layerLocked: {} } } as unknown as RootState;
}

describe('#1189 — offsetPattern por el camino vivo', () => {
  it('replace:"false" no sobrescribe el contorno de la original', async () => {
    const registry = new ToolRegistry();
    registry.registerAll(patternOpsTools);
    const dispatch = vi.fn();
    registry.setContext(dispatch as unknown as AppDispatch, estadoConPieza);

    const res = await registry.execute('offsetPattern', { pieceId: 'p1', distance: 10, replace: 'false' });

    const tipos = dispatch.mock.calls.map(([a]) => (a as { type: string }).type);
    expect(tipos).not.toContain('project/updatePiece');
    // La negación de arriba pasa igual si la tool se cae ANTES de despachar
    // nada (pieza no encontrada, offset colapsado): sola no prueba que el
    // camino llegó adonde dice. Esta afirma en positivo.
    expect(tipos).toContain('project/addPiece');
    expect(res.data?.replaced).toBe(false);
  });
});

// ─── El invariante: toda tool registrada sobrevive la guardia ───────────────
//
// `validate()` estaba muerto, así que dos formas nunca se ejercitaron y ahora
// corren sobre las 232 tools registradas:
//   · `parameters` sin `properties` → `schema.properties[key]` lanza TypeError
//     en CADA llamada (el `?.` protege la propiedad, no el objeto).
//   · una propiedad sin `type` → `undefined !== 'string'` rechaza esa tool
//     para siempre, en silencio y con el mensaje «must be undefined».
// Hoy son 0 y 0. Este test es para la tool de mañana, no para las de hoy.

describe('#1189 — invariante del registro frente a la guardia', () => {
  it('toda tool registrada declara properties y cada propiedad declara type', () => {
    for (const tool of getDefaultRegistry().list()) {
      expect(tool.parameters?.properties, `${tool.name}: parameters.properties`).toBeTypeOf('object');
      for (const [prop, esquema] of Object.entries(tool.parameters.properties)) {
        expect(typeof esquema?.type, `${tool.name}.${prop}: type`).toBe('string');
      }
    }
  });
});

// ─── Los schemas que mentían por el lado estricto ───────────────────────────
//
// Encender la guardia hace CUMPLIR el schema, así que un schema más estricto
// que su propio cuerpo pasa de inexactitud inofensiva a rechazo. Tres casos
// declaran `required` algo que el cuerpo rellena solo, y uno declara
// `integer` donde acepta decimales. Se corrigen los schemas, no la guardia:
// el cuerpo ya decía la verdad.

describe('#1189 — un schema estricto de más no puede apagar una llamada viva', () => {
  function registroReal() {
    const registry = getDefaultRegistry();
    registry.setContext(vi.fn() as unknown as AppDispatch, estadoConPieza);
    return registry;
  }

  it.each([
    { tool: 'createPiece', params: { outline }, ausente: 'name' },
    { tool: 'slashAndSpread', params: { pieceId: 'p1', fromEdge: 'a', toEdge: 'b', spreadAmount: 10 }, ausente: 'selectedHalf' },
    { tool: 'detectFormulaChanges', params: { formulas: [] }, ausente: 'skillId' },
    { tool: 'detectFormulaChanges', params: { formulas: [] }, ausente: 'pieceId' },
  ])('$tool corre sin $ausente (el cuerpo lo rellena)', async ({ tool, params, ausente }) => {
    const res = await registroReal().execute(tool, params);

    // El sujeto es MI guardia, no la geometría de la tool: la llamada puede
    // fallar por sus propias razones, pero nunca por el parámetro que su
    // cuerpo ya sabe rellenar.
    expect(res.error ?? '').not.toContain(`Missing required parameter: "${ausente}"`);
  });

  it('runNesting acepta un rotationStep decimal (22,5° es una granularidad legítima)', async () => {
    const res = await registroReal().execute('runNesting', { rotationStep: 22.5 });

    expect(res.error ?? '').not.toContain('must be an integer');
  });
});
