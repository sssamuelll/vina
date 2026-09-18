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
import { ToolRegistry, type ToolDefinition, type ToolResult } from '../registry';
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
    expect(res.data?.replaced).toBe(false);
  });
});
