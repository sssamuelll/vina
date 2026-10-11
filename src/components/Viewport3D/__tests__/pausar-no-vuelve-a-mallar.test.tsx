/**
 * @vitest-environment jsdom
 *
 * Pausar no vuelve a mallar (2026-10-11). El arranque en caliente de
 * `useMeshing` (re-mallar tras una edición de cotas sin tocar la topología)
 * escuchaba también `simulationState`: pausar o reanudar, sin una sola edición,
 * contaba como «edición de cotas» —`classifyEdit` de dos listas iguales da
 * 'dimension'—, volvía a mallar todas las piezas medio segundo después y
 * entregaba mallas nuevas. Mallas nuevas son `placedMeshes` nuevas, y la
 * cascada del solver vuelve a vestir desde cero: un segundo reinicio, encima
 * del de la pausa, que llegaba tarde y mataba el solver recién arrancado.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';

const mallador = vi.hoisted(() => ({ meshAllPieces: vi.fn() }));

vi.mock('../../../utils/cloth/simulationInitClient', () => ({
  SimulationInitClient: class {
    onProgress: (() => void) | null = null;
    meshAllPieces = mallador.meshAllPieces;
    dispose = vi.fn();
  },
}));

import { useMeshing } from '../useMeshing';
import simulationReducer, { pauseSimulation, startSimulation } from '../../../store/simulationSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import type { PatternPiece } from '../../../types/types';
import type { SimulationClients } from '../useSimulationLifecycle';

const pieza = {
  id: 'a',
  name: 'A',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'Z', values: [] },
  ],
} as unknown as PatternPiece;

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('pausar no vuelve a mallar', () => {
  it('correr → pausa → correr, sin tocar las piezas: una sola malla, la misma', async () => {
    mallador.meshAllPieces.mockImplementation(async () => [
      { pieceId: 'a', vertices: new Float32Array(9), triIds: new Int32Array([0, 1, 2]) },
    ]);
    const store = configureStore({ reducer: { simulation: simulationReducer, copilotUI: copilotUIReducer } });
    store.dispatch(startSimulation());
    const pieces = [pieza];
    const clientsRef = { current: { cpu: null, wasm: null, gpu: null, neural: null } as SimulationClients };
    const stretchingIdsRef = { current: null as Int32Array | null };
    const { result } = renderHook(() => useMeshing({ pieces, clientsRef, stretchingIdsRef }), {
      wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
    const primera = result.current;

    vi.useFakeTimers();
    act(() => { store.dispatch(pauseSimulation()); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    act(() => { store.dispatch(startSimulation()); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(mallador.meshAllPieces, 'cambiar el estado de la simulación no es editar el patrón').toHaveBeenCalledTimes(1);
    expect(result.current, 'las mallas son las mismas: la cascada no tiene por qué volver a vestir').toBe(primera);
    expect(store.getState().simulation.isWarmStarting).toBe(false);
  });

  it('pausar mientras se malla por primera vez no deja la simulación sin mallas', async () => {
    // El primer mallado tarda (5 piezas de María a 5 mm: segundos). Pausar en
    // ese rato limpiaba el efecto —cancelaba el mallado en vuelo— y al volver
    // el efecto lo daba por «edición de cotas» y no mallaba: sin mallas no hay
    // cascada, y «Simular» ya no hacía nada.
    let entregar: () => void = () => {};
    mallador.meshAllPieces.mockImplementation(() => new Promise((ok) => {
      entregar = () => ok([{ pieceId: 'a', vertices: new Float32Array(9), triIds: new Int32Array([0, 1, 2]) }]);
    }));
    const store = configureStore({ reducer: { simulation: simulationReducer, copilotUI: copilotUIReducer } });
    store.dispatch(startSimulation());
    const pieces = [pieza];
    const clientsRef = { current: { cpu: null, wasm: null, gpu: null, neural: null } as SimulationClients };
    const stretchingIdsRef = { current: null as Int32Array | null };
    const { result } = renderHook(() => useMeshing({ pieces, clientsRef, stretchingIdsRef }), {
      wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
    });
    await waitFor(() => expect(mallador.meshAllPieces).toHaveBeenCalledTimes(1));

    act(() => { store.dispatch(pauseSimulation()); });
    act(() => { store.dispatch(startSimulation()); });
    await act(async () => { entregar(); });

    await waitFor(() => expect(result.current, 'la malla del primer «Simular» llega').toHaveLength(1));
  });
});
