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
  constructor() { WorkerFalso.todos.push(this); }
  addEventListener(tipo: string, f: (e: MessageEvent) => void) { if (tipo === 'message') this.oyentes.push(f); }
  postMessage(msg: { type: string; piece: PatternPiece }) { if (msg.type === 'meshPiece') this.pedidos.push(msg); }
  terminate() {}
  responder() {
    for (const { piece } of this.pedidos.splice(0)) {
      const data = { type: 'meshPieceResult', pieceId: piece.id, vertices: new Float32Array([1, 2, 3]), triIds: new Int32Array([0, 0, 0]) };
      for (const f of this.oyentes) f({ data } as MessageEvent);
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
});
