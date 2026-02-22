import { describe, it, expect } from 'vitest';
import { buildAgentContext, serializeContext } from '../contextBuilder';
import type { RootState } from '../../store';

function mockState(overrides?: Partial<RootState>): RootState {
  const base: RootState = {
    project: {
      id: 'test-project',
      name: 'Test Project',
      pieces: [
        {
          id: 'piece-1',
          name: 'Front Bodice',
          outline: [
            { type: 'M', values: [0, 0] },
            { type: 'L', values: [250, 0] },
            { type: 'L', values: [250, 400] },
            { type: 'L', values: [0, 400] },
            { type: 'Z', values: [] },
          ],
          internals: [
            { id: 'gl-1', type: 'grainline', path: [{ type: 'M', values: [125, 50] }, { type: 'L', values: [125, 350] }] },
            { id: 'dart-1', type: 'dart', path: [{ type: 'M', values: [85, 380] }, { type: 'L', values: [100, 200] }, { type: 'L', values: [115, 380] }] },
          ],
          position: { x: 50, y: 50 },
          rotation: 0,
          mirrored: false,
          seamAllowance: 10,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'piece-2',
          name: 'Back Bodice',
          outline: [
            { type: 'M', values: [0, 0] },
            { type: 'L', values: [240, 0] },
            { type: 'L', values: [240, 390] },
            { type: 'L', values: [0, 390] },
            { type: 'Z', values: [] },
          ],
          internals: [],
          position: { x: 350, y: 50 },
          rotation: 0,
          mirrored: false,
          seamAllowance: 10,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      seams: [
        {
          id: 'seam-1',
          pieceA: { pieceId: 'piece-1', edgeStart: 1, edgeEnd: 2 },
          pieceB: { pieceId: 'piece-2', edgeStart: 3, edgeEnd: 4 },
          type: 'standard',
        },
      ],
      fabrics: [
        { id: 'cotton', name: 'Cotton', color: '#fff', weight: 150, stretch: 0.05, stiffness: 0.4, friction: 0.5 },
      ],
      avatar: {
        id: 'default',
        name: 'Default',
        modelUrl: '',
        measurements: {
          height: 168,
          chest: 88,
          waist: 72,
          hips: 96,
          shoulder: 40,
          armLength: 60,
          inseam: 79,
        },
      },
      avatarMode: 'model',
      avatarModelUrl: null,
      isDirty: false,
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
      snapToGrid: true,
      gridSize: 10,
      units: 'mm',
    },
    simulation: {
      simulationState: 'idle',
      pieceFabrics: { 'piece-1': 'cotton-poplin' },
      defaultFabricId: 'cotton-poplin',
      particleDistance: 5,
      pieceParticleDistance: {},
    },
    plugins: {
      installedPlugins: [],
      enabledPlugins: [],
      pluginErrors: {},
    },
    layout: {
      copilotPosition: 'right',
      copilotOpen: true,
      copilotSize: 340,
      primaryView: '2d',
      splitRatio: 0.5,
    },
    marker: {
      isOpen: false,
      paperSize: 'A0' as const,
      paperWidth: 841,
      paperHeight: 1189,
      scale: 1,
      margin: 10,
      layout: null,
      selectedPieceIndex: null,
      includeSeamAllowance: true,
      showGrid: true,
      gridSpacing: 10,
      fabricUtilization: 0,
    },
    avatar: {
      pose: {
        joints: { LeftArm: { x: 50, y: 0, z: 0 }, RightArm: { x: 50, y: 0, z: 0 }, LeftShoulder: { x: 8, y: 0, z: 0 }, RightShoulder: { x: 8, y: 0, z: 0 } },
        activePreset: 'A-pose',
        ikChains: [],
        ikTargets: [],
        ikEnabled: false,
      },
      poseEditorOpen: false,
      selectedJoint: null,
      savedPoses: [],
      avatarProfiles: [],
      activeProfileId: null,
    },
    tools: {
      activeTool2D: 'select',
      activeTool3D: 'camera',
      toolOptions: {},
      recentTools: [],
    },
  };

  if (overrides) {
    return { ...base, ...overrides } as RootState;
  }
  return base;
}

describe('buildAgentContext', () => {
  it('should build context from mock state', () => {
    const state = mockState();
    const context = buildAgentContext(state);

    expect(context.project.name).toBe('Test Project');
    expect(context.project.pieces.length).toBe(2);
    expect(context.project.seams.length).toBe(1);
    expect(context.project.fabrics.length).toBe(1);
  });

  it('should summarize pieces correctly', () => {
    const state = mockState();
    const context = buildAgentContext(state);

    const frontBodice = context.project.pieces[0];
    expect(frontBodice.id).toBe('piece-1');
    expect(frontBodice.name).toBe('Front Bodice');
    expect(frontBodice.bounds.width).toBe(250);
    expect(frontBodice.bounds.height).toBe(400);
    expect(frontBodice.seamAllowance).toBe(10);
    expect(frontBodice.internals).toEqual([
      { type: 'grainline', count: 1 },
      { type: 'dart', count: 1 },
    ]);
  });

  it('should include editor state', () => {
    const state = mockState();
    const context = buildAgentContext(state);

    expect(context.editor.selectedPieceIds).toEqual(['piece-1']);
    expect(context.editor.viewMode).toBe('split');
    expect(context.editor.units).toBe('mm');
    expect(context.editor.showSeamAllowance).toBe(true);
  });

  it('should include simulation state', () => {
    const state = mockState();
    const context = buildAgentContext(state);

    expect(context.simulation.state).toBe('idle');
    expect(context.simulation.pieceFabrics['piece-1']).toBe('cotton-poplin');
  });

  it('should include measurements', () => {
    const state = mockState();
    const context = buildAgentContext(state);

    expect(context.project.measurements.chest).toBe(88);
    expect(context.project.measurements.waist).toBe(72);
    expect(context.project.measurements.hips).toBe(96);
  });

  it('should handle empty state', () => {
    const state = mockState({
      project: {
        id: 'empty',
        name: 'Empty',
        pieces: [],
        seams: [],
        fabrics: [],
        avatar: { id: 'a', name: 'A', modelUrl: '', measurements: { height: 170, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } },
        avatarMode: 'model',
        avatarModelUrl: null,
        isDirty: false,
      },
    });
    const context = buildAgentContext(state);

    expect(context.project.pieces).toEqual([]);
    expect(context.project.seams).toEqual([]);
  });
});

describe('serializeContext', () => {
  it('should serialize to a compact string', () => {
    const state = mockState();
    const context = buildAgentContext(state);
    const serialized = serializeContext(context);

    expect(serialized).toContain('Test Project');
    expect(serialized).toContain('Front Bodice');
    expect(serialized).toContain('Back Bodice');
    expect(serialized).toContain('250×400mm');
    expect(serialized).toContain('[SELECTED]');
    expect(serialized).toContain('chest=88cm');
  });

  it('should handle empty project', () => {
    const state = mockState({
      project: {
        id: 'empty',
        name: 'Empty',
        pieces: [],
        seams: [],
        fabrics: [],
        avatar: { id: 'a', name: 'A', modelUrl: '', measurements: { height: 170, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } },
        avatarMode: 'model',
        avatarModelUrl: null,
        isDirty: false,
      },
    });
    const context = buildAgentContext(state);
    const serialized = serializeContext(context);

    expect(serialized).toContain('No pieces yet');
  });
});
