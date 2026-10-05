import { describe, it, expect, vi } from 'vitest';
import { AgenticLoop, RESPUESTA_DETENIDA } from '../AgenticLoop';
import type { ProviderResponse } from '../../../providers/types';
import type { ToolRegistry, ToolResult } from '../../../action/tools/registry';

/**
 * «Detener» (spec 2026-10-02 § 6.2): María lo pulsa y el agente no hace nada
 * más. Es cooperativo: el loop lo mira al volver cada respuesta y antes de cada
 * herramienta. Lo que ya hizo se queda.
 */
function montar(send: () => Promise<ProviderResponse>, alEjecutar: (nombre: string) => void = () => {}) {
  const registry = {
    execute: vi.fn(async (nombre: string): Promise<ToolResult> => { alEjecutar(nombre); return { success: true, data: {} }; }),
    get: vi.fn((nombre: string) => ({ name: nombre })),
  };
  const loop = new AgenticLoop({
    send: vi.fn(send),
    metaTools: [],
    actionToolDefs: [
      { name: 'primera', description: 'una', parameters: { type: 'object', properties: {} } },
      { name: 'segunda', description: 'otra', parameters: { type: 'object', properties: {} } },
    ],
    getState: () => ({}) as never,
    dispatch: vi.fn(),
    registry: registry as unknown as ToolRegistry,
  });
  return { loop, registry };
}

describe('AgenticLoop.detener', () => {
  it('entre dos herramientas: la segunda no corre y la respuesta lo dice', async () => {
    let vuelta = 0;
    const { loop, registry } = montar(async () => {
      vuelta += 1;
      return vuelta === 1
        ? { content: '', toolCalls: [{ id: 't1', name: 'primera', arguments: '{}' }, { id: 't2', name: 'segunda', arguments: '{}' }] }
        : { content: 'listo', toolCalls: [] };
    }, (nombre) => { if (nombre === 'primera') loop.detener(); });
    const respuesta = await loop.run('acorta el escote', () => {});
    expect(registry.execute.mock.calls.map((c) => c[0])).toEqual(['primera']);
    expect(respuesta).toBe(RESPUESTA_DETENIDA);
  });

  it('con la respuesta en camino: al llegar no se ejecuta nada', async () => {
    let soltar!: (r: ProviderResponse) => void;
    const { loop, registry } = montar(() => new Promise<ProviderResponse>((r) => { soltar = r; }));
    const corriendo = loop.run('acorta el escote', () => {});
    await vi.waitFor(() => expect(soltar).toBeTypeOf('function'));
    loop.detener();
    soltar({ content: '', toolCalls: [{ id: 't1', name: 'primera', arguments: '{}' }] });
    expect(await corriendo).toBe(RESPUESTA_DETENIDA);
    expect(registry.execute).not.toHaveBeenCalled();
  });

  it('la historia guarda el turno detenido: el pedido, un resultado por cada herramienta y «Detenida»', async () => {
    // María pide, para y dice «sigue»: el modelo tiene que saber qué pidió y
    // qué alcanzó a hacer, o vuelve a aplicarlo.
    let vuelta = 0;
    const { loop } = montar(async () => {
      vuelta += 1;
      return vuelta === 1
        ? { content: '', toolCalls: [{ id: 't1', name: 'primera', arguments: '{}' }, { id: 't2', name: 'segunda', arguments: '{}' }] }
        : { content: 'listo', toolCalls: [] };
    }, (nombre) => { if (nombre === 'primera') loop.detener(); });
    await loop.run('acorta el escote', () => {});
    const historia = loop.getConversationHistory();
    expect(historia[0]).toMatchObject({ role: 'user', content: 'acorta el escote' });
    expect(historia.at(-1)).toMatchObject({ role: 'assistant', content: RESPUESTA_DETENIDA });
    // Cada herramienta pedida tiene su resultado: sin él, el proveedor rechaza la historia.
    expect(historia.flatMap((m) => m.tool_calls ?? []).map((tc) => tc.id)).toEqual(['t1', 't2']);
    expect(historia.filter((m) => m.role === 'tool').map((m) => m.tool_call_id)).toEqual(['t1', 't2']);
    const segunda = historia.find((m) => m.tool_call_id === 't2');
    expect(JSON.parse(String(segunda?.content))).toMatchObject({ success: false });
  });

  it('detenida con la respuesta en camino: la historia guarda el pedido y «Detenida», sin la respuesta', async () => {
    let soltar!: (r: ProviderResponse) => void;
    const { loop } = montar(() => new Promise<ProviderResponse>((r) => { soltar = r; }));
    const corriendo = loop.run('acorta el escote', () => {});
    await vi.waitFor(() => expect(soltar).toBeTypeOf('function'));
    loop.detener();
    soltar({ content: '', toolCalls: [{ id: 't1', name: 'primera', arguments: '{}' }] });
    await corriendo;
    expect(loop.getConversationHistory().map((m) => [m.role, m.content])).toEqual([
      ['user', 'acorta el escote'],
      ['assistant', RESPUESTA_DETENIDA],
    ]);
  });

  it('detener no se arrastra al turno siguiente', async () => {
    const { loop } = montar(async () => ({ content: 'hecho', toolCalls: [] }));
    loop.detener();
    expect(await loop.run('otra cosa', () => {})).toBe('hecho');
  });
});
