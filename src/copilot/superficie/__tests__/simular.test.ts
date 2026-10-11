// @vitest-environment jsdom
// jsdom por `document.visibilityState`: con Vina oculta, `simulate` lo dice en vez de esperar.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { pauseSimulation } from '../../../store/simulationSlice';
import { setViewMode } from '../../../store/editorSlice';
import {
  beginCascade, clearActiveSolverTier, clearSolverEvents, latirLaSimulacion, pushSolverEvent, registerClothGeometry, setActiveSolverTier,
} from '../../../utils/cloth/solverRuntimeTracker';
import { ejecutarVerbo } from '../ejecutar';
import { VERBOS_DE_VESTIR } from '../verbos/vestir';
import type { ContextoDeVerbo, Recibo } from '../tipos';
import { suelta, tienda } from './fixtures';

const ARISTAS = { stretchingIds: new Int32Array([0, 1]), stretchingLengths: new Float32Array([0.1]) };

/** Una tela de 20 vértices de una sola pieza; `mover` la desplaza en x. */
function tela() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(60), 3));
  registerClothGeometry(geometry, [{ pieceId: 'a', vertexOffset: 0, vertexCount: 20, triCount: 0 }]);
  const pos = geometry.getAttribute('position').array as Float32Array;
  return { mover: (m: number) => { for (let i = 0; i < 20; i++) pos[3 * i] += m; } };
}

/** El simulador de mentira: cada 250 ms dibuja `cuadros` cuadros y mueve la tela `mm(k)` en total. */
async function correr(pasos: number, cuadros: number, mm: (k: number) => number, mover: (m: number) => void, cada?: (k: number) => void) {
  for (let k = 0; k < pasos; k++) {
    cada?.(k);
    mover(mm(k) / 1000);
    for (let c = 0; c < cuadros; c++) latirLaSimulacion(ARISTAS);
    await vi.advanceTimersByTimeAsync(250);
  }
}

const simular = (ctx: ContextoDeVerbo, args: unknown) => ejecutarVerbo(VERBOS_DE_VESTIR, 'simulate', args, ctx);
const recibo = async (p: ReturnType<typeof simular>) => {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

beforeEach(() => { vi.useFakeTimers(); clearSolverEvents(); });
afterEach(() => {
  vi.useRealTimers();
  registerClothGeometry(null, []);
  clearActiveSolverTier();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('simulate', () => {
  it('arranca, y responde cuando la tela se queda quieta, con el ajuste', async () => {
    const { store, ctx } = tienda([suelta('a', 'Delantero', { category: 'bodice' })]);
    const { mover } = tela();
    setActiveSolverTier('webgpu');
    const p = simular(ctx, { action: 'start' });
    // 8 lecturas moviéndose 3 mm (0,1 mm por cuadro), luego quieta (0,003 mm por cuadro).
    await correr(16, 30, k => (k < 8 ? 3 : 0.1), mover);
    const r = await recibo(p);
    expect(r.done).toBe(true);
    expect(r.measure).toMatchObject({ state: 'running', tier: 'webgpu', settled: true });
    expect(r.measure.frames as number).toBeGreaterThanOrEqual(180);
    expect(r.measure.fit).toMatchObject({ available: true });
    expect(store.getState().simulation).toMatchObject({ simulationState: 'running', viewMode3D: 'simulate' });
  });

  it('con Vina oculta no espera el plazo: lo dice en segundos', async () => {
    const { ctx } = tienda([suelta('a')]);
    tela();
    setActiveSolverTier('webgpu');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const p = simular(ctx, { action: 'start' });
    await vi.advanceTimersByTimeAsync(3_000);
    const r = await recibo(p);
    expect(r.done).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/hidden.*front/i);
  });

  it('si la tela deja de llegar sin estar oculta, también lo dice', async () => {
    const { ctx } = tienda([suelta('a')]);
    const { mover } = tela();
    setActiveSolverTier('wasm');
    const p = simular(ctx, { action: 'start' });
    await correr(4, 30, () => 3, mover);
    await vi.advanceTimersByTimeAsync(11_000);
    const r = await recibo(p);
    expect(r.done).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/stopped advancing.*10 s/);
  });

  it('si no llega ningún cuadro, dice que no arrancó y lo que dijo el solver en esta corrida, no en una vieja', async () => {
    const { ctx } = tienda([suelta('a')]);
    pushSolverEvent('tier:failed', { tier: 'webgpu', reason: 'de una corrida vieja' });
    const p = simular(ctx, { action: 'start' });
    // La cascada de esta corrida, como la abre el ciclo de vida al arrancar.
    beginCascade();
    pushSolverEvent('start:failed', { tier: 'webgpu', reason: 'adapter is null' });
    await vi.advanceTimersByTimeAsync(31_000);
    const r = await recibo(p);
    expect(r.done).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/did not start within 30 s.*adapter is null/);
    expect(r.warnings.join(' ')).not.toMatch(/corrida vieja/);
  });

  it('un fallo de una corrida vieja no se cita como el de esta (revisión final)', async () => {
    const { ctx } = tienda([suelta('a')]);
    pushSolverEvent('tier:failed', { tier: 'webgpu', reason: 'de una corrida vieja' });
    const p = simular(ctx, { action: 'start' });
    beginCascade();
    await vi.advanceTimersByTimeAsync(31_000);
    const r = await recibo(p);
    expect(r.warnings.join(' ')).toMatch(/did not start within 30 s \(no solver reported an error\)/);
  });

  it('dos lecturas de la misma tela no cuentan como quietud (en TSL, sin readback entre ellas)', async () => {
    const { ctx } = tienda([suelta('a')]);
    const { mover } = tela();
    setActiveSolverTier('webgpu');
    const p = simular(ctx, { action: 'start', wait_seconds: 5 });
    // Latidos sin que la malla cambie: la tela no llegó, no está quieta.
    await correr(24, 30, () => 0, mover);
    const r = await recibo(p);
    expect(r.done).toBe(false);
    expect(r.measure.settled).toBe(false);
  });

  it('pasado el plazo sin quietud, lo dice con el tier y el ritmo', async () => {
    const { ctx } = tienda([suelta('a')]);
    const { mover } = tela();
    setActiveSolverTier('wasm');
    const p = simular(ctx, { action: 'start', wait_seconds: 5 });
    await correr(24, 30, () => 3, mover);
    const r = await recibo(p);
    expect(r.done).toBe(false);
    expect(r.measure).toMatchObject({ settled: false, tier: 'wasm' });
    expect(r.warnings.join(' ')).toMatch(/did not settle within 5 s.*wasm.*frames per second.*0\.1 mm per frame/);
  });

  it('si María la para mientras espera, lo dice', async () => {
    const { store, ctx } = tienda([suelta('a')]);
    const { mover } = tela();
    setActiveSolverTier('webgpu');
    const p = simular(ctx, { action: 'start' });
    await correr(4, 30, () => 3, mover, k => { if (k === 3) store.dispatch(pauseSimulation()); });
    const r = await recibo(p);
    expect(r.done).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/stopped while waiting/);
  });

  it('sin esperar, responde al arrancar', async () => {
    const { store, ctx } = tienda([suelta('a')]);
    const r = await recibo(simular(ctx, { action: 'start', wait: false }));
    expect(r.done).toBe(true);
    expect(store.getState().simulation.simulationState).toBe('running');
  });

  it('desde 2D pasa a Split', async () => {
    const { store, ctx } = tienda([suelta('a')]);
    store.dispatch(setViewMode('2d'));
    const r = await recibo(simular(ctx, { action: 'start', wait: false }));
    expect(store.getState().editor.viewMode).toBe('split');
    expect(r.measure).toMatchObject({ view_changed: true });
  });

  it('stop la pausa', async () => {
    const { store, ctx } = tienda([suelta('a')], [], {}, {}, { simulationState: 'running' });
    const r = await recibo(simular(ctx, { action: 'stop' }));
    expect(r).toMatchObject({ done: true, measure: { state: 'paused' } });
    expect(store.getState().simulation.simulationState).toBe('paused');
  });

  it('sin piezas que simular no arranca, y dice por qué', async () => {
    const { ctx } = tienda([suelta('a', 'a', { active: false })]);
    const r = await recibo(simular(ctx, { action: 'start' }));
    expect(r).toMatchObject({ done: false, warnings: ['there are no pieces to simulate: a (inactive)'] });
  });

  it('con todas las piezas ocultas en 3D tampoco: no espera 30 s para decirlo (revisión final)', async () => {
    const { ctx } = tienda([suelta('a')], [], {}, {}, { hiddenPieceIds: ['a'] });
    const r = await recibo(simular(ctx, { action: 'start' }));
    expect(r).toMatchObject({ done: false, warnings: ['there are no pieces to simulate: a (hidden in 3D)'] });
  });
});
