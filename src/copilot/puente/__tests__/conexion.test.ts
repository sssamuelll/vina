import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { crearConexion, nombreDelAgente, CIERRE_REEMPLAZADA, type PermisoDelNavegador } from '../conexion';
import { cambiarPuente, type EstadoDelPuente } from '../../../store/puenteSlice';
import { tienda } from '../../superficie/__tests__/fixtures';
import { INSTRUCCIONES } from '../../superficie/instrucciones';
import { SUPERFICIE } from '../../superficie';
import { getJournal, clearJournal } from '../../../utils/telemetry/journal';
import { undo } from '../../../store/editorSlice';
import { z } from 'zod';
import { definirVerbo, type Verbo } from '../../superficie/tipos';

/** La pestaña ante el puente (spec 2026-10-09, § 4.2), con un WebSocket de mentira y la tienda de verdad. */
class SocketFalso {
  static OPEN = 1;
  static todos: SocketFalso[] = [];
  readyState = 0;
  enviados: Array<Record<string, unknown>> = [];
  cerradoCon: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(public url: string) { SocketFalso.todos.push(this); }
  send(d: string) { this.enviados.push(JSON.parse(d)); }
  close(code = 1000) { this.cerradoCon = code; this.readyState = 3; this.onclose?.({ code }); }
  abrir() { this.readyState = 1; this.onopen?.(); }
  recibir(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
  caer(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}

function montar(permiso: PermisoDelNavegador = 'granted', verbos?: readonly Verbo[], Impl: unknown = SocketFalso) {
  const { store, ctx } = tienda();
  const estados: Array<{ estado: EstadoDelPuente; agente: string | null }> = [];
  const dispatch = ((a: { type: string; payload?: { estado: EstadoDelPuente; agente?: string | null } }) => {
    if (a.type === cambiarPuente.type) estados.push({ estado: a.payload!.estado, agente: a.payload!.agente ?? null });
    return ctx.dispatch(a as never);
  }) as typeof ctx.dispatch;
  const conexion = crearConexion({
    WebSocketImpl: Impl as typeof WebSocket,
    getState: ctx.getState,
    dispatch,
    puerto: () => 18462,
    permiso: async () => permiso,
    reintentoMs: 3000,
    verbos,
  });
  const ultimo = () => estados.at(-1);
  const socket = () => SocketFalso.todos.at(-1)!;
  return { store, conexion, estados, ultimo, socket };
}

const tick = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { SocketFalso.todos = []; clearJournal(); });
afterEach(() => { vi.useRealTimers(); });

describe('conectar', () => {
  it('busca el puente, saluda con la superficie y queda conectado', async () => {
    const { conexion, ultimo, socket } = montar();
    conexion.conectar();
    expect(ultimo()).toEqual({ estado: 'buscando', agente: null });
    await tick();
    expect(socket().url).toBe('ws://127.0.0.1:18462');
    socket().abrir();
    const hola = socket().enviados[0];
    expect(hola).toMatchObject({ t: 'hola', v: 1, instrucciones: INSTRUCCIONES });
    expect((hola.definiciones as Array<{ name: string }>).map(d => d.name)).toEqual(SUPERFICIE.map(v => v.name));
    expect(ultimo()).toEqual({ estado: 'conectado', agente: null });
  });

  it('se entera del nombre del agente', async () => {
    const { conexion, ultimo, socket } = montar();
    conexion.conectar();
    await tick();
    socket().abrir();
    socket().recibir({ t: 'agente', nombre: 'claude-code', version: '2.1' });
    expect(ultimo()).toEqual({ estado: 'conectado', agente: 'Claude Code' });
  });

  it('si el navegador no deja ni crear la conexión, queda bloqueado y no espera para siempre', async () => {
    class SocketQueLanza {
      static OPEN = 1;
      constructor() { throw new DOMException('insecure', 'SecurityError'); }
    }
    const { conexion, ultimo } = montar('desconocido', undefined, SocketQueLanza);
    conexion.conectar();
    await tick();
    expect(ultimo()).toEqual({ estado: 'bloqueado', agente: null });
  });

  it('con el permiso negado no abre nada: queda bloqueado', async () => {
    const { conexion, ultimo } = montar('denied');
    conexion.conectar();
    await tick();
    expect(SocketFalso.todos).toEqual([]);
    expect(ultimo()).toEqual({ estado: 'bloqueado', agente: null });
  });

  it('cada cambio de estado deja una entrada en la caja negra, sin repetir', async () => {
    const { conexion, socket } = montar();
    conexion.conectar();
    await tick();
    socket().abrir();
    socket().recibir({ t: 'agente', nombre: 'claude-code' });
    socket().recibir({ t: 'agente', nombre: 'claude-code' });
    const puente = getJournal().events.filter(e => e.kind === 'puente');
    expect(puente.map(e => [e.name, e.data?.agente])).toEqual([['buscando', undefined], ['conectado', undefined], ['conectado', 'Claude Code']]);
  });
});

describe('las llamadas', () => {
  it('una llamada corre el verbo con origen mcp, cambia el patrón y responde con su id', async () => {
    const { store, conexion, socket } = montar();
    conexion.conectar();
    await tick();
    socket().abrir();
    socket().recibir({ t: 'llamada', id: 7, verbo: 'create_piece', args: { name: 'Del agente', rectangle: { width: 100, height: 50 } } });
    await vi.waitFor(() => expect(socket().enviados.some(m => m.t === 'respuesta')).toBe(true));
    const r = socket().enviados.find(m => m.t === 'respuesta')!;
    expect(r.id).toBe(7);
    expect(r.respuesta).toMatchObject({ ok: true, result: { done: true } });
    expect(store.getState().project.pieces.map(p => p.name)).toEqual(['Del agente']);
    const entrada = getJournal().events.find(e => e.kind === 'agente' && e.name === 'create_piece');
    expect(entrada?.data?.origen).toBe('mcp');
  });

  it('dos llamadas seguidas corren una tras otra, cada una con su paso de deshacer (Review Focus 2)', async () => {
    const { store, conexion, socket } = montar();
    conexion.conectar();
    await tick();
    socket().abrir();
    socket().recibir({ t: 'llamada', id: 1, verbo: 'create_piece', args: { rectangle: { width: 100, height: 50 } } });
    socket().recibir({ t: 'llamada', id: 2, verbo: 'create_piece', args: { rectangle: { width: 80, height: 40 } } });
    await vi.waitFor(() => expect(socket().enviados.filter(m => m.t === 'respuesta').length).toBe(2));
    expect(socket().enviados.filter(m => m.t === 'respuesta').map(m => m.id)).toEqual([1, 2]);
    expect(store.getState().project.pieces.length).toBe(2);
    store.dispatch(undo());
    expect(store.getState().project.pieces.length).toBe(1);
  });

  it('una llamada lenta no deja pasar a la siguiente: van en el orden en que llegaron', async () => {
    const orden: string[] = [];
    let soltar = () => {};
    const lento = definirVerbo({
      name: 'lento', description: 'd', args: z.object({}),
      run: async () => {
        orden.push('lento empieza');
        await new Promise<void>(r => { soltar = r; });
        orden.push('lento termina');
        return 'l';
      },
    });
    const rapido = definirVerbo({ name: 'rapido', description: 'd', args: z.object({}), run: () => { orden.push('rapido'); return 'r'; } });
    const { conexion, socket } = montar('granted', [lento, rapido]);
    conexion.conectar();
    await tick();
    socket().abrir();
    socket().recibir({ t: 'llamada', id: 1, verbo: 'lento', args: {} });
    socket().recibir({ t: 'llamada', id: 2, verbo: 'rapido', args: {} });
    await vi.waitFor(() => expect(orden).toEqual(['lento empieza']));
    soltar();
    await vi.waitFor(() => expect(socket().enviados.filter(m => m.t === 'respuesta').length).toBe(2));
    expect(orden).toEqual(['lento empieza', 'lento termina', 'rapido']);
  });

  it('una llamada que llega vencida no corre: responde que no se cambió nada (revisión I1)', async () => {
    const { store, conexion, socket } = montar();
    conexion.conectar();
    await tick();
    socket().abrir();
    socket().recibir({ t: 'llamada', id: 4, verbo: 'create_piece', args: { rectangle: { width: 100, height: 50 } }, hasta: Date.now() - 1 });
    await vi.waitFor(() => expect(socket().enviados.some(m => m.t === 'respuesta')).toBe(true));
    expect(socket().enviados.find(m => m.t === 'respuesta')!.respuesta).toMatchObject({ ok: false, error: expect.stringMatching(/expired.*nothing was changed/) });
    expect(store.getState().project.pieces).toEqual([]);
  });

  it('un verbo que no existe responde ok: false, sin romper la conexión', async () => {
    const { conexion, socket, ultimo } = montar();
    conexion.conectar();
    await tick();
    socket().abrir();
    socket().recibir({ t: 'llamada', id: 3, verbo: 'no_existe', args: {} });
    await vi.waitFor(() => expect(socket().enviados.some(m => m.t === 'respuesta')).toBe(true));
    expect(socket().enviados.find(m => m.t === 'respuesta')!.respuesta).toMatchObject({ ok: false, error: 'unknown verb: no_existe' });
    expect(ultimo()!.estado).toBe('conectado');
  });
});

describe('cuando se corta', () => {
  it('si el puente se va, vuelve a buscar y reintenta a los 3 s', async () => {
    vi.useFakeTimers();
    const { conexion, ultimo, socket } = montar();
    conexion.conectar();
    await vi.advanceTimersByTimeAsync(0);
    socket().abrir();
    socket().caer();
    expect(ultimo()).toEqual({ estado: 'buscando', agente: null });
    expect(SocketFalso.todos.length).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(SocketFalso.todos.length).toBe(2);
  });

  it('4001: otra pestaña tomó la conexión; apaga sin reintentar (Review Focus 5)', async () => {
    vi.useFakeTimers();
    const { conexion, ultimo, socket } = montar();
    conexion.conectar();
    await vi.advanceTimersByTimeAsync(0);
    socket().abrir();
    socket().caer(CIERRE_REEMPLAZADA);
    expect(ultimo()).toEqual({ estado: 'reemplazado', agente: null });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(SocketFalso.todos.length).toBe(1);
  });

  it('desconectar cierra con 1000, apaga y no reintenta', async () => {
    vi.useFakeTimers();
    const { conexion, ultimo, socket } = montar();
    conexion.conectar();
    await vi.advanceTimersByTimeAsync(0);
    socket().abrir();
    conexion.desconectar();
    expect(socket().cerradoCon).toBe(1000);
    expect(ultimo()).toEqual({ estado: 'apagado', agente: null });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(SocketFalso.todos.length).toBe(1);
  });
});

describe('nombreDelAgente', () => {
  it('pone nombre a los que conoce y deja los demás tal cual', () => {
    expect(nombreDelAgente('claude-code')).toBe('Claude Code');
    expect(nombreDelAgente('mi-agente')).toBe('mi-agente');
    expect(nombreDelAgente('')).toBeNull();
    expect(nombreDelAgente(undefined)).toBeNull();
  });
});
