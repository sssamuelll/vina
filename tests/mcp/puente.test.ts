import { describe, it, expect, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import { crearPuente, origenPermitido, CIERRE_REEMPLAZADA } from '../../mcp/src/puente.mjs';

/** El puente de vina-mcp (spec 2026-10-09, P3-P9): un WebSocket en 127.0.0.1 al que se conecta la pestaña. */
type Puente = ReturnType<typeof crearPuente>;
type Recibido = { t: string; id?: number; verbo?: string; args?: unknown; nombre?: string; version?: string };

const abiertos: Puente[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  sockets.splice(0).forEach(s => s.terminate());
  await Promise.all(abiertos.splice(0).map(p => p.cerrar()));
});

async function puente(op: Record<string, unknown> = {}) {
  const p = crearPuente({ puerto: 0, ...op });
  abiertos.push(p);
  await p.escuchar();
  return p;
}

/** Una pestaña de mentira: saluda con su lista y contesta lo que le pidan. */
function pestana(p: Puente, origin = 'http://localhost:5174') {
  const ws = new WebSocket(`ws://127.0.0.1:${p.puertoReal()}`, { origin });
  sockets.push(ws);
  const recibidos: Recibido[] = [];
  const cierres: number[] = [];
  ws.on('message', d => recibidos.push(JSON.parse(String(d))));
  ws.on('close', code => cierres.push(code));
  const abierta = new Promise<void>((ok, mal) => { ws.once('open', () => ok()); ws.once('error', mal); });
  const decir = (m: unknown) => ws.send(JSON.stringify(m));
  return { ws, recibidos, cierres, abierta, decir };
}

const LISTA = { instrucciones: 'mm', definiciones: [{ name: 'read_pattern', description: 'd', input_schema: { type: 'object' } }] };

describe('origenPermitido', () => {
  it('Vina en producción y en esta máquina sí; lo demás no', () => {
    expect(origenPermitido('https://vina.sdar.dev')).toBe(true);
    expect(origenPermitido('http://localhost:5174')).toBe(true);
    expect(origenPermitido('http://127.0.0.1')).toBe(true);
    expect(origenPermitido('https://otra.web')).toBe(false);
    expect(origenPermitido('http://localhost.otra.web')).toBe(false);
    expect(origenPermitido('http://vina.sdar.dev')).toBe(false);
    expect(origenPermitido(undefined)).toBe(false);
  });

  it('una web ajena no entra como pestaña', async () => {
    const p = await puente();
    await expect(pestana(p, 'https://otra.web').abierta).rejects.toThrow(/403/);
    expect(p.estado()).toBe('escuchando');
  });
});

describe('una llamada', () => {
  it('va a la pestaña y vuelve con su respuesta', async () => {
    const p = await puente();
    const t = pestana(p);
    await t.abierta;
    t.decir({ t: 'hola', v: 1, ...LISTA });
    t.ws.on('message', d => {
      const m = JSON.parse(String(d));
      if (m.t === 'llamada') t.decir({ t: 'respuesta', id: m.id, respuesta: { ok: true, result: { verbo: m.verbo, args: m.args }, revision: 3 } });
    });
    await vi.waitFor(() => expect(p.estado()).toBe('conectado'));
    await expect(p.llamar('read_pattern', { a: 1 })).resolves.toEqual({ ok: true, result: { verbo: 'read_pattern', args: { a: 1 } }, revision: 3 });
  });

  it('sin pestaña, espera a que llegue (Review Focus 1)', async () => {
    const p = await puente({ esperaMs: 3000 });
    const llamada = p.llamar('read_pattern', {});
    const t = pestana(p);
    t.ws.on('message', d => {
      const m = JSON.parse(String(d));
      if (m.t === 'llamada') t.decir({ t: 'respuesta', id: m.id, respuesta: { ok: true, result: 'ok', revision: 1 } });
    });
    await expect(llamada).resolves.toEqual({ ok: true, result: 'ok', revision: 1 });
  });

  it('sin pestaña, pasado el plazo, dice qué hacer', async () => {
    const p = await puente({ esperaMs: 50 });
    await expect(p.llamar('read_pattern', {})).rejects.toThrow(/Vina is not connected.*«Conectar»/);
  });

  it('si la pestaña no contesta a tiempo, falla con el verbo', async () => {
    const p = await puente({ plazoMs: 50 });
    const t = pestana(p);
    await t.abierta;
    await expect(p.llamar('sew', {})).rejects.toThrow(/did not answer sew/);
  });

  it('la pestaña se va a mitad: falla al momento (Review Focus 3)', async () => {
    const p = await puente();
    const t = pestana(p);
    await t.abierta;
    const llamada = p.llamar('create_piece', {});
    await vi.waitFor(() => expect(t.recibidos.some(m => m.t === 'llamada')).toBe(true));
    t.ws.close();
    await expect(llamada).rejects.toThrow(/disconnected while running create_piece/);
  });
});

describe('la pestaña', () => {
  it('gana la última: la anterior se cierra con 4001 y su llamada pendiente falla (Review Focus 5)', async () => {
    const p = await puente();
    const vieja = pestana(p);
    await vieja.abierta;
    const llamada = p.llamar('sew', {});
    await vi.waitFor(() => expect(vieja.recibidos.some(m => m.t === 'llamada')).toBe(true));
    // La expectativa va antes de abrir la nueva: la llamada se rechaza en cuanto llega.
    const falla = expect(llamada).rejects.toThrow(/another Vina tab took over/);
    const nueva = pestana(p);
    await nueva.abierta;
    await falla;
    await vi.waitFor(() => expect(vieja.cierres).toEqual([CIERRE_REEMPLAZADA]));
    expect(p.estado()).toBe('conectado');
  });

  it('su lista distinta de la horneada avisa una vez; la misma, no', async () => {
    const alCambiar = vi.fn();
    const p = await puente({ superficie: LISTA, alCambiarSuperficie: alCambiar });
    const t = pestana(p);
    await t.abierta;
    t.decir({ t: 'hola', v: 1, ...LISTA });
    const otra = { instrucciones: 'mm', definiciones: [...LISTA.definiciones, { name: 'dart', description: 'd', input_schema: { type: 'object' } }] };
    t.decir({ t: 'hola', v: 1, ...otra });
    t.decir({ t: 'hola', v: 1, ...otra });
    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalledTimes(1));
    expect(alCambiar).toHaveBeenCalledWith(otra);
  });

  it('se entera de quién es el agente, aunque se haya presentado antes de que ella llegara', async () => {
    const p = await puente();
    p.presentarAgente({ name: 'claude-code', version: '2.1' });
    const t = pestana(p);
    await t.abierta;
    t.decir({ t: 'hola', v: 1, ...LISTA });
    await vi.waitFor(() => expect(t.recibidos).toContainEqual({ t: 'agente', nombre: 'claude-code', version: '2.1' }));
  });
});

describe('un puerto, un puente', () => {
  it('el segundo puente espera, lo dice en cada llamada, y toma el puerto cuando se libera', async () => {
    const a = await puente();
    const b = crearPuente({ puerto: a.puertoReal()!, reintentoMs: 50, esperaMs: 50 });
    abiertos.push(b);
    expect(await b.escuchar()).toBe('ocupado');
    await expect(b.llamar('read_pattern', {})).rejects.toThrow(/Another agent session is connected to Vina/);
    await a.cerrar();
    await vi.waitFor(() => expect(b.estado()).toBe('escuchando'), { timeout: 3000 });
  });
});
