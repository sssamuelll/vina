/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for CopilotContext generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateCopilotContext,
  serializeCopilotContext,
  generateContextDelta,
} from '../copilotContext';
import { clearActions, trackAction } from '../recentActionsTracker';
import type { RootState } from '../../../store';

// Mock state factory
function createMockState(overrides: Partial<any> = {}): RootState {
  return {
    project: {
      id: 'test-project',
      name: 'Test Project',
      pieces: [
        {
          id: 'piece-1',
          name: 'Front Bodice',
          category: 'bodice',
          outline: [
            { type: 'M', values: [0, 0] },
            { type: 'L', values: [200, 0] },
            { type: 'L', values: [200, 300] },
            { type: 'L', values: [0, 300] },
            { type: 'Z', values: [] },
          ],
          internals: [{ id: 'dart-1', type: 'dart', path: [] }],
          seamAllowance: 10,
          position: { x: 0, y: 0 },
          rotation: 0,
          mirrored: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'piece-2',
          name: 'Back Bodice',
          category: 'bodice',
          outline: [
            { type: 'M', values: [0, 0] },
            { type: 'L', values: [200, 0] },
            { type: 'L', values: [200, 300] },
            { type: 'L', values: [0, 300] },
            { type: 'Z', values: [] },
          ],
          internals: [],
          seamAllowance: 10,
          position: { x: 250, y: 0 },
          rotation: 0,
          mirrored: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      seams: [
        {
          id: 'seam-1',
          pieceA: { pieceId: 'piece-1', edgeName: 'sideSeam' },
          pieceB: { pieceId: 'piece-2', edgeName: 'sideSeam' },
          type: 'standard',
        },
      ],
      fabrics: [
        { id: 'cotton', name: 'Cotton', weight: 150, color: '#fff', stretch: 0, stiffness: 0.5, friction: 0.5 },
      ],
      avatar: {
        id: 'default',
        name: 'Default',
        modelUrl: '',
        measurements: { height: 170, chest: 88, waist: 70, hips: 94, shoulder: 40, armLength: 60, inseam: 78 },
      },
      avatarMode: 'model',
      avatarModelUrl: null,
      isDirty: false,
      arrangementOverrides: {},
      ...overrides.project,
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
      ...overrides.editor,
    },
    simulation: {
      simulationState: 'idle',
      pieceFabrics: { 'piece-1': 'cotton' },
      defaultFabricId: 'cotton',
      particleDistance: 5,
      pieceParticleDistance: {},
      fitMapMode: 'none',
      fitMapConfig: { stressRange: [0, 100], strainRange: [1.0, 1.2], fitThresholds: [0.8, 1.0], pressureDistance: 0.002 },
      qualityLevel: 'standard',
      autoQuality: true,
      solverTier: 'wasm',
      frameTimeMs: 0,
      particleCount: 0,
      bodyCollision: false,
      viewMode3D: 'arrange',
      arrangementSnapshot: null,
      ...overrides.simulation,
    },
    tools: {
      options: {},
      ...overrides.tools,
    },
  } as unknown as RootState;
}

describe('generateCopilotContext', () => {
  beforeEach(() => {
    clearActions();
  });

  it('should generate context with project info', () => {
    const state = createMockState();
    const context = generateCopilotContext(state);

    expect(context.project.name).toBe('Test Project');
    expect(context.project.pieceCount).toBe(2);
    expect(context.project.seamCount).toBe(1);
  });

  it('should include piece details with area', () => {
    const state = createMockState();
    const context = generateCopilotContext(state);

    const piece = context.project.pieces[0];
    expect(piece.name).toBe('Front Bodice');
    expect(piece.category).toBe('bodice');
    expect(piece.bounds.width).toBe(200);
    expect(piece.bounds.height).toBe(300);
    expect(piece.area).toBe(60000); // 200 * 300
    expect(piece.edgeCount).toBe(4); // M, L, L, L (not Z)
    expect(piece.internals).toHaveLength(1);
    expect(piece.internals[0].type).toBe('dart');
  });

  it('should include seam info with piece names', () => {
    const state = createMockState();
    const context = generateCopilotContext(state);

    const seam = context.project.seams[0];
    expect(seam.pieceA.pieceName).toBe('Front Bodice');
    expect(seam.pieceB.pieceName).toBe('Back Bodice');
    expect(seam.type).toBe('standard');
  });

  it('should include selection state', () => {
    const state = createMockState();
    const context = generateCopilotContext(state);

    expect(context.selection.pieces).toEqual(['piece-1']);
    expect(context.selection.pieceNames).toEqual(['Front Bodice']);
  });

  it('should include view state', () => {
    const state = createMockState();
    const context = generateCopilotContext(state);

    expect(context.view.mode).toBe('split');
    expect(context.view.activeTool).toBe('select');
    expect(context.view.units).toBe('mm');
  });

  it('should include simulation state', () => {
    const state = createMockState({
      simulation: { simulationState: 'running', fitMapMode: 'stress' },
    });
    const context = generateCopilotContext(state);

    expect(context.simulation.state).toBe('running');
    expect(context.simulation.fitMapVisible).toBe(true);
    expect(context.simulation.fitMapMode).toBe('stress');
  });

  it('should include avatar state', () => {
    const state = createMockState();
    const context = generateCopilotContext(state);

    expect(context.avatar.type).toBe('model');
    expect(context.avatar.measurements.chest).toBe(88);
    expect(context.avatar.measurements.waist).toBe(70);
  });

  it('should include recent actions', () => {
    trackAction('create_piece', 'Created Front Bodice', true, { pieceId: 'p1' });
    trackAction('select_piece', 'Selected Front Bodice', true);

    const state = createMockState();
    const context = generateCopilotContext(state);

    expect(context.recentActions).toHaveLength(2);
    expect(context.recentActions[0].action).toBe('create_piece');
    expect(context.recentActions[1].action).toBe('select_piece');
  });

  it('should include active skills', () => {
    const state = createMockState();
    const context = generateCopilotContext(state, ['bodice', 'sleeve']);

    expect(context.activeSkills).toEqual(['bodice', 'sleeve']);
  });

  it('should include timestamp', () => {
    const state = createMockState();
    const before = Date.now();
    const context = generateCopilotContext(state);
    const after = Date.now();

    expect(context.timestamp).toBeGreaterThanOrEqual(before);
    expect(context.timestamp).toBeLessThanOrEqual(after);
  });
});

describe('serializeCopilotContext', () => {
  beforeEach(() => {
    clearActions();
  });

  it('should serialize context to string', () => {
    const state = createMockState();
    const context = generateCopilotContext(state);
    const serialized = serializeCopilotContext(context);

    expect(serialized).toContain('# Project: "Test Project"');
    expect(serialized).toContain('## Pieces (2)');
    expect(serialized).toContain('Front Bodice');
    expect(serialized).toContain('[bodice]');
    expect(serialized).toContain('200×300mm');
    expect(serialized).toContain('[SELECTED]');
  });

  it('should include seams in serialized output', () => {
    const state = createMockState();
    const context = generateCopilotContext(state);
    const serialized = serializeCopilotContext(context);

    expect(serialized).toContain('## Seams (1)');
    expect(serialized).toContain('Front Bodice ↔ Back Bodice');
  });

  it('should include avatar measurements', () => {
    const state = createMockState();
    const context = generateCopilotContext(state);
    const serialized = serializeCopilotContext(context);

    expect(serialized).toContain('## Avatar (model)');
    expect(serialized).toContain('chest=88cm');
    expect(serialized).toContain('waist=70cm');
  });

  it('should include simulation state when running', () => {
    const state = createMockState({
      simulation: { simulationState: 'running', qualityLevel: 'high', solverTier: 'webgpu' },
    });
    const context = generateCopilotContext(state);
    const serialized = serializeCopilotContext(context);

    expect(serialized).toContain('## Simulation: running');
    expect(serialized).toContain('Quality: high');
  });

  it('should include recent actions', () => {
    trackAction('create_piece', 'Created piece', true);

    const state = createMockState();
    const context = generateCopilotContext(state);
    const serialized = serializeCopilotContext(context);

    expect(serialized).toContain('## Recent Actions');
    expect(serialized).toContain('✓ create_piece: Created piece');
  });
});

describe('generateContextDelta', () => {
  beforeEach(() => {
    clearActions();
  });

  it('should detect selection changes', () => {
    const state1 = createMockState({ editor: { selectedPieceIds: [] } });
    const state2 = createMockState({ editor: { selectedPieceIds: ['piece-1'] } });

    const ctx1 = generateCopilotContext(state1);
    const ctx2 = generateCopilotContext(state2);

    const delta = generateContextDelta(ctx2, ctx1);

    expect(delta.selection).toBeDefined();
    expect(delta.selection?.pieces).toEqual(['piece-1']);
  });

  it('should detect piece count changes', () => {
    const state1 = createMockState();
    const state2 = createMockState({
      project: {
        pieces: [
          ...createMockState().project.pieces,
          {
            id: 'piece-3',
            name: 'New Piece',
            outline: [{ type: 'M', values: [0, 0] }, { type: 'Z', values: [] }],
            internals: [],
            seamAllowance: 10,
            position: { x: 0, y: 0 },
            rotation: 0,
            mirrored: false,
          },
        ],
      },
    });

    const ctx1 = generateCopilotContext(state1);
    const ctx2 = generateCopilotContext(state2);

    const delta = generateContextDelta(ctx2, ctx1);

    expect(delta.project).toBeDefined();
    expect(delta.project?.pieceCount).toBe(3);
  });

  it('should detect simulation state changes', () => {
    const state1 = createMockState({ simulation: { simulationState: 'idle' } });
    const state2 = createMockState({ simulation: { simulationState: 'running' } });

    const ctx1 = generateCopilotContext(state1);
    const ctx2 = generateCopilotContext(state2);

    const delta = generateContextDelta(ctx2, ctx1);

    expect(delta.simulation).toBeDefined();
    expect(delta.simulation?.state).toBe('running');
  });

  it('should include new actions since last context', async () => {
    const state = createMockState();
    const ctx1 = generateCopilotContext(state);

    // Wait a bit and track new action
    await new Promise(r => setTimeout(r, 10));
    trackAction('new_action', 'Did something new', true);

    const ctx2 = generateCopilotContext(state);
    const delta = generateContextDelta(ctx2, ctx1);

    expect(delta.recentActions).toBeDefined();
    expect(delta.recentActions).toHaveLength(1);
    expect(delta.recentActions?.[0].action).toBe('new_action');
  });
});
