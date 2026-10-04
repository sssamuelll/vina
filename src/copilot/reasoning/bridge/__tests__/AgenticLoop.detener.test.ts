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

  it('detener no se arrastra al turno siguiente', async () => {
    const { loop } = montar(async () => ({ content: 'hecho', toolCalls: [] }));
    loop.detener();
    expect(await loop.run('otra cosa', () => {})).toBe('hecho');
  });
});
