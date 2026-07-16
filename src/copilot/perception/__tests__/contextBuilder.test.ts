import { describe, it, expect } from 'vitest';
import { buildAgentContext, serializeContext, buildPieceSemantics, buildSpatialRelationships } from '../contextBuilder';
import type { RootState } from '../../../store';
import type { PatternPiece, Seam } from '../../../types/types';

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
          layer: 1,
          sublayer: 0,
          active: true,
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
          layer: 1,
          sublayer: 0,
          active: true,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      seams: [
        {
          id: 'seam-1',
          pieceA: { pieceId: 'piece-1', edgeName: 'sideSeam' },
          pieceB: { pieceId: 'piece-2', edgeName: 'sideSeam' },
          type: 'standard',
          tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
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
      isDirty: false, groups: [], seamGroups: [], arrangementOverrides: {}, poms: [], pleats: [], elastics: [], trims: [],
      referenceImages: [],
      layerNames: {}, layerLocked: {},
      loadDiagnostics: [], loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
      colorways: [], activeColorwayId: null,
    },
    editor: {
      viewMode: 'split',
      activeTool: 'select',
      selectedPieceIds: ['piece-1'],
      selectedSeamId: null,
      selectedPOMId: null,
      selectedElasticId: null,
      selectedInternalLine: null,
      saSelection: null,
      zoom2D: 1,
      pan2D: { x: 0, y: 0 },
      fitViewToken: 0,
      showSeamAllowance: true,
      defaultSeamAllowanceWidth: 10,
      showGrainlines: true,
      showAnchorPoints: true,
      showPieceNames: false,
      showLineLengths: false,
      showSewingLines: true,
      renderMode2D: 'textured' as const,
      snapToGrid: true,
      gridSize: 10,
      units: 'mm',
      clipboard: null,
      superimposePickMode: null,
      showReferenceImages: true,
      selectedReferenceImageId: null,
      calibrationMode: null,
    },
    simulation: {
      simulationState: 'idle',
      pieceFabrics: { 'piece-1': 'cotton-poplin' },
      defaultFabricId: 'cotton-poplin',
      particleDistance: 5,
      pieceParticleDistance: {},
      renderSettingsOpen: false,
      fitMapMode: 'none' as const,
      fitMapConfig: { stressRange: [0, 100] as [number, number], strainRange: [1.0, 1.2] as [number, number], fitThresholds: [0.8, 1.0] as [number, number], pressureDistance: 0.002 },
      simulationMode: 'normal' as const,
      solverTier: 'none' as const,
      frameTimeMs: 0,
      particleCount: 0,
      seamResolution: null,
      bodyCollision: false, collisionDistance: null, viewMode3D: 'arrange' as const, arrangementSnapshot: null,
      pinnedVertices: {}, selectedPinId: null, selectedVertices: [], selectBox3D: null, selectLasso3D: null,
      showGarment: true, showSeamlines3D: true, showSimSeamLines: false, showInternalLines3D: true, surfaceMode3D: 'textured' as const,
      snapshots: [], activeSnapshotId: null,
      isWarmStarting: false,
      fitMapStats: null,
      pieceTints: {},
      pieceTextureOverrides: {},
      pieceUVTransforms: {},
      pieceOpacity: {},
      pieceEmission: {},
      pieceEmissionIntensity: {},
      windForce: [0, 0, 0] as [number, number, number],
      windEnabled: false,
      dragCoefficient: 1.0,
      frozenPieceIds: [],
      hiddenPieceIds: [],
      flippedPieceIds: [],
      steamBrush: { active: false, radius: 0.05, strength: 0.3 },
      meshGrab: { active: false, radius: 0.05, strength: 0.8 },
      hiddenLayerIds: [],
      layerOutlineColors: {},
      xrayMode: false,
      xrayActiveLayer: null,
      xrayOpacitySnapshot: null,
      piecePressures: {},
      armAxis: { left: null, right: null, ready: false },
    },
    avatarTape: { tapes: [], pendingTape: null },
    plugins: {
      installedPlugins: [],
      pluginErrors: {},
    },
    layout: {
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
      morphTargets: {},
      availableMorphTargets: [],
    },
    tools: {
      activeTool2D: 'select',
      activeTool3D: 'camera',
      toolOptions: {},
      recentTools: [],
      optionsPanelCollapsed: false,
      expertShowOverride: false,
    },
    parametric: {
      activePattern: null,
      baseMeasurements: null,
      currentSize: null,
      sizeSystem: 'eu-women',
      variableOverrides: {},
      variableDefaults: {},
      generatedPieceIds: [],
    },
    construction: {
      points: [],
      lines: [],
      curves: [],
      pieces: [],
      variables: {},
      selectedEntity: null,
      showConstruction: true,
      pieceIdentityMap: {},
    },
    blueprints: {
      blueprints: [],
    },
    copilotUI: {
      highlights: [],
      toasts: [],
      actionLog: [],
      maxLogEntries: 50,
      pendingConfirmation: null,
      ghostPreview: null,
      actionLogVisible: false,
    },
    camera: {
      pendingPreset: null,
      pendingFocusPieceId: null,
    },
    collisionBody: {
      bodies: [],
      selectedBodyId: null,
    },
    renderSettings: {
      hdriPreset: 'studio-soft',
      hdriRotation: 0,
      hdriCustomUrl: null,
      toneMapping: 'aces' as const,
      exposure: 1.0,
      backgroundMode: 'hdri' as const,
      backgroundColor: '#f0f0f0',
      lights: [],
      groundVisible: true,
      shadowOpacity: 0.4,
      shadowBlur: 2,
      turntableFrameCount: 36,
      turntableDirection: 'cw' as const,
      resolutionPreset: 'custom' as const,
      exportWidth: 2048,
      exportHeight: 2048,
      aspectRatioLocked: false,
      samplesPerPixel: 1,
      denoiserEnabled: false,
      imageFormat: 'png' as const,
      jpegQuality: 0.9,
      exportTransparent: false,
      videoFormat: 'webm' as const,
      videoFps: 30,
      avatarRenderStyle: 'visible' as const,
    },
    animation: {
      duration: 10,
      fps: 24,
      currentFrame: 0,
      playbackState: 'stopped',
      loop: false,
      autoKeying: false,
      tracks: [],
      recording: false,
      recordedFrameCount: 0,
      recordedVertexCount: 0,
    },
    workflow: {
      expertMode: false,
      confirmOverrides: {},
      toolMemory: {},
      dxfPreferredFormat: null,
    },
    inspector: {
      target: null,
      data: null,
      diagnostics: [],
      agentAnalysis: null,
      agentStreaming: false,
      agentError: null,
      unresolvedCount: 0,
      lastSolverError: null,
      seamResolutionErrors: [],
    },
    bom: {
      entries: [],
      currency: 'USD',
      lastExtractedAt: null,
      extractedProjectVersion: null,
    },
    nesting: {
      config: { rollWidth: 1500, gap: 10, rotationStep: 180, allowMirror: false },
      result: null,
      usedLength: null,
      wastePercent: null,
      lastNestedAt: null,
    },
    grading: {
      enabled: false,
      sizeSystem: 'eu-women',
      baseSize: 'M',
      activeSizes: [],
      quantities: {},
      generatedPieces: {},
      stale: false,
      lastGradedAt: null,
    },
    dock: {
      pinnedExtra: { left: [], right: [] },
      signaling: 'subtle' as const,
      tools2d: ['select', 'pen', 'line', 'rectangle', 'scissors', 'measure', 'seam'],
    },
    inputScheme: {
      scheme: 'mouse' as const,
      source: 'default' as const,
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
        pleats: [],
        fabrics: [],
        avatar: { id: 'a', name: 'A', modelUrl: '', measurements: { height: 170, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } },
        avatarMode: 'model',
        avatarModelUrl: null,
        isDirty: false, groups: [], seamGroups: [], arrangementOverrides: {}, poms: [], elastics: [], trims: [],
        referenceImages: [],
        layerNames: {}, layerLocked: {},
        loadDiagnostics: [], loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
        colorways: [], activeColorwayId: null,
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
        pleats: [],
        fabrics: [],
        avatar: { id: 'a', name: 'A', modelUrl: '', measurements: { height: 170, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } },
        avatarMode: 'model',
        avatarModelUrl: null,
        isDirty: false, groups: [], seamGroups: [], arrangementOverrides: {}, poms: [], elastics: [], trims: [],
        referenceImages: [],
        layerNames: {}, layerLocked: {},
        loadDiagnostics: [], loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
        colorways: [], activeColorwayId: null,
      },
    });
    const context = buildAgentContext(state);
    const serialized = serializeContext(context);

    expect(serialized).toContain('No pieces yet');
  });
});

describe('Context Builder - Piece Semantics', () => {
  const testPiece: PatternPiece = {
    id: 'front-bodice',
    name: 'Front Bodice',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 150] },
      { type: 'L', values: [0, 150] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('should build piece semantics with fingerprint', () => {
    const semantics = buildPieceSemantics(testPiece);

    expect(semantics.pieceId).toBe('front-bodice');
    expect(semantics.fingerprint).toBeDefined();
    expect(semantics.fingerprint.pieceId).toBe('front-bodice');
    expect(semantics.fingerprint.segmentTypes).toBeDefined();
  });

  it('should include landmarks in fingerprint', () => {
    const semantics = buildPieceSemantics(testPiece);

    expect(semantics.fingerprint.landmarks).toBeDefined();
    expect(Array.isArray(semantics.fingerprint.landmarks)).toBe(true);
  });

  it('should compute curvature density', () => {
    const semantics = buildPieceSemantics(testPiece);

    expect(typeof semantics.fingerprint.curvatureDensity).toBe('number');
    expect(semantics.fingerprint.curvatureDensity).toBeGreaterThanOrEqual(0);
    expect(semantics.fingerprint.curvatureDensity).toBeLessThanOrEqual(1);
  });
});

describe('Context Builder - Spatial Relationships', () => {
  const pieces: PatternPiece[] = [
    {
      id: 'front',
      name: 'Front',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
      internals: [],
      position: { x: 0, y: 0 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      layer: 1,
      sublayer: 0,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'back',
      name: 'Back',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
      internals: [],
      position: { x: 150, y: 0 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      layer: 1,
      sublayer: 0,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  const seams: Seam[] = [];

  it('should build spatial relationships between pieces', () => {
    const relationships = buildSpatialRelationships(pieces, seams);

    expect(relationships.relationships).toBeDefined();
    expect(Array.isArray(relationships.relationships)).toBe(true);
  });

  it('should detect conflicts', () => {
    const relationships = buildSpatialRelationships(pieces, seams);

    expect(relationships.conflicts).toBeDefined();
    expect(Array.isArray(relationships.conflicts)).toBe(true);
  });

  it('should return empty arrays for single piece', () => {
    const relationships = buildSpatialRelationships([pieces[0]], []);

    expect(relationships.relationships).toHaveLength(0);
    expect(relationships.conflicts).toHaveLength(0);
  });
});

import { getRecentDecisions, buildCerebralContext, serializeCerebralContext, type CerebralContextInput } from '../contextBuilder';
import type { CerebralContext } from '../types';
import type { DesignLogEntry, SkillOverride } from '../types';

describe('Context Builder - Design Log Integration', () => {
  const entries: DesignLogEntry[] = [
    {
      id: 'entry-1',
      timestamp: Date.now() - 1000,
      type: 'decision',
      summary: 'Set bodice ease to 3cm',
      relatedPieceIds: ['front-bodice'],
    },
    {
      id: 'entry-2',
      timestamp: Date.now() - 500,
      type: 'constraint',
      summary: 'Armhole must match sleeve cap',
      relatedPieceIds: ['front-bodice', 'sleeve'],
    },
    {
      id: 'entry-3',
      timestamp: Date.now(),
      type: 'warning',
      summary: 'Grain line missing on back piece',
      relatedPieceIds: ['back-bodice'],
    },
  ];

  it('should return recent decisions', () => {
    const recent = getRecentDecisions(entries, 5);

    expect(recent).toHaveLength(3);
    expect(recent[0].id).toBe('entry-3'); // Most recent first
  });

  it('should limit to specified count', () => {
    const recent = getRecentDecisions(entries, 2);

    expect(recent).toHaveLength(2);
  });

  it('should prioritize warnings and constraints', () => {
    const recent = getRecentDecisions(entries, 2);

    // Should include warning and constraint over plain decision
    const types = recent.map(e => e.type);
    expect(types).toContain('warning');
  });

  it('should return empty array for no entries', () => {
    const recent = getRecentDecisions([], 5);

    expect(recent).toHaveLength(0);
  });
});

describe('Context Builder - Cerebral Context', () => {
  const input: CerebralContextInput = {
    pieces: [
      {
        id: 'front',
        name: 'Front',
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [100, 0] },
          { type: 'L', values: [100, 100] },
          { type: 'L', values: [0, 100] },
          { type: 'Z', values: [] },
        ],
        internals: [],
        position: { x: 0, y: 0 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 10,
        layer: 1,
        sublayer: 0,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    seams: [],
    designLogEntries: [],
    overrides: [],
  };

  it('should build complete cerebral context', () => {
    const context = buildCerebralContext(input);

    expect(context.pieceSemantics).toBeDefined();
    expect(context.spatialRelationships).toBeDefined();
    expect(context.conflicts).toBeDefined();
    expect(context.recentDecisions).toBeDefined();
    expect(context.activeOverrides).toBeDefined();
  });

  it('should include semantics for each piece', () => {
    const context = buildCerebralContext(input);

    expect(context.pieceSemantics).toHaveLength(1);
    expect(context.pieceSemantics[0].pieceId).toBe('front');
  });

  it('should include provided overrides', () => {
    const override: SkillOverride = {
      id: 'o1',
      skillId: 'core:bodice',
      formulaName: 'backWidth',
      originalValue: 'x',
      overrideValue: 'x + 5',
      reason: 'User preference',
      createdAt: Date.now(),
    };

    const context = buildCerebralContext({
      ...input,
      overrides: [override],
    });

    expect(context.activeOverrides).toHaveLength(1);
    expect(context.activeOverrides[0].skillId).toBe('core:bodice');
  });
});

describe('Context Builder - Serialization', () => {
  const context: CerebralContext = {
    pieceSemantics: [
      {
        pieceId: 'front',
        fingerprint: {
          pieceId: 'front',
          segmentTypes: ['straight', 'straight', 'straight', 'straight'],
          ratios: { 'width/height': 0.67 },
          curvatureDensity: 0,
          landmarks: [],
        },
      },
    ],
    spatialRelationships: [
      {
        pieceAId: 'front',
        pieceBId: 'back',
        type: 'adjacent',
        distance3D: 5,
        hasSewingConnection: false,
      },
    ],
    conflicts: [],
    recentDecisions: [
      {
        id: 'e1',
        timestamp: Date.now(),
        type: 'decision',
        summary: 'Use French seams',
        relatedPieceIds: ['front'],
      },
    ],
    activeOverrides: [],
  };

  it('should serialize to markdown format', () => {
    const serialized = serializeCerebralContext(context);

    expect(serialized).toContain('## Piece Analysis');
    expect(serialized).toContain('front');
  });

  it('should include spatial relationships', () => {
    const serialized = serializeCerebralContext(context);

    expect(serialized).toContain('Spatial');
    expect(serialized).toContain('adjacent');
  });

  it('should include recent decisions', () => {
    const serialized = serializeCerebralContext(context);

    expect(serialized).toContain('Decision');
    expect(serialized).toContain('French seams');
  });

  it('should handle empty context', () => {
    const empty: CerebralContext = {
      pieceSemantics: [],
      spatialRelationships: [],
      conflicts: [],
      recentDecisions: [],
      activeOverrides: [],
    };

    const serialized = serializeCerebralContext(empty);

    expect(serialized).toBeDefined();
    expect(serialized.length).toBeGreaterThan(0);
  });

  it('should include overrides when present', () => {
    const withOverrides: CerebralContext = {
      ...context,
      activeOverrides: [
        {
          id: 'o1',
          skillId: 'core:bodice',
          formulaName: 'backWidth',
          originalValue: 'x',
          overrideValue: 'x + 5',
          reason: 'Wider back',
          createdAt: Date.now(),
        },
      ],
    };

    const serialized = serializeCerebralContext(withOverrides);

    expect(serialized).toContain('Override');
    expect(serialized).toContain('backWidth');
  });
});

import { buildEnhancedAgentContext } from '../contextBuilder';

describe('Context Builder - Enhanced Agent Context', () => {
  // Minimal mock state
  const mockState = {
    project: {
      name: 'Test Project',
      pieces: [],
      seams: [],
      fabrics: [],
      avatar: { measurements: {} },
    },
    editor: {
      selectedPieceIds: [],
      selectedSeamId: null,
      activeTool: 'select',
      viewMode: '2d',
      units: 'mm',
      showSeamAllowance: true,
    },
    simulation: {
      simulationState: 'idle',
      pieceFabrics: {},
      snapshots: [],
      activeSnapshotId: null,
      particleCount: 0,
      seamResolution: null,
    },
  } as unknown as RootState;

  it('should include cerebral context in enhanced agent context', () => {
    const context = buildEnhancedAgentContext(
      mockState,
      [],
      [],
      [],
    );

    expect(context.cerebral).toBeDefined();
    expect(context.cerebralSerialized).toBeDefined();
  });

  it('should include base agent context fields', () => {
    const context = buildEnhancedAgentContext(
      mockState,
      [],
      [],
      [],
    );

    expect(context.project).toBeDefined();
    expect(context.editor).toBeDefined();
    expect(context.simulation).toBeDefined();
  });
});
