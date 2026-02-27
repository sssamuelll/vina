/**
 * Tests for CopilotActionExecutor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActionExecutor } from '../actionExecutor';
import type { CopilotAction } from '../actionTypes';
import type { RootState } from '../../../store';

// Mock dispatch
const mockDispatch = vi.fn();

// Mock state factory
function createMockState(overrides: Partial<RootState['project']> = {}): () => RootState {
  return () => ({
    project: {
      id: 'test-project',
      name: 'Test Project',
      pieces: [
        {
          id: 'piece-1',
          name: 'Front Bodice',
          outline: [
            { type: 'M', values: [0, 0] },
            { type: 'L', values: [100, 0] },
            { type: 'L', values: [100, 200] },
            { type: 'L', values: [0, 200] },
            { type: 'Z', values: [] },
          ],
          internals: [{ id: 'dart-1', type: 'dart', path: [] }],
          seamAllowance: 10,
          position: { x: 0, y: 0 },
          rotation: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'piece-2',
          name: 'Back Bodice',
          outline: [
            { type: 'M', values: [0, 0] },
            { type: 'L', values: [100, 0] },
            { type: 'L', values: [100, 200] },
            { type: 'L', values: [0, 200] },
            { type: 'Z', values: [] },
          ],
          internals: [],
          seamAllowance: 10,
          position: { x: 150, y: 0 },
          rotation: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      seams: [
        {
          id: 'seam-1',
          pieceA: { pieceId: 'piece-1', edgeIndex: 1 },
          pieceB: { pieceId: 'piece-2', edgeIndex: 3 },
          type: 'standard',
        },
      ],
      fabrics: [],
      avatar: {
        id: 'default',
        name: 'Default',
        modelUrl: '',
        measurements: { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 },
      },
      avatarMode: 'model',
      avatarModelUrl: null,
      isDirty: false,
      arrangementOverrides: {},
      ...overrides,
    },
    editor: {
      viewMode: 'split',
      activeTool: 'select',
      selectedPieceIds: ['piece-1'],
      selectedSeamId: null,
      selectedInternalLine: null,
      zoom2D: 1,
      pan2D: { x: 0, y: 0 },
      showSeamAllowance: true,
      defaultSeamAllowanceWidth: 10,
      showGrainlines: true,
      showAnchorPoints: false,
      snapToGrid: true,
      gridSize: 10,
      units: 'mm',
    },
    simulation: {
      simulationState: 'idle',
      pieceFabrics: {},
      defaultFabricId: 'cotton',
      particleDistance: 5,
      pieceParticleDistance: {},
      fitMapMode: 'none',
      fitMapConfig: { stressRange: [0, 100], strainRange: [1.0, 1.2], fitThresholds: [0.8, 1.0], pressureDistance: 0.002 },
      qualityLevel: 'standard',
      autoQuality: true,
      solverTier: 'none',
      frameTimeMs: 0,
      particleCount: 0,
      bodyCollision: false,
      viewMode3D: 'arrange',
      arrangementSnapshot: null,
    },
  } as unknown as RootState);
}

describe('CopilotActionExecutor', () => {
  let executor: ReturnType<typeof createActionExecutor>;
  let getState: () => RootState;

  beforeEach(() => {
    mockDispatch.mockClear();
    getState = createMockState();
    executor = createActionExecutor(mockDispatch, getState);
  });

  describe('Selection Actions', () => {
    it('should select a piece', async () => {
      const action: CopilotAction = { action: 'select_piece', pieceId: 'piece-1' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.pieceId).toBe('piece-1');
      expect(mockDispatch).toHaveBeenCalled();
    });

    it('should fail to select non-existent piece', async () => {
      const action: CopilotAction = { action: 'select_piece', pieceId: 'non-existent' };
      const result = await executor.execute(action);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should clear selection', async () => {
      const action: CopilotAction = { action: 'clear_selection' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.summary).toBe('Cleared selection');
    });

    it('should select pieces by query', async () => {
      const action: CopilotAction = { action: 'select_pieces', query: 'bodice' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.count).toBe(2);
    });
  });

  describe('Piece Operations', () => {
    it('should create a rectangle piece', async () => {
      const action: CopilotAction = {
        action: 'create_piece',
        shape: 'rectangle',
        params: { width: 200, height: 300, name: 'Test Piece' },
      };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Test Piece');
      expect(result.summary).toContain('Created piece');
    });

    it('should fail to create rectangle without dimensions', async () => {
      const action: CopilotAction = {
        action: 'create_piece',
        shape: 'rectangle',
        params: {},
      };
      const result = await executor.execute(action);

      expect(result.success).toBe(false);
      expect(result.error).toContain('width and height');
    });

    it('should duplicate a piece', async () => {
      const action: CopilotAction = { action: 'duplicate_piece', pieceId: 'piece-1' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.originalId).toBe('piece-1');
    });

    it('should rename a piece', async () => {
      const action: CopilotAction = { action: 'rename_piece', pieceId: 'piece-1', name: 'New Name' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.newName).toBe('New Name');
    });

    it('should delete a piece', async () => {
      const action: CopilotAction = { action: 'delete_piece', pieceId: 'piece-1' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.summary).toContain('Deleted');
    });

    it('should mirror a piece on x axis', async () => {
      const action: CopilotAction = { action: 'mirror_piece', pieceId: 'piece-1', axis: 'x' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.axis).toBe('x');
    });

    it('should move a piece', async () => {
      const action: CopilotAction = {
        action: 'move_piece',
        pieceId: 'piece-1',
        position: { x: 50, y: 100 },
      };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.x).toBe(50);
      expect(result.data?.y).toBe(100);
    });

    it('should scale a piece', async () => {
      const action: CopilotAction = { action: 'scale_piece', pieceId: 'piece-1', factor: 1.5 };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.factor).toBe(1.5);
    });
  });

  describe('Geometry Actions', () => {
    it('should move a point', async () => {
      const action: CopilotAction = {
        action: 'move_point',
        pieceId: 'piece-1',
        pointIndex: 0,
        delta: [10, 20],
      };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
    });

    it('should fail to move out-of-range point', async () => {
      const action: CopilotAction = {
        action: 'move_point',
        pieceId: 'piece-1',
        pointIndex: 99,
        delta: [10, 20],
      };
      const result = await executor.execute(action);

      expect(result.success).toBe(false);
      expect(result.error).toContain('out of range');
    });

    it('should add a point on edge', async () => {
      const action: CopilotAction = {
        action: 'add_point',
        pieceId: 'piece-1',
        edgeIndex: 0,
        position: 0.5,
      };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
    });
  });

  describe('Seam Actions', () => {
    it('should create a seam', async () => {
      const action: CopilotAction = {
        action: 'create_seam',
        pieceA: 'piece-1',
        edgeA: 0,
        pieceB: 'piece-2',
        edgeB: 2,
      };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.seamId).toBeDefined();
    });

    it('should delete a seam', async () => {
      const action: CopilotAction = { action: 'delete_seam', seamId: 'seam-1' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
    });

    it('should fail to delete non-existent seam', async () => {
      const action: CopilotAction = { action: 'delete_seam', seamId: 'non-existent' };
      const result = await executor.execute(action);

      expect(result.success).toBe(false);
    });
  });

  describe('Measurement Actions', () => {
    it('should measure edge length', async () => {
      const action: CopilotAction = {
        action: 'measure_edge',
        pieceId: 'piece-1',
        edgeIndex: 0,
      };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBeDefined();
    });

    it('should measure piece area', async () => {
      const action: CopilotAction = {
        action: 'measure_piece_area',
        pieceId: 'piece-1',
      };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.area).toBeDefined();
    });

    it('should compare edges', async () => {
      const action: CopilotAction = {
        action: 'compare_edges',
        edge1: { pieceId: 'piece-1', edgeIndex: 0 },
        edge2: { pieceId: 'piece-2', edgeIndex: 0 },
      };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.difference).toBeDefined();
    });

    it('should measure point-to-point distance', async () => {
      const action: CopilotAction = {
        action: 'measure_distance',
        from: { x: 0, y: 0 },
        to: { x: 100, y: 0 },
      };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.distance).toBe(100);
    });
  });

  describe('Simulation Actions', () => {
    it('should start simulation', async () => {
      const action: CopilotAction = { action: 'start_simulation' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
    });

    it('should fail to start simulation without pieces', async () => {
      getState = createMockState({ pieces: [] });
      executor = createActionExecutor(mockDispatch, getState);

      const action: CopilotAction = { action: 'start_simulation' };
      const result = await executor.execute(action);

      expect(result.success).toBe(false);
      expect(result.error).toContain('without any pieces');
    });

    it('should stop simulation', async () => {
      const action: CopilotAction = { action: 'stop_simulation' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
    });
  });

  describe('View Actions', () => {
    it('should switch view', async () => {
      const action: CopilotAction = { action: 'switch_view', view: '3d' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
    });

    it('should zoom to piece', async () => {
      const action: CopilotAction = { action: 'zoom_to_piece', pieceId: 'piece-1' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
    });
  });

  describe('Project Actions', () => {
    it('should undo', async () => {
      const action: CopilotAction = { action: 'undo' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
    });

    it('should redo', async () => {
      const action: CopilotAction = { action: 'redo' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
    });
  });

  describe('Batch Execution', () => {
    it('should execute multiple actions', async () => {
      const actions: CopilotAction[] = [
        { action: 'select_piece', pieceId: 'piece-1' },
        { action: 'rename_piece', pieceId: 'piece-1', name: 'Renamed' },
      ];
      const result = await executor.executeBatch(actions);

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should continue after failure', async () => {
      const actions: CopilotAction[] = [
        { action: 'select_piece', pieceId: 'non-existent' },
        { action: 'select_piece', pieceId: 'piece-1' },
      ];
      const result = await executor.executeBatch(actions);

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('Message Action', () => {
    it('should handle message action', async () => {
      const action: CopilotAction = { action: 'message', text: 'Hello world' };
      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.data?.text).toBe('Hello world');
    });
  });

  describe('Utility Methods', () => {
    it('should identify dangerous actions', () => {
      expect(executor.requiresConfirmation({ action: 'delete_piece', pieceId: 'x' })).toBe(true);
      expect(executor.requiresConfirmation({ action: 'select_piece', pieceId: 'x' })).toBe(false);
    });

    it('should identify read-only actions', () => {
      expect(executor.isReadOnly({ action: 'measure_edge', pieceId: 'x', edgeIndex: 0 })).toBe(true);
      expect(executor.isReadOnly({ action: 'delete_piece', pieceId: 'x' })).toBe(false);
    });

    it('should identify undoable actions', () => {
      expect(executor.canUndo({ action: 'create_piece', shape: 'rectangle', params: {} })).toBe(true);
      expect(executor.canUndo({ action: 'message', text: 'hi' })).toBe(false);
    });
  });
});
