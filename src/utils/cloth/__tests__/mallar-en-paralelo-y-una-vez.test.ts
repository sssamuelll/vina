/**
 * @vitest-environment jsdom
 *
 * Mallar en paralelo y una sola vez (2026-10-11). La sonda del drape midió en
 * el PC de Samuel 12 s entre «Simular» y el primer cuadro de tela; 8,6 s eran
 * mallar las cinco piezas de María en UN worker, una tras otra (cdt2d es el
 * 99 %: las dos piezas grandes tardan ~5 s cada una), y se repetía entera en
 * cada «Simular» y en cada re-mallado tras una edición, aunque la pieza no
 * hubiera cambiado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PatternPiece } from '../../../types/types';

/** Un worker de mentira: guarda lo que le piden y responde cuando el test lo dice. */
class WorkerFalso {
  static todos: WorkerFalso[] = [];
  oyentes: Array<(e: MessageEvent) => void> = [];
  pedidos: Array<{ piece: PatternPiece }> = [];
  /** Como uno de verdad: terminado, ni recibe ni contesta. */
  terminado = false;
  constructor() { WorkerFalso.todos.push(this); }
  addEventListener(tipo: string, f: (e: MessageEvent) => void) { if (tipo === 'message') this.oyentes.push(f); }
  postMessage(msg: { type: string; piece: PatternPiece }) { if (!this.terminado && msg.type === 'meshPiece') this.pedidos.push(msg); }
  terminate() { this.terminado = true; this.pedidos = []; }
  responder() {
    for (const { piece } of this.pedidos.splice(0)) {
      const data = { type: 'meshPieceResult', pieceId: piece.id, vertices: new Float32Array([1, 2, 3]), triIds: new Int32Array([0, 0, 0]) };
      for (const f of this.oyentes) f({ data } as MessageEvent);
    }
  }
  /** El mallador de verdad no pudo: contesta con el error, como `simulationWorker`. */
  fallar(error: string) {
    for (const { piece } of this.pedidos.splice(0)) {
      for (const f of this.oyentes) f({ data: { type: 'meshPieceResult', pieceId: piece.id, error } } as MessageEvent);
    }
  }
}

const pieza = (id: string, lado: number): PatternPiece => ({
  id,
  name: id,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [lado, 0] },
    { type: 'L', values: [lado, lado] },
    { type: 'Z', values: [] },
  ],
  internals: [],
}) as unknown as PatternPiece;

const responderTodo = async () => {
  for (let i = 0; i < 5; i++) {
    for (const w of WorkerFalso.todos) w.responder();
    await new Promise((r) => setTimeout(r, 0));
  }
};

beforeEach(() => {
  WorkerFalso.todos = [];
  vi.stubGlobal('Worker', WorkerFalso);
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

describe('mallar en paralelo y una sola vez', () => {
  it('las piezas se mallan a la vez, en varios workers, y vuelven en su orden', async () => {
    const { SimulationInitClient } = await import('../simulationInitClient');
    const cliente = new SimulationInitClient();
    const piezas = [pieza('a', 100), pieza('b', 500), pieza('c', 300)];
    const promesa = cliente.meshAllPieces(piezas, {}, 5);
    await new Promise((r) => setTimeout(r, 0));

    const enVuelo = WorkerFalso.todos.reduce((n, w) => n + w.pedidos.length, 0);
    expect(enVuelo, 'las tres piezas salen sin esperar a la anterior').toBe(3);
    expect(WorkerFalso.todos.filter((w) => w.pedidos.length > 0).length).toBeGreaterThan(1);

    await responderTodo();
    expect((await promesa).map((m) => m.pieceId)).toEqual(['a', 'b', 'c']);
    cliente.dispose();
  });

  it('una pieza que ya se malló no se vuelve a mallar, y se entrega una copia', async () => {
    const { SimulationInitClient } = await import('../simulationInitClient');
    const piezas = [pieza('a', 100), pieza('b', 200)];

    const primero = new SimulationInitClient();
    const p1 = primero.meshAllPieces(piezas, {}, 5);
    await responderTodo();
    const antes = await p1;
    primero.dispose();

    const segundo = new SimulationInitClient();
    const p2 = segundo.meshAllPieces(piezas, {}, 5);
    await new Promise((r) => setTimeout(r, 0));
    const pedidos = WorkerFalso.todos.reduce((n, w) => n + w.pedidos.length, 0);
    await responderTodo();
    const despues = await p2;

    expect(pedidos, 'ningún pedido nuevo: las mallas estaban hechas').toBe(0);
    expect(despues.map((m) => Array.from(m.vertices))).toEqual(antes.map((m) => Array.from(m.vertices)));
    expect(despues[0].vertices, 'una copia: nadie comparte arrays con la caché').not.toBe(antes[0].vertices);
    segundo.dispose();
  });

  it('una pieza editada o con otra densidad sí se vuelve a mallar', async () => {
    const { SimulationInitClient } = await import('../simulationInitClient');
    const c1 = new SimulationInitClient();
    const p = c1.meshAllPieces([pieza('a', 100)], {}, 5);
    await responderTodo();
    await p;

    // Un cliente por mallado, como useMeshing (cada efecto crea el suyo).
    const c2 = new SimulationInitClient();
    const c3 = new SimulationInitClient();
    const editada = c2.meshAllPieces([pieza('a', 120)], {}, 5);
    const otraDensidad = c3.meshAllPieces([pieza('a', 100)], {}, 8);
    await new Promise((r) => setTimeout(r, 0));
    expect(WorkerFalso.todos.reduce((n, w) => n + w.pedidos.length, 0)).toBe(2);
    await responderTodo();
    await Promise.all([editada, otraDensidad]);
    c1.dispose();
    c2.dispose();
    c3.dispose();
  });

  it('lo que está en vuelo se comparte: un segundo cliente no pide otra vez la misma malla', async () => {
    const { SimulationInitClient } = await import('../simulationInitClient');
    const piezas = [pieza('a', 100)];
    const primero = new SimulationInitClient();
    const p1 = primero.meshAllPieces(piezas, {}, 5);
    await new Promise((r) => setTimeout(r, 0));
    const segundo = new SimulationInitClient();
    const p2 = segundo.meshAllPieces(piezas, {}, 5);
    await new Promise((r) => setTimeout(r, 0));

    expect(WorkerFalso.todos.reduce((n, w) => n + w.pedidos.length, 0), 'un solo pedido para la misma malla').toBe(1);
    await responderTodo();
    const [a, b] = await Promise.all([p1, p2]);
    expect(Array.from(b[0].vertices)).toEqual(Array.from(a[0].vertices));
    expect(b[0].vertices, 'una copia, no el mismo array').not.toBe(a[0].vertices);
    primero.dispose();
    segundo.dispose();
  });

  it('si el que mallaba se suelta, el que esperaba malla por su cuenta', async () => {
    const { SimulationInitClient } = await import('../simulationInitClient');
    const piezas = [pieza('a', 100)];
    const primero = new SimulationInitClient();
    void primero.meshAllPieces(piezas, {}, 5);
    await new Promise((r) => setTimeout(r, 0));
    const segundo = new SimulationInitClient();
    const p2 = segundo.meshAllPieces(piezas, {}, 5);
    await new Promise((r) => setTimeout(r, 0));

    primero.dispose();
    await new Promise((r) => setTimeout(r, 0));
    await responderTodo();
    expect((await p2).map((m) => m.pieceId)).toEqual(['a']);
    segundo.dispose();
  });

  it('un cliente suelto no deja en vuelo las piezas que tenía en cola', async () => {
    const { SimulationInitClient } = await import('../simulationInitClient');
    const piezas = [pieza('a', 500), pieza('b', 400), pieza('c', 300), pieza('d', 200), pieza('e', 100)];
    const primero = new SimulationInitClient();
    void primero.meshAllPieces(piezas, {}, 5); // cuatro carriles: «e» queda en cola
    await new Promise((r) => setTimeout(r, 0));
    primero.dispose(); // como useMeshing al editar «a»
    await new Promise((r) => setTimeout(r, 0));

    const segundo = new SimulationInitClient();
    const suWorker = WorkerFalso.todos[WorkerFalso.todos.length - 1];
    const p2 = segundo.meshAllPieces([pieza('e', 100)], {}, 5);
    await new Promise((r) => setTimeout(r, 0));
    expect(suWorker.pedidos.length, 'nadie más malla «e»: se pide ya, no a los 30 s').toBe(1);
    await responderTodo();
    expect((await p2).map((m) => m.pieceId)).toEqual(['e']);
    segundo.dispose();
  });

  it('soltar un cliente con piezas en cola cancela, no falla; un fallo de verdad sí queda en la caja negra', async () => {
    const { SimulationInitClient } = await import('../simulationInitClient');
    const { clearSolverEvents, getSolverEvents } = await import('../solverRuntimeTracker');
    clearSolverEvents();
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fallos = () => getSolverEvents().filter((e) => e.kind === 'meshing:piece-failed').map((e) => e.data);

    // Cuatro en vuelo y «e» en cola, como el preparador cuando María edita a mitad.
    const suelto = new SimulationInitClient();
    const p1 = suelto.meshAllPieces([pieza('a', 500), pieza('b', 400), pieza('c', 300), pieza('d', 200), pieza('e', 100)], {}, 5);
    await new Promise((r) => setTimeout(r, 0));
    suelto.dispose();
    expect(await p1).toEqual([]);
    expect(fallos(), 'soltar no es un fallo de mallado').toEqual([]);
    expect(avisos).not.toHaveBeenCalled();

    const vivo = new SimulationInitClient();
    const p2 = vivo.meshAllPieces([pieza('f', 100)], {}, 5);
    await new Promise((r) => setTimeout(r, 0));
    for (const w of WorkerFalso.todos) w.fallar('cdt2d se rindió');
    expect(await p2).toEqual([]);
    expect(fallos()).toEqual([{ pieceId: 'f', message: 'cdt2d se rindió' }]);
    expect(avisos).toHaveBeenCalledTimes(1);
    vivo.dispose();
    avisos.mockRestore();
  });

  // Una pieza que no malla vuelve a fallar en cada preparación del reposo, y el
  // preparador ya lo cuenta en `preparar:fallo` (cuántas): su cliente no llena
  // el ring con un `meshing:piece-failed` por intento. Al pulsar sí se dice.
  it('con silenciarFallos, un fallo de verdad no va a la caja negra ni a la consola; el cliente por defecto sí lo dice', async () => {
    const { SimulationInitClient } = await import('../simulationInitClient');
    const { clearSolverEvents, getSolverEvents } = await import('../solverRuntimeTracker');
    clearSolverEvents();
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fallos = () => getSolverEvents().filter((e) => e.kind === 'meshing:piece-failed').map((e) => e.data);
    const fallarTodo = () => { for (const w of WorkerFalso.todos) w.fallar('cdt2d se rindió'); };

    const callado = new SimulationInitClient({ silenciarFallos: true });
    const p1 = callado.meshAllPieces([pieza('a', 100)], {}, 5);
    await new Promise((r) => setTimeout(r, 0));
    fallarTodo();
    expect(await p1, 'la pieza queda fuera igual').toEqual([]);
    expect(fallos(), 'ni un evento por pieza').toEqual([]);
    expect(avisos).not.toHaveBeenCalled();
    callado.dispose();

    const porDefecto = new SimulationInitClient();
    const p2 = porDefecto.meshAllPieces([pieza('b', 100)], {}, 5);
    await new Promise((r) => setTimeout(r, 0));
    fallarTodo();
    expect(await p2).toEqual([]);
    expect(fallos()).toEqual([{ pieceId: 'b', message: 'cdt2d se rindió' }]);
    expect(avisos).toHaveBeenCalledTimes(1);
    porDefecto.dispose();
    avisos.mockRestore();
  });

  it('fueraDelHilo dice si el cliente malla en un worker o en el hilo principal', async () => {
    const { SimulationInitClient } = await import('../simulationInitClient');
    const conWorker = new SimulationInitClient();
    expect(conWorker.fueraDelHilo).toBe(true);
    conWorker.dispose();

    vi.stubGlobal('Worker', class { constructor() { throw new Error('bloqueado por la CSP'); } });
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(new SimulationInitClient().fueraDelHilo, 'sin worker malla en el hilo principal').toBe(false);
    avisos.mockRestore();
  });
});
