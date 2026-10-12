/**
 * @vitest-environment jsdom
 *
 * El preparador (spec 2026-10-11 «simular al instante» § 4.1): con la prenda a
 * la vista y la simulación parada, malla en segundo plano 600 ms después del
 * último cambio y, con WebGPU, arma la tela del solver fuera del hilo, para que
 * «Simular» encuentre las mallas y la tela hechas o en vuelo. Una edición
 * suelta lo que está en vuelo; pulsar «Simular» lo deja terminar. Pasar a 2D,
 * ocultar la prenda o quedarse sin piezas lo suelta, como una edición.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

interface ClienteFalso {
  /** Lo que recibió el constructor. */
  opciones: unknown;
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
/** El cuerpo que se hornea (bakeCollisionFromRender) y la caché de su BVH. */
const cuerpo = vi.hoisted(() => ({ hornear: vi.fn() }));
const bvhs = vi.hoisted(() => ({ bvhGuardado: vi.fn(), guardarBvh: vi.fn(), armarBvhFueraDelHilo: vi.fn() }));

vi.mock('../../../utils/cloth/gpu/telasPreparadas', () => ({ obtenerTela: telas.obtenerTela }));
vi.mock('../../../utils/cloth/renderCollisionBake', () => ({ bakeCollisionFromRender: cuerpo.hornear }));
vi.mock('../../../utils/cloth/gpu/bvhPreparado', () => bvhs);
vi.mock('../../../utils/cloth/simulationInitClient', () => ({
  SimulationInitClient: class {
    fueraDelHilo = entorno.conWorker;
    terminar: (mallas: unknown[]) => void = () => {};
    fallar: (e: unknown) => void = () => {};
    meshAllPieces = vi.fn(() => new Promise((ok, mal) => { this.terminar = ok; this.fallar = mal; }));
    dispose = vi.fn();
    opciones: unknown;
    constructor(opciones?: unknown) {
      this.opciones = opciones;
      clientes.push(this);
    }
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
import type { CollisionMeshData } from '../../../utils/cloth/collisionMesh';
import type { LinearBVH } from '../../../utils/cloth/gpu/bvh';
import type { BodyMeasurements, PatternPiece, Seam, SeamGroup } from '../../../types/types';
import type { PoseState } from '../../../store/avatarSlice';

const MEDIDAS: BodyMeasurements = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 };
const SIN_BRAZOS: ArmAxis = { left: null, right: null, ready: false };
const POSE: PoseState = { joints: {}, activePreset: null, porResolver: false, ikChains: [], ikTargets: [], ikEnabled: false };
/** La malla que da hornear el cuerpo: un triángulo basta. */
const CUERPO: CollisionMeshData = {
  vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1]),
  triCount: 1,
};
const BVH = { nodeCount: 1 } as LinearBVH;

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
  pose: POSE,
  morphs: {},
});
/** Lo que devuelve `meshAllPieces` cuando todas mallaron: una por pieza. */
const mallasDe = (e: EntradasDeLaTela) => e.piezas.map((p) => ({ pieceId: p.id }));
const llamadas = () => clientes.flatMap((c) => c.meshAllPieces.mock.calls);
const eventos = (kind: SolverEventKind) => getSolverEvents().filter((e) => e.kind === kind).map((e) => e.data);
/**
 * `simulando` dice por qué las entradas pasan a null: con la simulación en
 * marcha es «Simular»; sin ella, la vista 2D, la prenda oculta o sin piezas.
 */
interface Props { e: EntradasDeLaTela | null; simulando?: boolean }
const montar = (inicial: EntradasDeLaTela | null) => {
  const initialProps: Props = { e: inicial };
  return renderHook(({ e, simulando = false }: Props) => usePrepararTela(e, simulando), { initialProps });
};

beforeEach(() => {
  clientes.length = 0;
  entorno.conWorker = true;
  telas.obtenerTela.mockReset();
  telas.obtenerTela.mockResolvedValue({ tela: {}, origen: 'armada' });
  cuerpo.hornear.mockReset();
  cuerpo.hornear.mockResolvedValue(CUERPO);
  bvhs.bvhGuardado.mockReset();
  bvhs.bvhGuardado.mockReturnValue(null);
  bvhs.guardarBvh.mockReset();
  bvhs.armarBvhFueraDelHilo.mockReset();
  bvhs.armarBvhFueraDelHilo.mockResolvedValue(BVH);
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

    rerender({ e: null, simulando: true });
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

  it('malla con un cliente que no avisa pieza por pieza: el fallo ya va en su preparar:fallo, y se repite en cada preparación', () => {
    montar(entradas('a'));
    act(() => { vi.advanceTimersByTime(600); });
    expect(clientes[0].opciones).toEqual({ silenciarFallos: true });
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
  pose: POSE,
  morphs: {},
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
    expect(eventos('preparar:listo')).toEqual([
      expect.objectContaining({ fase: 'mallas' }),
      { fase: 'tela', ms: expect.any(Number) },
      { fase: 'bvh', ms: expect.any(Number) },
    ]);
  });

  it('sin WebGPU solo malla: la tela de WASM y CPU no es esta, ni el BVH del cuerpo', async () => {
    const e = prenda({ conGpu: false });
    montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[0].terminar(mallasPlanas(e)); });

    expect(telas.obtenerTela).not.toHaveBeenCalled();
    expect(cuerpo.hornear).not.toHaveBeenCalled();
    expect(eventos('preparar:listo').map((d) => d.fase)).toEqual(['mallas']);
  });

  it('con WebGPU pero sin adaptador (GPU vetada, o el Chromium sin GPU de los e2e) solo malla: la cascada caerá a WASM', async () => {
    ponerGpu(async () => null);
    const e = prenda();
    montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[0].terminar(mallasPlanas(e)); });

    expect(telas.obtenerTela).not.toHaveBeenCalled();
    expect(cuerpo.hornear, 'ni hornea el cuerpo').not.toHaveBeenCalled();
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
    expect(cuerpo.hornear).not.toHaveBeenCalled();
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
    rerender({ e: null, simulando: true });

    const mallas = mallasPlanas(e);
    await act(async () => { clientes[0].terminar(mallas); });
    expect(telas.obtenerTela).toHaveBeenCalledTimes(1);
    expect(telas.obtenerTela.mock.calls[0][0]).toBe(comoLaCascada(e, mallas).clave);
    expect(deLaTela().map((d) => d.kind), 'la que se dejó terminar sí cuenta').toEqual(['preparar:listo']);
  });

  // Spec § 6: «en 2D no se prepara nada». Solo la simulación que arranca espera
  // lo que está en vuelo; la vista 2D, la prenda oculta o quedarse sin piezas
  // no esperan nada, y la corrida se suelta como en una edición.
  it('pasar a 2D (entradas → null sin simular) mientras malla la suelta en el acto: no avisa, ni pide la tela ni hornea el cuerpo', async () => {
    const e = prenda();
    const { rerender } = montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    const [cliente] = clientes;

    rerender({ e: null, simulando: false });
    expect(cliente.dispose, 'lo suyo ya no sirve: no se espera a que termine').toHaveBeenCalledTimes(1);

    await act(async () => { cliente.terminar(mallasPlanas(e)); });
    expect(getSolverEvents()).toEqual([]);
    expect(telas.obtenerTela).not.toHaveBeenCalled();
    expect(cuerpo.hornear).not.toHaveBeenCalled();
  });

  it('si obtenerTela rechaza, avisa preparar:fallo con la fase tela y el mensaje, y no lanza', async () => {
    telas.obtenerTela.mockRejectedValue(new Error('La tela no se armó fuera del hilo principal: sin worker'));
    const e = prenda();
    montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[0].terminar(mallasPlanas(e)); });

    expect(eventos('preparar:fallo')).toEqual([{ fase: 'tela', message: 'La tela no se armó fuera del hilo principal: sin worker' }]);
    expect(eventos('preparar:listo').map((d) => d.fase), 'las mallas sí quedaron, y el BVH del cuerpo no depende de la tela')
      .toEqual(['mallas', 'bvh']);
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
    expect(cuerpo.hornear, 'ni sigue con el cuerpo').not.toHaveBeenCalled();
  });

  it('si alguna pieza no malla no pide la tela: la preparación ya falló en las mallas', async () => {
    const e = prenda();
    montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[0].terminar(mallasPlanas(e).slice(1)); });

    expect(telas.obtenerTela).not.toHaveBeenCalled();
    expect(cuerpo.hornear).not.toHaveBeenCalled();
    expect(eventos('preparar:fallo')).toEqual([{ fase: 'mallas', message: '1 de 3 piezas sin malla' }]);
  });
});

// ─── El BVH del cuerpo ───────────────────────────────────────────────────────

describe('usePrepararTela: el BVH del cuerpo', () => {
  beforeEach(() => { ponerGpu(async () => ({})); });
  afterEach(() => { delete (navigator as { gpu?: unknown }).gpu; });

  /** Monta la prenda, espera los 600 ms y termina el mallado: lo que sigue es la tela y, después, el cuerpo. */
  const prepararHastaLaTela = async (e = prenda()) => {
    const montado = montar(e);
    act(() => { vi.advanceTimersByTime(600); });
    await act(async () => { clientes[0].terminar(mallasPlanas(e)); });
    return montado;
  };
  const delBvh = () => getSolverEvents().filter((ev) => ev.data.fase === 'bvh').map((ev) => ({ kind: ev.kind, ...ev.data }));

  it('después de la tela hornea el cuerpo, arma su BVH solo fuera del hilo, lo guarda con la huella de la malla horneada y avisa', async () => {
    let llegaLaTela = () => {};
    telas.obtenerTela.mockImplementation(() => new Promise((ok) => { llegaLaTela = () => ok({ tela: {}, origen: 'armada' }); }));
    await prepararHastaLaTela();
    expect(cuerpo.hornear, 'mientras se arma la tela, el cuerpo espera').not.toHaveBeenCalled();

    await act(async () => { llegaLaTela(); });
    expect(cuerpo.hornear).toHaveBeenCalledTimes(1);
    expect(bvhs.armarBvhFueraDelHilo, 'en reposo, nunca en el hilo principal').toHaveBeenCalledWith(CUERPO, { soloFueraDelHilo: true });
    // La clave que busca setTslCollisionBody al pulsar: la huella de la malla horneada.
    expect(bvhs.bvhGuardado).toHaveBeenCalledWith(huella(CUERPO));
    expect(bvhs.guardarBvh).toHaveBeenCalledWith(huella(CUERPO), BVH);
    expect(delBvh()).toEqual([{ kind: 'preparar:listo', fase: 'bvh', ms: expect.any(Number) }]);
  });

  it('si el BVH de ese cuerpo ya está guardado no lo vuelve a armar, y avisa que está listo', async () => {
    bvhs.bvhGuardado.mockReturnValue(BVH);
    await prepararHastaLaTela();

    expect(bvhs.armarBvhFueraDelHilo).not.toHaveBeenCalled();
    expect(bvhs.guardarBvh).not.toHaveBeenCalled();
    expect(delBvh()).toEqual([{ kind: 'preparar:listo', fase: 'bvh', ms: expect.any(Number) }]);
  });

  it('sin cuerpo que hornear (el avatar no está a la vista) no arma nada ni avisa del BVH: al pulsar se hace como hoy', async () => {
    cuerpo.hornear.mockResolvedValue(null);
    await prepararHastaLaTela();

    expect(bvhs.armarBvhFueraDelHilo).not.toHaveBeenCalled();
    expect(delBvh()).toEqual([]);
  });

  it.each<[string, () => void, string]>([
    [
      'el BVH no se arma fuera del hilo',
      () => bvhs.armarBvhFueraDelHilo.mockRejectedValue(new Error('El BVH del cuerpo no se armó fuera del hilo principal: sin worker')),
      'El BVH del cuerpo no se armó fuera del hilo principal: sin worker',
    ],
    ['hornear el cuerpo falla', () => cuerpo.hornear.mockRejectedValue(new Error('sin esqueleto')), 'sin esqueleto'],
  ])('si %s, avisa preparar:fallo con la fase bvh y el mensaje, no guarda nada y no lanza', async (_, romper, message) => {
    romper();
    await prepararHastaLaTela();

    expect(bvhs.guardarBvh).not.toHaveBeenCalled();
    expect(delBvh()).toEqual([{ kind: 'preparar:fallo', fase: 'bvh', message }]);
  });

  it('una edición mientras hornea el cuerpo suelta la corrida: no arma su BVH ni avisa', async () => {
    let horneado: (m: unknown) => void = () => {};
    cuerpo.hornear.mockImplementation(() => new Promise((ok) => { horneado = ok; }));
    const { rerender } = await prepararHastaLaTela();
    expect(cuerpo.hornear).toHaveBeenCalledTimes(1);

    rerender({ e: prenda({ densidad: 4 }) });
    await act(async () => { horneado(CUERPO); });
    expect(bvhs.armarBvhFueraDelHilo).not.toHaveBeenCalled();
    expect(delBvh()).toEqual([]);
  });

  it('una edición mientras arma el BVH suelta la corrida: no avisa, pero lo que termina se guarda con la huella de su cuerpo', async () => {
    let llega: (b: unknown) => void = () => {};
    bvhs.armarBvhFueraDelHilo.mockImplementation(() => new Promise((ok) => { llega = ok; }));
    const { rerender } = await prepararHastaLaTela();
    expect(bvhs.armarBvhFueraDelHilo).toHaveBeenCalledTimes(1);

    rerender({ e: prenda({ densidad: 4 }) });
    await act(async () => { llega(BVH); });
    // Una edición de una pieza no cambia el cuerpo: la próxima preparación lo encuentra.
    expect(bvhs.guardarBvh).toHaveBeenCalledWith(huella(CUERPO), BVH);
    expect(delBvh()).toEqual([]);
  });

  // setTslCollisionBody es síncrono: no puede esperar un BVH en vuelo. Tras el
  // clic, hornear aquí (~54 ms en el hilo principal) solo alargaría el
  // clic→primer cuadro. La tela sí se termina: la cascada la espera en vuelo.
  it('pulsar «Simular» (entradas → null) mientras se arma la tela: la tela se termina, pero no hornea el cuerpo ni arma su BVH', async () => {
    let llegaLaTela = () => {};
    telas.obtenerTela.mockImplementation(() => new Promise((ok) => { llegaLaTela = () => ok({ tela: {}, origen: 'armada' }); }));
    const { rerender } = await prepararHastaLaTela();
    rerender({ e: null, simulando: true });

    await act(async () => { llegaLaTela(); });
    expect(eventos('preparar:listo').map((d) => d.fase), 'la tela se dejó terminar y cuenta').toEqual(['mallas', 'tela']);
    expect(cuerpo.hornear).not.toHaveBeenCalled();
    expect(bvhs.armarBvhFueraDelHilo).not.toHaveBeenCalled();
    expect(delBvh()).toEqual([]);
  });

  it('pulsar «Simular» mientras hornea el cuerpo: lo horneado no va al worker', async () => {
    let horneado: (m: unknown) => void = () => {};
    cuerpo.hornear.mockImplementation(() => new Promise((ok) => { horneado = ok; }));
    const { rerender } = await prepararHastaLaTela();
    rerender({ e: null, simulando: true });

    await act(async () => { horneado(CUERPO); });
    expect(bvhs.armarBvhFueraDelHilo).not.toHaveBeenCalled();
    expect(bvhs.guardarBvh).not.toHaveBeenCalled();
    expect(delBvh()).toEqual([]);
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
