/**
 * @vitest-environment jsdom
 *
 * El preparador (spec 2026-10-11 «simular al instante» § 4.1): con la prenda a
 * la vista y la simulación parada, malla en segundo plano 600 ms después del
 * último cambio y, con WebGPU, arma la tela del solver fuera del hilo, para que
 * «Simular» encuentre las mallas y la tela hechas o en vuelo. Una edición
 * suelta lo que está en vuelo; pulsar «Simular» lo deja terminar.
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
const telas = vi.hoisted(() => ({ obtenerTela: vi.fn() }));

vi.mock('../../../utils/cloth/gpu/telasPreparadas', () => ({ obtenerTela: telas.obtenerTela }));
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
import { mallasDePiezas } from '../mallasDePiezas';
import { colocarMallas } from '../colocarMallas';
import { seamsToInitData } from '../costurasDeLaSimulacion';
import { clearSolverEvents, getSolverEvents, type SolverEventKind } from '../../../utils/cloth/solverRuntimeTracker';
import { seamInitDataToPairs } from '../../../utils/cloth/seamPairs';
import { complianceDeTela } from '../../../utils/cloth/complianceDeTela';
import { interruptoresDeTela } from '../../../utils/cloth/gpu/prepararTela';
import { huella } from '../../../utils/cloth/huella';
import type { MeshedPiece as SimMeshedPiece } from '../../../utils/cloth/simulationInitClient';
import type { ArmAxis } from '../../../utils/cloth/arrangement/buildAxisHints';
import type { BodyMeasurements, PatternPiece, Seam, SeamGroup } from '../../../types/types';

const MEDIDAS: BodyMeasurements = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 };
const SIN_BRAZOS: ArmAxis = { left: null, right: null, ready: false };

const pieza = (id: string) => ({ id, name: id, outline: [] }) as unknown as PatternPiece;
/** Los casos del mallado: sin WebGPU el preparador no pasa de las mallas. Los de la tela usan `prenda`. */
const entradas = (id: string, densidad = 5): EntradasDeLaTela => ({
  piezas: [pieza(id)],
  densidades: { [id]: densidad },
  densidad,
  medidas: MEDIDAS,
  overrides: {},
  armAxis: SIN_BRAZOS,
  seams: [],
  seamGroups: undefined,
  fabricId: 'cotton-poplin',
  conGpu: false,
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
  telas.obtenerTela.mockReset();
  telas.obtenerTela.mockResolvedValue({ tela: {}, origen: 'armada' });
  clearSolverEvents();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.removeItem('vina-crossbend');
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
    const dos: EntradasDeLaTela = { ...entradas('a'), piezas: [pieza('a'), pieza('b')], densidades: {} };
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

// ─── La tela del solver WebGPU ───────────────────────────────────────────────

/** Un rectángulo de 200 × 300 mm con un borde «lado», al que se cose. */
const rect = (id: string, category: string, side: string) => ({
  id, name: id, category, side,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 300] }, { type: 'L', values: [0, 300] }, { type: 'Z', values: [] },
  ],
  edges: [{ id: 'lado', name: 'lado', segmentRange: [1, 2], edgeType: 'side' }],
  position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [],
}) as unknown as PatternPiece;

const costura = (a: string, b: string) => ({
  id: `${a}-${b}`, pieceA: { pieceId: a, edgeName: 'lado' }, pieceB: { pieceId: b, edgeName: 'lado' },
  type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
}) as Seam;

const grupo = (a: string, b: string): SeamGroup => ({
  id: `grupo-${a}-${b}`, edgesA: [{ pieceId: a, edgeName: 'lado' }], edgesB: [{ pieceId: b, edgeName: 'lado' }],
  type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
});

/**
 * Una prenda en la que cada entrada cuenta en la huella: una manga (la pose la
 * coloca), una densidad propia, una costura, un grupo de costuras, una
 * colocación a mano y una tela de la biblioteca. Con WebGPU.
 */
const prenda = (cambios: Partial<EntradasDeLaTela> = {}): EntradasDeLaTela => ({
  piezas: [rect('delantero', 'bodice', 'front'), rect('espalda', 'bodice', 'back'), rect('manga', 'sleeve', 'left')],
  densidades: { delantero: 4 },
  densidad: 5,
  medidas: MEDIDAS,
  overrides: { espalda: [0.05, 1.2, -0.25] },
  armAxis: SIN_BRAZOS,
  seams: [costura('delantero', 'espalda')],
  seamGroups: [grupo('manga', 'delantero')],
  fabricId: 'cotton-poplin',
  conGpu: true,
  ...cambios,
});

const A_POSE: ArmAxis = { left: [0.5, -0.85, 0], right: [-0.5, -0.85, 0], ready: true };

/** Lo que devuelve `meshAllPieces` cuando todas mallan: una malla plana por pieza, en su orden. */
const mallasPlanas = (e: EntradasDeLaTela): SimMeshedPiece[] => e.piezas.map((p) => ({
  pieceId: p.id,
  vertices: new Float32Array([-0.1, 0, -0.15, 0.1, 0, -0.15, 0.1, 0, 0.15, -0.1, 0, 0.15]),
  triIds: new Int32Array([0, 1, 2, 0, 2, 3]),
}));

/**
 * Lo que la cascada calcula al pulsar «Simular», con sus mismas funciones:
 * useMeshing (`mallasDePiezas`), GarmentSimulation (`colocarMallas`,
 * `seamsToInitData`) y la rama WebGPU de useSimulationLifecycle.
 */
function comoLaCascada(e: EntradasDeLaTela, mallas: SimMeshedPiece[]) {
  const pieces = colocarMallas(mallasDePiezas(mallas, e.piezas, e.densidades, e.densidad), e.piezas, e.medidas, e.overrides, e.armAxis);
  const seamPairs = seamInitDataToPairs(seamsToInitData(e.seams, e.seamGroups), pieces);
  const fabric = complianceDeTela(e.fabricId);
  const interruptores = interruptoresDeTela();
  return { clave: huella(pieces, seamPairs, fabric, interruptores), entradas: { pieces, seamPairs, fabric, interruptores } };
}

const deLaTela = () => getSolverEvents().filter((e) => e.data.fase === 'tela').map((e) => ({ kind: e.kind, ...e.data }));
/** Un `navigator.gpu` cuyo `requestAdapter` hace lo que se le pase. Cada uno es otro: se le vuelve a preguntar. */
const ponerGpu = (requestAdapter: () => unknown) => { (navigator as { gpu?: unknown }).gpu = { requestAdapter }; };

describe('usePrepararTela: la tela del solver WebGPU', () => {
  // Por defecto hay adaptador: la cascada irá por WebGPU.
  beforeEach(() => { ponerGpu(async () => ({})); });
  afterEach(() => { delete (navigator as { gpu?: unknown }).gpu; });

  it('con WebGPU, al mallar todo pide la tela con la huella y las entradas de la cascada, solo fuera del hilo, y avisa cuando está', async () => {
    // Un interruptor fuera de su valor de siempre: tiene que leerlo, no suponerlo.
    localStorage.setItem('vina-crossbend', 'off');
    const e = prenda();
    montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    const mallas = mallasPlanas(e);
    await act(async () => { clientes[0].terminar(mallas); });

    const cascada = comoLaCascada(e, mallas);
    expect(cascada.entradas.seamPairs, 'la costura y el grupo cosen: entran a la huella').toHaveLength(2);
    expect(telas.obtenerTela).toHaveBeenCalledTimes(1);
    const [clave, armado, opciones] = telas.obtenerTela.mock.calls[0];
    expect(clave, 'la huella de la cascada: si difiere, «Simular» vuelve a armar la tela, en silencio').toBe(cascada.clave);
    expect(armado).toEqual(cascada.entradas);
    expect(opciones, 'en reposo, nunca en el hilo principal').toEqual({ soloFueraDelHilo: true });
    expect(eventos('preparar:listo')).toEqual([expect.objectContaining({ fase: 'mallas' }), { fase: 'tela', ms: expect.any(Number) }]);
  });

  it('sin WebGPU solo malla: la tela de WASM y CPU no es esta', async () => {
    const e = prenda({ conGpu: false });
    montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[0].terminar(mallasPlanas(e)); });

    expect(telas.obtenerTela).not.toHaveBeenCalled();
    expect(eventos('preparar:listo').map((d) => d.fase)).toEqual(['mallas']);
  });

  it('con WebGPU pero sin adaptador (GPU vetada, o el Chromium sin GPU de los e2e) solo malla: la cascada caerá a WASM', async () => {
    ponerGpu(async () => null);
    const e = prenda();
    montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[0].terminar(mallasPlanas(e)); });

    expect(telas.obtenerTela).not.toHaveBeenCalled();
    expect(getSolverEvents().map((ev) => [ev.kind, ev.data.fase]), 'ni un fallo de la tela').toEqual([['preparar:listo', 'mallas']]);
  });

  it('pregunta por el adaptador una sola vez, aunque prepare varias veces', async () => {
    const requestAdapter = vi.fn(async () => ({}));
    ponerGpu(requestAdapter);
    const { rerender } = montar(prenda());
    for (let i = 0; i < 3; i++) {
      if (i > 0) rerender({ e: prenda({ densidad: 5 + i }) });
      act(() => { vi.advanceTimersByTime(600); });
      await act(async () => { clientes[i].terminar(mallasPlanas(prenda())); });
    }

    expect(telas.obtenerTela, 'las tres prepararon la tela').toHaveBeenCalledTimes(3);
    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });

  it('una edición mientras pregunta por el adaptador suelta la corrida: no pide la tela', async () => {
    let responder: (adaptador: unknown) => void = () => {};
    ponerGpu(() => new Promise((ok) => { responder = ok; }));
    const e = prenda();
    const { rerender } = montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[0].terminar(mallasPlanas(e)); });

    rerender({ e: prenda({ densidad: 4 }) });
    await act(async () => { responder({}); });
    expect(telas.obtenerTela).not.toHaveBeenCalled();
  });

  it('otra pose (armAxis) mientras malla suelta esa preparación y, 600 ms después, pide la tela de la colocación nueva, con otra huella', async () => {
    const antes = prenda();
    const { rerender } = montar(antes);
    act(() => { vi.advanceTimersByTime(600); });
    const despues = prenda({ armAxis: A_POSE });
    rerender({ e: despues });

    // La soltada termina igual, con todas sus mallas: su tela ya no es la de la prenda.
    await act(async () => { clientes[0].terminar(mallasPlanas(antes)); });
    expect(telas.obtenerTela, 'la corrida soltada no arma la tela').not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(600); });
    const mallas = mallasPlanas(despues);
    await act(async () => { clientes[1].terminar(mallas); });
    expect(telas.obtenerTela).toHaveBeenCalledTimes(1);
    const [clave] = telas.obtenerTela.mock.calls[0];
    expect(clave).toBe(comoLaCascada(despues, mallas).clave);
    expect(clave, 'la manga cae por el brazo: la tela de antes no sirve').not.toBe(comoLaCascada(antes, mallas).clave);
  });

  it('pulsar «Simular» (entradas → null) mientras malla no impide pedir la tela al terminar: la cascada la comparte en vuelo', async () => {
    const e = prenda();
    const { rerender } = montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    rerender({ e: null });

    const mallas = mallasPlanas(e);
    await act(async () => { clientes[0].terminar(mallas); });
    expect(telas.obtenerTela).toHaveBeenCalledTimes(1);
    expect(telas.obtenerTela.mock.calls[0][0]).toBe(comoLaCascada(e, mallas).clave);
    expect(deLaTela().map((d) => d.kind), 'la que se dejó terminar sí cuenta').toEqual(['preparar:listo']);
  });

  it('si obtenerTela rechaza, avisa preparar:fallo con la fase tela y el mensaje, y no lanza', async () => {
    telas.obtenerTela.mockRejectedValue(new Error('La tela no se armó fuera del hilo principal: sin worker'));
    const e = prenda();
    montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[0].terminar(mallasPlanas(e)); });

    expect(eventos('preparar:fallo')).toEqual([{ fase: 'tela', message: 'La tela no se armó fuera del hilo principal: sin worker' }]);
    expect(eventos('preparar:listo').map((d) => d.fase), 'las mallas sí quedaron').toEqual(['mallas']);
  });

  it.each<[string, (llega: () => void, falla: () => void) => void]>([
    ['llega', (llega) => llega()],
    ['falla', (_, falla) => falla()],
  ])('una edición mientras arma la tela suelta la corrida: si la tela %s después, no avisa nada de ella', async (_, asentar) => {
    let llega = () => {};
    let falla = () => {};
    telas.obtenerTela.mockImplementation(() => new Promise((ok, mal) => {
      llega = () => ok({ tela: {}, origen: 'armada' });
      falla = () => mal(new Error('error del worker'));
    }));
    const e = prenda();
    const { rerender } = montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[0].terminar(mallasPlanas(e)); });
    expect(telas.obtenerTela, 'la tela está en vuelo').toHaveBeenCalledTimes(1);

    rerender({ e: prenda({ densidad: 4 }) });
    await act(async () => { asentar(llega, falla); });
    expect(deLaTela()).toEqual([]);
  });

  it('si alguna pieza no malla no pide la tela: la preparación ya falló en las mallas', async () => {
    const e = prenda();
    montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[0].terminar(mallasPlanas(e).slice(1)); });

    expect(telas.obtenerTela).not.toHaveBeenCalled();
    expect(eventos('preparar:fallo')).toEqual([{ fase: 'mallas', message: '1 de 3 piezas sin malla' }]);
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
