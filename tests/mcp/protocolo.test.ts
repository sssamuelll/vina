import { describe, it, expect, vi } from 'vitest';
import { crearProtocolo, VERSIONES } from '../../mcp/src/protocolo.mjs';

/** El MCP de vina-mcp (spec 2026-10-09, P2 y P11), sin red: un pedido entra por línea y sale por `enviar`. */
type Msg = Record<string, unknown> & { id?: unknown; result?: Record<string, unknown>; error?: { code: number } };

const SUPERFICIE = {
  instrucciones: 'All lengths are in millimetres.',
  definiciones: [{ name: 'read_pattern', description: 'Read it.', input_schema: { type: 'object', properties: {} } }],
};

function montar(llamar = vi.fn()) {
  const enviados: Msg[] = [];
  const presentarse = vi.fn();
  const p = crearProtocolo({ version: '0.1.0', superficie: () => SUPERFICIE, llamar, presentarse, enviar: (m: Msg) => enviados.push(m) });
  const pedir = async (id: number, method: string, params?: unknown) => {
    await p.recibir(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    return enviados.find(m => m.id === id)!;
  };
  return { p, enviados, pedir, presentarse };
}

describe('initialize', () => {
  it('responde la versión que pide el cliente si la conoce, y presenta al agente', async () => {
    const { pedir, presentarse } = montar();
    const r = await pedir(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1' } });
    expect(r.result).toEqual({
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'vina', version: '0.1.0' },
      instructions: SUPERFICIE.instrucciones,
    });
    expect(presentarse).toHaveBeenCalledWith({ name: 'claude-code', version: '2.1' });
  });

  it('con una versión que no conoce, responde la más nueva que conoce', async () => {
    const { pedir } = montar();
    const r = await pedir(1, 'initialize', { protocolVersion: '1999-01-01', capabilities: {} });
    expect(r.result!.protocolVersion).toBe(VERSIONES[0]);
  });
});

describe('tools', () => {
  it('tools/list da la superficie con inputSchema', async () => {
    const { pedir } = montar();
    const r = await pedir(2, 'tools/list');
    expect(r.result).toEqual({ tools: [{ name: 'read_pattern', description: 'Read it.', inputSchema: { type: 'object', properties: {} } }] });
  });

  it('tools/call: el resultado y la revisión viajan como texto JSON, sin isError', async () => {
    const llamar = vi.fn().mockResolvedValue({ ok: true, result: { done: false, warnings: ['piece is locked'] }, revision: 7 });
    const { pedir } = montar(llamar);
    const r = await pedir(3, 'tools/call', { name: 'sew', arguments: { a: 1 } });
    expect(llamar).toHaveBeenCalledWith('sew', { a: 1 });
    expect(r.result).toEqual({ content: [{ type: 'text', text: JSON.stringify({ result: { done: false, warnings: ['piece is locked'] }, revision: 7 }) }] });
  });

  it('tools/call: una llamada que no corrió (ok: false) vuelve con isError', async () => {
    const llamar = vi.fn().mockResolvedValue({ ok: false, error: 'invalid arguments: name: Required', revision: 7 });
    const { pedir } = montar(llamar);
    const r = await pedir(4, 'tools/call', { name: 'create_piece' });
    expect(llamar).toHaveBeenCalledWith('create_piece', {});
    expect(r.result).toEqual({ content: [{ type: 'text', text: JSON.stringify({ error: 'invalid arguments: name: Required', revision: 7 }) }], isError: true });
  });

  it('tools/call: si el puente no puede llamar, el agente lee el porqué con isError', async () => {
    const llamar = vi.fn().mockRejectedValue(new Error('Vina is not connected.'));
    const { pedir } = montar(llamar);
    const r = await pedir(5, 'tools/call', { name: 'read_pattern', arguments: {} });
    expect(r.result).toEqual({ content: [{ type: 'text', text: 'Vina is not connected.' }], isError: true });
  });

  it('un verbo sin resultado no deja el texto vacío', async () => {
    const llamar = vi.fn().mockResolvedValue({ ok: true, result: undefined, revision: 1 });
    const { pedir } = montar(llamar);
    const r = await pedir(6, 'tools/call', { name: 'x', arguments: {} });
    expect((r.result!.content as Array<{ text: string }>)[0].text).toBe(JSON.stringify({ result: null, revision: 1 }));
  });
});

describe('lo demás', () => {
  it('ping responde vacío', async () => {
    const { pedir } = montar();
    expect((await pedir(7, 'ping')).result).toEqual({});
  });

  it('un método que no existe da -32601; una notificación que no existe, nada', async () => {
    const { p, pedir, enviados } = montar();
    expect((await pedir(8, 'resources/list')).error!.code).toBe(-32601);
    const antes = enviados.length;
    await p.recibir(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 3 } }));
    expect(enviados.length).toBe(antes);
  });

  it('una línea que no es JSON da -32700 con id null; una línea en blanco o con \\r final no rompe nada', async () => {
    const { p, enviados } = montar();
    await p.recibir('{no es json');
    expect(enviados.at(-1)).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    await p.recibir('   \r');
    expect(enviados.length).toBe(1);
    await p.recibir(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' }) + '\r');
    expect(enviados.at(-1)).toEqual({ jsonrpc: '2.0', id: 9, result: {} });
  });

  it('null, un número o un lote dan -32600 con id null, sin tumbar nada', async () => {
    const { p, enviados } = montar();
    await p.recibir('null');
    await p.recibir('7');
    await p.recibir('[{"jsonrpc":"2.0","id":1,"method":"ping"}]');
    const invalido = { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
    expect(enviados).toEqual([invalido, invalido, invalido]);
  });

  it('initialize con params null responde igual', async () => {
    const { p, enviados } = montar();
    await p.recibir(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: null }));
    expect(enviados[0].result!.protocolVersion).toBe(VERSIONES[0]);
  });

  it('un fallo dentro de un pedido responde -32603 con su id', async () => {
    const enviados: Msg[] = [];
    const rota = () => { throw new Error('rota'); };
    const p = crearProtocolo({ version: '0', superficie: rota, llamar: vi.fn(), enviar: (m: Msg) => enviados.push(m) });
    await p.recibir(JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/list' }));
    expect(enviados).toEqual([{ jsonrpc: '2.0', id: 5, error: { code: -32603, message: 'Internal error: rota' } }]);
  });

  it('un ping mandado como notificación no se contesta', async () => {
    const { p, enviados } = montar();
    await p.recibir(JSON.stringify({ jsonrpc: '2.0', method: 'ping' }));
    expect(enviados).toEqual([]);
  });

  it('avisa que la lista cambió solo después de notifications/initialized', async () => {
    const { p, enviados } = montar();
    p.avisarListaCambiada();
    expect(enviados).toEqual([]);
    await p.recibir(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    p.avisarListaCambiada();
    expect(enviados).toEqual([{ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }]);
  });
});
