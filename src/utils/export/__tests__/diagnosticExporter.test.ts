import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RootState } from '../../../store';
import type { RapidUndoAfterAgentEvent } from '../../../store/historyTimeline';
import {
  clearToolExecutions,
  getToolExecutions,
  pushToolExecution,
} from '../../../copilot/debug/toolExecutionTracker';
import { clearTrackedErrors, getTrackedErrors } from '../../errorTracker';
import { downloadBlob } from '../turntableRenderer';
import {
  base64ToFloat32,
  buildDiagnosticBundle,
  CLOTH_SNAPSHOT_MAX_VERTICES,
  downloadDiagnosticBundle,
  float32ToBase64,
  type DiagnosticSources,
} from '../diagnosticExporter';

vi.mock('../turntableRenderer', () => ({ downloadBlob: vi.fn() }));

const state = {
  project: { id: 'project-1', pieces: [{ id: 'piece-1' }] },
  avatar: { selectedProfileId: 'maria' },
  simulation: { solverTier: 'webgpu', simulationState: 'running' },
  inspector: {
    lastSolverError: { error: 'worker failed', timestamp: 20 },
    seamResolutionErrors: [{
      seamId: 'seam-1',
      reason: 'empty-match',
      message: 'No cosió',
      timestamp: 21,
    }],
  },
} as unknown as Pick<
  RootState,
  'project' | 'avatar' | 'simulation' | 'inspector'
>;

function sources(debugEnabled: boolean): DiagnosticSources {
  return {
    getHistory: vi.fn(() => ({ past: [], future: [], timeline: [] })),
    getTrackedErrors: vi.fn(() => [{ message: 'boom', timestamp: 30 }]),
    getToolExecutions: vi.fn(() => [{
      toolName: 'sewWalking',
      args: { pieceId: 'piece-1' },
      success: false,
      error: 'mismatch',
      timestamp: 10,
      durationMs: 4,
    }]),
    getActiveSolverTier: vi.fn(() => 'none'),
    getSolverEvents: vi.fn(() => [{
      kind: 'tier:failed',
      timestamp: 50,
      generation: 3,
      data: { tier: 'webgpu', phase: 'timeout', message: 'TSL solver init timed out (12000ms)', stale: false },
    }]),
    getAppliedSolverConfig: vi.fn(() => ({ tier: 'wasm', init: { substeps: 8 }, postInit: { wind: null, elastics: 0 } })),
    getClothGeometry: vi.fn(() => null),
    isDebugEnabled: vi.fn(() => debugEnabled),
    getDebugRecords: vi.fn(() => [{ id: 'verbose-1' }]),
  } as unknown as DiagnosticSources;
}

describe('bundle de diagnóstico puro', () => {
  beforeEach(clearToolExecutions);

  it('exporta slices, inspector y active/last-selected por separado', () => {
    const off = sources(false);
    const bundle = buildDiagnosticBundle(
      state,
      '2026-08-27T10:11:12.000Z',
      off,
    );

    expect(bundle).toMatchObject({
      exportedAt: '2026-08-27T10:11:12.000Z',
      project: state.project,
      avatar: state.avatar,
      simulation: state.simulation,
      solver: {
        activeTier: 'none',
        lastSelectedTier: 'webgpu',
      },
      inspector: state.inspector,
      errors: [{ message: 'boom', timestamp: 30 }],
      toolExecutions: [expect.objectContaining({ toolName: 'sewWalking' })],
      agentDebugRecords: [],
    });
    // `solver.config` era `simulation` repetido byte a byte; con
    // `appliedConfig` en el bundle habría tres cosas llamadas config.
    expect(bundle.solver).not.toHaveProperty('config');
    expect(bundle.solver.appliedConfig).toEqual({ tier: 'wasm', init: { substeps: 8 }, postInit: { wind: null, elastics: 0 } });
    expect(bundle.solver.meshManifest).toBeNull();
    expect(off.getDebugRecords).not.toHaveBeenCalled();
    expect(bundle).not.toHaveProperty('version');
    expect(bundle).not.toHaveProperty('traceId');
  });

  it('lleva el ring de eventos del solver en solver.events', () => {
    const bundle = buildDiagnosticBundle(state, undefined, sources(false));
    expect(bundle.solver.events).toEqual([
      expect.objectContaining({
        kind: 'tier:failed',
        generation: 3,
        data: expect.objectContaining({ tier: 'webgpu' }),
      }),
    ]);
  });

  it('lleva el manifiesto por pieza de la geometría registrada', () => {
    const s = sources(false);
    s.getClothGeometry = vi.fn(() => ({
      geometry: { attributes: { position: { array: new Float32Array(6 * 3) } } } as never,
      manifest: [
        { pieceId: 'a', vertexOffset: 0, vertexCount: 4, triCount: 2 },
        { pieceId: 'b', vertexOffset: 4, vertexCount: 2, triCount: 0 },
      ],
    }));
    const bundle = buildDiagnosticBundle(state, undefined, s);
    expect(bundle.solver.meshManifest).toEqual([
      { pieceId: 'a', vertexOffset: 0, vertexCount: 4, triCount: 2 },
      { pieceId: 'b', vertexOffset: 4, vertexCount: 2, triCount: 0 },
    ]);
  });

  it('incluye records verbosos únicamente con el gate encendido', () => {
    const on = sources(true);

    expect(buildDiagnosticBundle(state, undefined, on).agentDebugRecords)
      .toEqual([{ id: 'verbose-1' }]);
    expect(on.getDebugRecords).toHaveBeenCalledTimes(1);
  });

  it('incluye rapidUndoAfterAgent en history sin reclasificarlo como error', () => {
    const event: RapidUndoAfterAgentEvent = {
      kind: 'rapidUndoAfterAgent',
      timestamp: 11_000,
      toolName: 'modifyEdge',
      actionType: 'project/updatePiece',
      actionTimestamp: 1_000,
      lastMutationAt: 1_000,
      latencyMs: 10_000,
    };
    const diagnosticSources = sources(false);
    diagnosticSources.getHistory = vi.fn(() => ({
      past: [],
      future: [],
      timeline: [event],
    }));

    const bundle = buildDiagnosticBundle(state, undefined, diagnosticSources);

    expect(bundle.history.timeline).toEqual([event]);
    expect(bundle.errors).toEqual([{ message: 'boom', timestamp: 30 }]);
    expect(bundle.toolExecutions).toEqual([
      expect.objectContaining({
        toolName: 'sewWalking',
        success: false,
        error: 'mismatch',
      }),
    ]);
  });

  it('con debug apagado no exporta el mensaje del LLM guardado por presentToUser', () => {
    const sentinel = 'SECRETO_LLM_BUNDLE_DEBUG_OFF_27_AGOSTO';
    pushToolExecution({
      toolName: 'presentToUser',
      args: { message: sentinel, awaiting: 'confirmation' },
      success: true,
      error: null,
      timestamp: 40,
      durationMs: 0,
    });
    const off = sources(false);
    off.getToolExecutions = getToolExecutions;

    const bundle = buildDiagnosticBundle(state, undefined, off);

    expect(bundle.agentDebugRecords).toEqual([]);
    expect(bundle.toolExecutions).toEqual([
      expect.objectContaining({
        toolName: 'presentToUser',
        args: { awaiting: 'confirmation' },
      }),
    ]);
    expect(JSON.stringify(bundle)).not.toContain(sentinel);
  });
});

function geometryOf(
  positions: Float32Array,
  manifest: Array<{ pieceId: string; vertexOffset: number; vertexCount: number; triCount: number }>,
) {
  return { geometry: { attributes: { position: { array: positions } } } as never, manifest };
}

describe('foto física de la tela', () => {
  it('base64 ↔ Float32Array es exacto', () => {
    const arr = new Float32Array([0, 1.5, -2.25, 3.14159, 1e-7]);
    expect(base64ToFloat32(float32ToBase64(arr))).toEqual(arr);
  });

  it('exporta las posiciones en base64 y el manifiesto corta cada pieza en su rango', () => {
    const positions = new Float32Array([0, 0, 0,  1, 0, 0,  0, 1, 0,   5, 5, 5,  6, 5, 5]);
    const s = sources(false);
    s.getClothGeometry = vi.fn(() => geometryOf(positions, [
      { pieceId: 'a', vertexOffset: 0, vertexCount: 3, triCount: 1 },
      { pieceId: 'b', vertexOffset: 3, vertexCount: 2, triCount: 0 },
    ]));

    const snap = buildDiagnosticBundle(state, undefined, s).solver.clothSnapshot!;

    expect(snap).toMatchObject({ vertexCount: 5, encoding: 'float32-base64', positionsOmitted: false, manifestMismatch: false });
    const decoded = base64ToFloat32(snap.positions!);
    expect(decoded).toEqual(positions);
    expect(Array.from(decoded.subarray(3 * 3, 5 * 3))).toEqual([5, 5, 5, 6, 5, 5]);
  });

  it('por encima del techo omite las posiciones pero conserva el conteo', () => {
    const s = sources(false);
    s.getClothGeometry = vi.fn(() => geometryOf(new Float32Array((CLOTH_SNAPSHOT_MAX_VERTICES + 1) * 3), [
      { pieceId: 'a', vertexOffset: 0, vertexCount: CLOTH_SNAPSHOT_MAX_VERTICES + 1, triCount: 0 },
    ]));
    const snap = buildDiagnosticBundle(state, undefined, s).solver.clothSnapshot!;
    expect(snap).toMatchObject({ vertexCount: CLOTH_SNAPSHOT_MAX_VERTICES + 1, positions: null, positionsOmitted: true });
  });

  it('marca manifestMismatch cuando el manifiesto no suma los vértices del buffer', () => {
    const s = sources(false);
    s.getClothGeometry = vi.fn(() => geometryOf(new Float32Array(4 * 3), [
      { pieceId: 'a', vertexOffset: 0, vertexCount: 3, triCount: 1 },
    ]));
    expect(buildDiagnosticBundle(state, undefined, s).solver.clothSnapshot?.manifestMismatch).toBe(true);
  });

  it('sin geometría registrada la foto es null', () => {
    expect(buildDiagnosticBundle(state, undefined, sources(false)).solver.clothSnapshot).toBeNull();
  });
});

describe('downloadDiagnosticBundle — red en el botón', () => {
  beforeEach(() => {
    clearTrackedErrors();
    vi.mocked(downloadBlob).mockClear();
  });

  it('si la serialización lanza, reintenta sin la foto y registra el fallo', () => {
    const s = sources(false);
    s.getClothGeometry = vi.fn(() => geometryOf(new Float32Array(3), [{ pieceId: 'a', vertexOffset: 0, vertexCount: 1, triCount: 0 }]));
    const stringify = vi.spyOn(JSON, 'stringify');
    stringify.mockImplementationOnce(() => { throw new TypeError('Do not know how to serialize a BigInt'); });

    downloadDiagnosticBundle(state, s);

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const blob = vi.mocked(downloadBlob).mock.calls[0][0];
    expect(blob.size).toBeGreaterThan(0);
    expect(getTrackedErrors()).toContainEqual(expect.objectContaining({ source: 'diagnosticExporter' }));
    stringify.mockRestore();
  });
});
