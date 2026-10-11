/**
 * @vitest-environment jsdom
 *
 * El preparador (spec 2026-10-11 «simular al instante» § 4.1): con la prenda a
 * la vista y la simulación parada, malla en segundo plano 600 ms después del
 * último cambio, para que «Simular» encuentre las mallas hechas o en vuelo.
 * Una edición suelta lo que está en vuelo; pulsar «Simular» lo deja terminar.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

interface ClienteFalso {
  fueraDelHilo: boolean;
  meshAllPieces: Mock;
  dispose: Mock;
  terminar: (mallas: unknown[]) => void;
  fallar: (e: unknown) => void;
}

const clientes = vi.hoisted(() => [] as ClienteFalso[]);
/** Lo que el cliente falso dice de su worker: sin él mallaría en el hilo principal. */
const entorno = vi.hoisted(() => ({ conWorker: true }));

vi.mock('../../../utils/cloth/simulationInitClient', () => ({
  SimulationInitClient: class {
    fueraDelHilo = entorno.conWorker;
    terminar: (mallas: unknown[]) => void = () => {};
    fallar: (e: unknown) => void = () => {};
    meshAllPieces = vi.fn(() => new Promise((ok, mal) => { this.terminar = ok; this.fallar = mal; }));
    dispose = vi.fn();
    constructor() { clientes.push(this); }
  },
}));

import { debePrepararLaTela, usePrepararTela, type EntradasDeLaTela } from '../usePrepararTela';
import { clearSolverEvents, getSolverEvents, type SolverEventKind } from '../../../utils/cloth/solverRuntimeTracker';
import type { PatternPiece } from '../../../types/types';

const pieza = (id: string) => ({ id, name: id, outline: [] }) as unknown as PatternPiece;
const entradas = (id: string, densidad = 5): EntradasDeLaTela => ({
  piezas: [pieza(id)],
  densidades: { [id]: densidad },
  densidad,
});
/** Lo que devuelve `meshAllPieces` cuando todas mallaron: una por pieza. */
const mallasDe = (e: EntradasDeLaTela) => e.piezas.map((p) => ({ pieceId: p.id }));
const llamadas = () => clientes.flatMap((c) => c.meshAllPieces.mock.calls);
const eventos = (kind: SolverEventKind) => getSolverEvents().filter((e) => e.kind === kind).map((e) => e.data);
const montar = (inicial: EntradasDeLaTela | null) =>
  renderHook(({ e }: { e: EntradasDeLaTela | null }) => usePrepararTela(e), { initialProps: { e: inicial } });

beforeEach(() => {
  clientes.length = 0;
  entorno.conWorker = true;
  clearSolverEvents();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('usePrepararTela', () => {
  it('con entradas, a los 599 ms no ha mallado; a los 600 ms malla una vez, con las piezas y las densidades', () => {
    const e = entradas('a', 4);
    montar(e);

    act(() => { vi.advanceTimersByTime(599); });
    expect(llamadas(), 'antes de la espera no se malla').toHaveLength(0);

    act(() => { vi.advanceTimersByTime(1); });
    expect(llamadas()).toEqual([[e.piezas, e.densidades, e.densidad]]);
  });

  it('dos cambios de entradas en 300 ms dan una sola malla, con las últimas', () => {
    const { rerender } = montar(entradas('a'));
    act(() => { vi.advanceTimersByTime(150); });
    rerender({ e: entradas('b') });
    act(() => { vi.advanceTimersByTime(150); });
    const ultimas = entradas('c');
    rerender({ e: ultimas });

    act(() => { vi.advanceTimersByTime(599); });
    expect(llamadas(), 'la espera cuenta desde el último cambio').toHaveLength(0);
    act(() => { vi.advanceTimersByTime(1); });
    expect(llamadas()).toEqual([[ultimas.piezas, ultimas.densidades, ultimas.densidad]]);
  });

  it('pulsar «Simular» (entradas → null) mientras malla no la suelta: se suelta al terminar, y avisa', async () => {
    const e = entradas('a');
    const { rerender } = montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    const [cliente] = clientes;

    rerender({ e: null });
    expect(cliente.dispose, 'la simulación espera esa malla en vuelo').not.toHaveBeenCalled();

    await act(async () => { cliente.terminar(mallasDe(e)); });
    expect(cliente.dispose).toHaveBeenCalledTimes(1);
    expect(eventos('preparar:listo'), 'la que se dejó terminar sí cuenta').toHaveLength(1);
  });

  it('una edición mientras malla la suelta en el acto, y la nueva malla llega 600 ms después', () => {
    const { rerender } = montar(entradas('a'));
    act(() => { vi.advanceTimersByTime(600); });
    const [primero] = clientes;

    const editadas = entradas('a', 3);
    rerender({ e: editadas });
    expect(primero.dispose, 'su malla ya no sirve').toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(600); });
    expect(clientes).toHaveLength(2);
    expect(clientes[1].meshAllPieces).toHaveBeenCalledWith(editadas.piezas, editadas.densidades, editadas.densidad);
  });

  // Un cliente soltado resuelve después, casi siempre corto (lo que tenía en
  // vuelo o en cola falla con «Disposed»): eso no es ni «listo» ni «fallo».
  it.each<[string, (c: ClienteFalso, e: EntradasDeLaTela) => void]>([
    ['resuelve con todas', (c, e) => c.terminar(mallasDe(e))],
    ['resuelve corta', (c) => c.terminar([])],
    ['rechaza', (c) => c.fallar(new Error('Worker crashed'))],
  ])('una corrida soltada por una edición no avisa nada cuando %s', async (_, asentar) => {
    const e = entradas('a');
    const { rerender } = montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    const [primero] = clientes;
    rerender({ e: entradas('a', 3) });

    await act(async () => { asentar(primero, e); });
    expect(getSolverEvents()).toEqual([]);
  });

  it('desmontar mientras malla la suelta en el acto, y lo soltado no avisa', async () => {
    const e = entradas('a');
    const { unmount } = montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    const [cliente] = clientes;

    unmount();
    expect(cliente.dispose).toHaveBeenCalledTimes(1);
    await act(async () => { cliente.terminar(mallasDe(e)); });
    expect(getSolverEvents()).toEqual([]);
  });

  it('al terminar con todas las piezas avisa preparar:listo con la fase de las mallas', async () => {
    const e = entradas('a');
    montar(e);
    act(() => { vi.advanceTimersByTime(600); });

    await act(async () => { clientes[0].terminar(mallasDe(e)); });
    expect(eventos('preparar:listo')).toEqual([expect.objectContaining({ fase: 'mallas' })]);
    expect(eventos('preparar:fallo')).toHaveLength(0);
  });

  it('si alguna pieza no malla (meshAllPieces la deja fuera y resuelve), avisa preparar:fallo con cuántas, no listo', async () => {
    const dos: EntradasDeLaTela = { piezas: [pieza('a'), pieza('b')], densidades: {}, densidad: 5 };
    montar(dos);
    act(() => { vi.advanceTimersByTime(600); });

    await act(async () => { clientes[0].terminar([{ pieceId: 'a' }]); });
    expect(eventos('preparar:fallo')).toEqual([{ fase: 'mallas', message: '1 de 2 piezas sin malla' }]);
    expect(eventos('preparar:listo'), 'una prenda a medias no está lista').toHaveLength(0);
  });

  it('si meshAllPieces rechaza avisa preparar:fallo con la fase y el mensaje, y no lanza', async () => {
    montar(entradas('a'));
    act(() => { vi.advanceTimersByTime(600); });

    await act(async () => { clientes[0].fallar(new Error('cdt2d se rindió')); });
    expect(eventos('preparar:fallo')).toEqual([{ fase: 'mallas', message: 'cdt2d se rindió' }]);
    expect(eventos('preparar:listo')).toHaveLength(0);
    expect(clientes[0].dispose, 'el cliente se suelta igual').toHaveBeenCalledTimes(1);
  });

  it('sin workers no hace nada: mallaría en el hilo principal y congelaría el visor en reposo', () => {
    entorno.conWorker = false;
    montar(entradas('a'));
    act(() => { vi.advanceTimersByTime(600); });

    expect(llamadas(), 'no malla: «Simular» mallará como siempre').toHaveLength(0);
    expect(clientes[0].dispose, 'suelta el cliente que creó').toHaveBeenCalledTimes(1);
    expect(getSolverEvents(), 'ni avisa nada').toHaveLength(0);
  });

  it('cada preparación reemplaza el «listo» de las mallas de la anterior: en el ring queda uno', async () => {
    const primeras = entradas('a');
    const { rerender } = montar(primeras);
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[0].terminar(mallasDe(primeras)); });
    const segundas = entradas('a', 3);
    rerender({ e: segundas });
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[1].terminar(mallasDe(segundas)); });

    expect(eventos('preparar:listo'), 'una sesión larga editando no llena el ring de «listo»').toHaveLength(1);
  });

  it('un fallo reemplaza al fallo anterior de la misma fase (la pieza que no malla falla en cada preparación); listo y fallo conviven', async () => {
    const primeras = entradas('a');
    const { rerender } = montar(primeras);
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[0].terminar(mallasDe(primeras)); });
    rerender({ e: entradas('a', 3) });
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[1].fallar(new Error('uno')); });
    rerender({ e: entradas('a', 2) });
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[2].fallar(new Error('dos')); });

    expect(getSolverEvents().map((e) => ({ kind: e.kind, fase: e.data.fase, message: e.data.message }))).toEqual([
      { kind: 'preparar:listo', fase: 'mallas' },
      { kind: 'preparar:fallo', fase: 'mallas', message: 'dos' },
    ]);
  });
});

describe('debePrepararLaTela', () => {
  type Estado = Parameters<typeof debePrepararLaTela>[0];
  const todo: Estado = { simulationState: 'idle', viewMode: '3d', showGarment: true, piezas: [pieza('a')] };

  it('en reposo, en 3D o en Split, con la prenda a la vista y algo que simular: prepara', () => {
    expect(debePrepararLaTela(todo)).toBe(true);
    expect(debePrepararLaTela({ ...todo, viewMode: 'split' })).toBe(true);
  });

  it.each<[string, Partial<Estado>]>([
    ['simulando', { simulationState: 'running' }],
    ['en pausa', { simulationState: 'paused' }],
    ['en la vista 2D', { viewMode: '2d' }],
    ['con la prenda oculta', { showGarment: false }],
    ['sin piezas que se simulen', { piezas: [] }],
  ])('%s no prepara', (_, cambio) => {
    expect(debePrepararLaTela({ ...todo, ...cambio })).toBe(false);
  });
});
