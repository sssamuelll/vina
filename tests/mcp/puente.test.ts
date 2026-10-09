import { describe, it, expect, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import { crearPuente, origenPermitido, CIERRE_REEMPLAZADA } from '../../mcp/src/puente.mjs';

/** El puente de vina-mcp (spec 2026-10-09, P3-P9): un WebSocket en 127.0.0.1 al que se conecta la pestaña. */
type Puente = ReturnType<typeof crearPuente>;
type Recibido = { t: string; id?: number; verbo?: string; args?: unknown; nombre?: string; version?: string; hasta?: number };

const abiertos: Puente[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  sockets.splice(0).forEach(s => s.terminate());
  await Promise.all(abiertos.splice(0).map(p => p.cerrar()));
});

/** Las pestañas de prueba entran desde localhost: los orígenes locales se piden (VINA_MCP_ALLOW_LOCAL). */
async function puente(op: Record<string, unknown> = {}) {
  const p = crearPuente({ puerto: 0, permitirLocal: true, ...op });
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
  it('por defecto solo Vina en producción; los orígenes locales, solo si se piden', () => {
    expect(origenPermitido('https://vina.sdar.dev', false)).toBe(true);
    expect(origenPermitido('http://localhost:5174', false)).toBe(false);
    expect(origenPermitido('http://localhost:5174', true)).toBe(true);
    expect(origenPermitido('http://127.0.0.1', true)).toBe(true);
    expect(origenPermitido('https://otra.web', true)).toBe(false);
    expect(origenPermitido('http://localhost.otra.web', true)).toBe(false);
    expect(origenPermitido('http://vina.sdar.dev', true)).toBe(false);
    expect(origenPermitido(undefined, true)).toBe(false);
  });

  it('una web ajena no entra como pestaña', async () => {
    const p = await puente();
    await expect(pestana(p, 'https://otra.web').abierta).rejects.toThrow(/403/);
    expect(p.estado()).toBe('escuchando');
  });

  it('sin los orígenes locales, una Vina local no entra, y queda dicho por qué', async () => {
    const registrar = vi.fn();
    const p = await puente({ permitirLocal: false, registrar });
    await expect(pestana(p).abierta).rejects.toThrow(/403/);
    expect(registrar).toHaveBeenCalledWith(expect.stringMatching(/rejected .*http:\/\/localhost:5174.*VINA_MCP_ALLOW_LOCAL/));
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

  it('si la pestaña no contesta a tiempo, falla con el verbo y avisa que pudo aplicarse', async () => {
    const p = await puente({ plazoMs: 50 });
    const t = pestana(p);
    await t.abierta;
    await expect(p.llamar('sew', {})).rejects.toThrow(/did not answer sew.*may have been applied.*read_pattern/);
  });

  it('cada llamada lleva su plazo, para que la pestaña no corra una vencida (revisión I1)', async () => {
    const p = await puente({ plazoMs: 5000 });
    const t = pestana(p);
    await t.abierta;
    const antes = Date.now();
    const llamada = p.llamar('sew', {}).catch(() => {});
    await vi.waitFor(() => expect(t.recibidos.some(m => m.t === 'llamada')).toBe(true));
    const { hasta } = t.recibidos.find(m => m.t === 'llamada')!;
    expect(hasta).toBeGreaterThanOrEqual(antes + 5000);
    expect(hasta).toBeLessThanOrEqual(Date.now() + 5000);
    await p.cerrar();
    await llamada;
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
    const falla = expect(llamada).rejects.toThrow(/another Vina tab took over.*may have been applied/);
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

  it('un saludo de otra versión o sin lista no cambia la superficie ni tumba el puente (revisión I3)', async () => {
    const alCambiar = vi.fn();
    const registrar = vi.fn();
    const p = await puente({ superficie: LISTA, alCambiarSuperficie: alCambiar, registrar });
    const t = pestana(p);
    await t.abierta;
    t.ws.on('message', d => {
      const m = JSON.parse(String(d));
      if (m.t === 'llamada') t.decir({ t: 'respuesta', id: m.id, respuesta: { ok: true, result: 1, revision: 1 } });
    });
    t.decir({ t: 'hola', v: 2, instrucciones: 'x' });
    t.decir({ t: 'hola', v: 1, instrucciones: 'x', definiciones: 'no' });
    t.decir(null);
    t.decir(7);
    await expect(p.llamar('read_pattern', {})).resolves.toMatchObject({ ok: true });
    expect(alCambiar).not.toHaveBeenCalled();
    expect(registrar).toHaveBeenCalledWith(expect.stringMatching(/protocol v2.*update vina-studio/));
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
    await expect(b.llamar('read_pattern', {})).rejects.toThrow(/cannot take port \d+: another agent session/);
    await a.cerrar();
    await vi.waitFor(() => expect(b.estado()).toBe('escuchando'), { timeout: 3000 });
  });

  it('si no puede escuchar por otra razón, sigue vivo y lo dice: puerto inválido (revisión I2)', async () => {
    const p = crearPuente({ puerto: 70000 });
    abiertos.push(p);
    expect(await p.escuchar()).toBe('fallo');
    expect(p.estado()).toBe('fallo');
    await expect(p.llamar('read_pattern', {})).rejects.toThrow(/cannot listen on 127\.0\.0\.1:70000/);
  });

  it('lo mismo si el error llega después: una dirección que no existe (revisión I2)', async () => {
    const p = crearPuente({ puerto: 0, host: '256.0.0.1' });
    abiertos.push(p);
    expect(await p.escuchar()).toBe('fallo');
    await expect(p.llamar('read_pattern', {})).rejects.toThrow(/cannot listen on 256\.0\.0\.1/);
  });
});
