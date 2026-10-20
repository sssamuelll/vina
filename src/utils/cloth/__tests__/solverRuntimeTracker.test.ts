import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BufferGeometry } from 'three';
import {
  beginCascade,
  clearActiveSolverTier,
  clearSolverEvents,
  coalesceSolverEvent,
  currentCascadeGeneration,
  getAppliedSolverConfig,
  getClothGeometry,
  getSolverEvents,
  aristasDeLaTela,
  latidosDeLaSimulacion,
  latirLaSimulacion,
  marcarPrimerCuadro,
  pushSolverEvent,
  reemplazarEventoDeLaFase,
  registerClothGeometry,
  setActiveSolverTier,
  setAppliedSolverConfig,
  SOLVER_EVENTS_MAX,
} from '../solverRuntimeTracker';
import { clearJournal, getJournal } from '../../telemetry/journal';

describe('solverRuntimeTracker — ring de eventos', () => {
  beforeEach(clearSolverEvents);

  it('beginCascade incrementa la generación y los eventos la llevan por defecto', () => {
    const g1 = beginCascade();
    pushSolverEvent('cascade:start');
    const g2 = beginCascade();
    pushSolverEvent('tier:selected', { tier: 'wasm' });

    expect(g2).toBe(g1 + 1);
    expect(currentCascadeGeneration()).toBe(g2);
    const [first, second] = getSolverEvents();
    expect(first).toMatchObject({ kind: 'cascade:start', generation: g1, data: {} });
    expect(second).toMatchObject({ kind: 'tier:selected', generation: g2, data: { tier: 'wasm' } });
    expect(typeof second.timestamp).toBe('number');
  });

  it('un evento con generación explícita conserva la suya aunque haya una corrida más nueva', () => {
    const old = beginCascade();
    beginCascade();
    pushSolverEvent('tier:failed', { tier: 'webgpu', stale: true }, old);
    expect(getSolverEvents()[0].generation).toBe(old);
  });

  it('conserva como máximo SOLVER_EVENTS_MAX entradas, desalojando la más vieja', () => {
    for (let i = 0; i < SOLVER_EVENTS_MAX + 5; i++) {
      pushSolverEvent('tier:diagnostic', { i });
    }
    const events = getSolverEvents();
    expect(events).toHaveLength(SOLVER_EVENTS_MAX);
    expect(events[0].data.i).toBe(5);
    expect(events[events.length - 1].data.i).toBe(SOLVER_EVENTS_MAX + 4);
  });
});

describe('solverRuntimeTracker — coalescencia de diagnósticos repetidos', () => {
  beforeEach(clearSolverEvents);

  it('coalesceSolverEvent sobreescribe el último evento si coincide kind+tier+code, y añade si no', () => {
    coalesceSolverEvent('tier:diagnostic', { tier: 'wasm', code: 'nan_reset', count: 3, cumulative: 3 });
    coalesceSolverEvent('tier:diagnostic', { tier: 'wasm', code: 'nan_reset', count: 5, cumulative: 8 });
    coalesceSolverEvent('tier:diagnostic', { tier: 'wasm', code: 'self_collision_disabled' });
    coalesceSolverEvent('tier:diagnostic', { tier: 'wasm', code: 'nan_reset', count: 1, cumulative: 9 });

    const events = getSolverEvents();
    expect(events.map(e => e.data.code)).toEqual(['nan_reset', 'self_collision_disabled', 'nan_reset']);
    expect(events[0].data.cumulative).toBe(8);
  });
});

describe('solverRuntimeTracker — un evento por fase (el preparador en reposo)', () => {
  beforeEach(clearSolverEvents);

  it('reemplazarEventoDeLaFase deja solo el último del mismo kind y la misma fase, y no toca lo demás', () => {
    pushSolverEvent('tier:selected', { tier: 'wasm' });
    reemplazarEventoDeLaFase('preparar:listo', { fase: 'mallas', ms: 1 });
    reemplazarEventoDeLaFase('preparar:listo', { fase: 'tela', ms: 2 });
    pushSolverEvent('preparar:fallo', { fase: 'mallas', message: 'x' });
    reemplazarEventoDeLaFase('preparar:listo', { fase: 'mallas', ms: 3 });

    expect(getSolverEvents().map((e) => ({ kind: e.kind, ...e.data }))).toEqual([
      { kind: 'tier:selected', tier: 'wasm' },
      { kind: 'preparar:listo', fase: 'tela', ms: 2 },
      { kind: 'preparar:fallo', fase: 'mallas', message: 'x' },
      { kind: 'preparar:listo', fase: 'mallas', ms: 3 },
    ]);
  });

  // Lo que se prepara en reposo no es de la corrida anterior: con la generación
  // de la última cascada, una caja negra exportada lo leería como parte de ella.
  it('lo del preparador lleva la generación 0, de ninguna cascada, aunque ya haya corrido una', () => {
    beginCascade();
    reemplazarEventoDeLaFase('preparar:listo', { fase: 'mallas', ms: 1 });
    pushSolverEvent('tier:selected', { tier: 'wasm' });

    expect(getSolverEvents().map((e) => [e.kind, e.generation])).toEqual([
      ['preparar:listo', 0],
      ['tier:selected', currentCascadeGeneration()],
    ]);
    expect(currentCascadeGeneration(), 'beginCascade empieza en 1: el 0 no es de nadie').toBeGreaterThan(0);
  });
});

describe('solverRuntimeTracker — config aplicada y geometría retenida', () => {
  it('la config aplicada se limpia con clearActiveSolverTier', () => {
    setActiveSolverTier('wasm');
    setAppliedSolverConfig({ tier: 'wasm', init: { substeps: 8 }, postInit: { wind: null } });
    expect(getAppliedSolverConfig()).toEqual({ tier: 'wasm', init: { substeps: 8 }, postInit: { wind: null } });

    clearActiveSolverTier();
    expect(getAppliedSolverConfig()).toBeNull();
  });

  it('la geometría registrada NO se limpia con clearActiveSolverTier: la reemplaza la siguiente', () => {
    const geo = new BufferGeometry();
    registerClothGeometry(geo, [{ pieceId: 'a', vertexOffset: 0, vertexCount: 3, triCount: 1 }]);
    clearActiveSolverTier();
    expect(getClothGeometry()?.geometry).toBe(geo);

    registerClothGeometry(null, []);
    expect(getClothGeometry()).toBeNull();
  });
});

describe('solverRuntimeTracker — espejo en la bitácora', () => {
  beforeEach(() => {
    clearSolverEvents();
    clearJournal();
  });

  it('pushSolverEvent al crear fila nueva espeja solver/<kind> con generation', () => {
    const gen = beginCascade();
    pushSolverEvent('tier:selected', { tier: 'wasm' });

    const solverEvents = getJournal().events.filter((e) => e.kind === 'solver');
    expect(solverEvents).toHaveLength(1);
    expect(solverEvents[0]).toMatchObject({ kind: 'solver', name: 'tier:selected', data: { generation: gen } });
  });

  it('coalesceSolverEvent actualizando en sitio no añade otro espejo', () => {
    coalesceSolverEvent('tier:diagnostic', { tier: 'wasm', code: 'nan_reset', count: 1 });
    coalesceSolverEvent('tier:diagnostic', { tier: 'wasm', code: 'nan_reset', count: 2 });

    const events = getSolverEvents();
    expect(events).toHaveLength(1); // la segunda llamada actualizó en sitio, no creó fila

    const solverEvents = getJournal().events.filter((e) => e.kind === 'solver');
    expect(solverEvents).toHaveLength(1); // un solo espejo — solo la fila nueva de la primera llamada
  });

  it('coalesceSolverEvent SIN coincidencia delega en pushSolverEvent y ese camino sí espeja', () => {
    coalesceSolverEvent('tier:diagnostic', { tier: 'wasm', code: 'nan_reset' });
    coalesceSolverEvent('tier:diagnostic', { tier: 'wasm', code: 'self_collision_disabled' }); // code distinto → fila nueva en el tracker

    expect(getSolverEvents()).toHaveLength(2); // el tracker sí distingue por code

    // La bitácora funde por kind/name (no mira data.code): dos pushJournal de
    // 'solver'/'tier:diagnostic' en la misma ráfaga son UNA entrada con n:2 —
    // eso prueba que el espejo disparó las dos veces (si solo una hubiera
    // espejado, n sería undefined).
    const solverEvents = getJournal().events.filter((e) => e.kind === 'solver');
    expect(solverEvents).toHaveLength(1);
    expect(solverEvents[0].n).toBe(2);
  });
});

describe('solverRuntimeTracker — el latido de la tela (IA 1b-2)', () => {
  it('cada latido cuenta un cuadro de tela nueva y deja a la vista las aristas del solver', () => {
    const antes = latidosDeLaSimulacion();
    const aristas = { stretchingIds: new Int32Array([0, 1]), stretchingLengths: new Float32Array([0.1]) };
    latirLaSimulacion(aristas);
    latirLaSimulacion(aristas);
    expect(latidosDeLaSimulacion()).toBe(antes + 2);
    expect(aristasDeLaTela()).toBe(aristas);
    latirLaSimulacion(null);
    expect(aristasDeLaTela()).toBeNull();
  });

  it('el primer latido de cada corrida se cuenta una vez; el evento lo marca quien sabe que ya se ve', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      clearSolverEvents();
      const primeros = () => getSolverEvents().filter((e) => e.kind === 'tela:primer-cuadro').map((e) => e.data);
      vi.setSystemTime(10_000);
      beginCascade();
      expect(latirLaSimulacion(null)).toBe(true);
      expect(latirLaSimulacion(null)).toBe(false);
      expect(primeros(), 'latir no lo marca: en WebGPU el cuadro apenas se envió').toEqual([]);
      vi.setSystemTime(10_250);
      marcarPrimerCuadro({ gpuMs: 180 });
      expect(primeros(), 'los ms cuentan desde su cascada').toEqual([{ ms: 250, gpuMs: 180 }]);

      vi.setSystemTime(20_000);
      beginCascade();
      expect(latirLaSimulacion(null), 'una corrida nueva vuelve a empezar').toBe(true);
      vi.setSystemTime(20_040);
      marcarPrimerCuadro();
      expect(primeros().at(-1), 'y mide desde su propia cascada').toEqual({ ms: 40 });
    } finally {
      vi.useRealTimers();
    }
  });
});
