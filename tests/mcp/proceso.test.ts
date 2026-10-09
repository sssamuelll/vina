import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'node:net';
import WebSocket from 'ws';

/** vina-mcp de punta a punta (spec 2026-10-09, § 4.1): como lo arranca un agente, por stdio. */
type Msg = { id?: number; method?: string; result?: Record<string, unknown> };

const procesos: ChildProcessWithoutNullStreams[] = [];
const sockets: WebSocket[] = [];
afterEach(() => {
  sockets.splice(0).forEach(s => s.terminate());
  procesos.splice(0).forEach(p => p.kill());
});

const puertoLibre = () =>
  new Promise<number>(ok => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });

function arrancar(puerto: number) {
  const proc = spawn(process.execPath, ['mcp/bin/vina-mcp.mjs'], { env: { ...process.env, VINA_MCP_PORT: String(puerto), VINA_MCP_ALLOW_LOCAL: '1' } });
  procesos.push(proc);
  let errores = '';
  proc.stderr.on('data', d => { errores += String(d); });
  const respuestas = new Map<number, (m: Msg) => void>();
  const avisos: Msg[] = [];
  createInterface({ input: proc.stdout }).on('line', l => {
    const m: Msg = JSON.parse(l);
    if (m.id !== undefined) respuestas.get(m.id)?.(m);
    else avisos.push(m);
  });
  let id = 0;
  return {
    proc,
    avisos,
    stderr: () => errores,
    pedir: (method: string, params: unknown = {}) =>
      new Promise<Msg>(ok => {
        const mio = ++id;
        respuestas.set(mio, ok);
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mio, method, params }) + '\n');
      }),
    avisar: (method: string) => proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'),
    escuchando: () =>
      new Promise<void>(ok => {
        const mirar = () => { if (errores.includes('waiting for Vina')) ok(); else setTimeout(mirar, 20); };
        mirar();
      }),
  };
}

async function iniciar(a: ReturnType<typeof arrancar>) {
  const r = await a.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } });
  a.avisar('notifications/initialized');
  // El puente atiende su entrada en orden: la respuesta al ping dice que ya
  // procesó `initialized`. Sin esto, un saludo de la pestaña que llegue antes
  // pierde, con razón, el aviso de lista cambiada.
  await a.pedir('ping');
  return r;
}

// Cada caso lanza procesos de Node: con la suite entera corriendo, arrancar
// tarda más de los 5 s por defecto.
describe('vina-mcp, como lo arranca un agente', { timeout: 20_000 }, () => {
  it('se presenta con las instrucciones y da la superficie horneada antes de que llegue la pestaña', async () => {
    const a = arrancar(await puertoLibre());
    const r = await iniciar(a);
    expect(String(r.result!.instructions)).toContain('millimetres');
    const lista = await a.pedir('tools/list');
    const nombres = (lista.result!.tools as Array<{ name: string }>).map(t => t.name);
    expect(nombres).toContain('read_pattern');
    expect(nombres).toContain('create_piece');
    expect(nombres.length).toBe(12);
  });

  it('una pestaña con otra lista la cambia y avisa; una llamada va y vuelve', async () => {
    const puerto = await puertoLibre();
    const a = arrancar(puerto);
    await iniciar(a);
    await a.escuchando();
    const ws = new WebSocket(`ws://127.0.0.1:${puerto}`, { origin: 'http://localhost:5174' });
    sockets.push(ws);
    await new Promise(ok => ws.once('open', ok));
    ws.on('message', d => {
      const m = JSON.parse(String(d));
      if (m.t === 'llamada') ws.send(JSON.stringify({ t: 'respuesta', id: m.id, respuesta: { ok: true, result: { done: true }, revision: 4 } }));
    });
    ws.send(JSON.stringify({ t: 'hola', v: 1, instrucciones: 'x', definiciones: [{ name: 'solo_este', description: 'd', input_schema: { type: 'object' } }] }));
    await new Promise<void>(ok => { const mirar = () => (a.avisos.length ? ok() : setTimeout(mirar, 20)); mirar(); });
    expect(a.avisos[0].method).toBe('notifications/tools/list_changed');
    const lista = await a.pedir('tools/list');
    expect((lista.result!.tools as Array<{ name: string }>).map(t => t.name)).toEqual(['solo_este']);
    const r = await a.pedir('tools/call', { name: 'solo_este', arguments: {} });
    expect(r.result).toEqual({ content: [{ type: 'text', text: JSON.stringify({ result: { done: true }, revision: 4 }) }] });
  });

  it('un segundo vina-mcp en el mismo puerto sigue vivo y lo dice en cada llamada', async () => {
    const puerto = await puertoLibre();
    const a = arrancar(puerto);
    await a.escuchando();
    const b = arrancar(puerto);
    await iniciar(b);
    const r = await b.pedir('tools/call', { name: 'read_pattern', arguments: {} });
    expect(r.result!.isError).toBe(true);
    expect(JSON.stringify(r.result)).toMatch(/cannot take port \d+: another agent session/);
  });

  it('al cerrarse la entrada, sale con 0 y suelta el puerto (Review Focus 4)', async () => {
    const puerto = await puertoLibre();
    const a = arrancar(puerto);
    await a.escuchando();
    const salida = new Promise<number | null>(ok => a.proc.on('exit', code => ok(code)));
    a.proc.stdin.end();
    expect(await salida).toBe(0);
    const b = arrancar(puerto);
    await b.escuchando();
    expect(b.stderr()).not.toContain('in use');
  });
});
