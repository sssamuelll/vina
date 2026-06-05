import { describe, it, expect } from 'vitest';
import { buildCopilotContext, DEFAULT_SYSTEM_PROMPT } from '../copilot/protocol';

const mockProject = {
  name: 'Test Project',
  pieces: [
    {
      id: 'piece-1',
      name: 'Front Bodice',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [200, 0] },
        { type: 'L', values: [200, 400] },
        { type: 'L', values: [0, 400] },
        { type: 'Z', values: [] },
      ],
      internals: [
        { id: 'gl-1', type: 'grainline', path: [] },
        { id: 'dart-1', type: 'dart', path: [] },
      ],
      position: { x: 10, y: 20 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      fabricId: 'cotton',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],
  seams: [],
  fabrics: [],
  avatar: {
    id: 'default',
    name: 'Default',
    modelUrl: '',
    measurements: { height: 170, chest: 90, waist: 70, hips: 95, shoulder: 40, armLength: 60, inseam: 80 },
  },
};

const mockEditor = {
  selectedPieceIds: ['piece-1'],
};

describe('buildCopilotContext', () => {
  it('builds context with project info', () => {
    const ctx = buildCopilotContext(mockProject, mockEditor, 'hello', []);
    expect(ctx.project.name).toBe('Test Project');
    expect(ctx.message).toBe('hello');
    expect(ctx.selectedPieceIds).toEqual(['piece-1']);
  });

  it('summarizes pieces correctly', () => {
    const ctx = buildCopilotContext(mockProject, mockEditor, 'test', []);
    expect(ctx.project.pieces).toHaveLength(1);
    const piece = ctx.project.pieces[0];
    expect(piece.id).toBe('piece-1');
    expect(piece.name).toBe('Front Bodice');
    expect(piece.bounds.width).toBe(200);
    expect(piece.bounds.height).toBe(400);
    expect(piece.seamAllowance).toBe(10);
    expect(piece.position).toEqual({ x: 10, y: 20 });
  });

  it('counts internals by type', () => {
    const ctx = buildCopilotContext(mockProject, mockEditor, 'test', []);
    const piece = ctx.project.pieces[0];
    expect(piece.internals).toEqual(
      expect.arrayContaining([
        { type: 'grainline', count: 1 },
        { type: 'dart', count: 1 },
      ])
    );
  });

  it('includes measurements', () => {
    const ctx = buildCopilotContext(mockProject, mockEditor, 'test', []);
    expect(ctx.project.measurements.chest).toBe(90);
    expect(ctx.project.measurements.waist).toBe(70);
  });

  it('trims history to last 10 messages', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: 'user' as const,
      content: `msg ${i}`,
      timestamp: i,
    }));
    const ctx = buildCopilotContext(mockProject, mockEditor, 'test', history);
    expect(ctx.history).toHaveLength(10);
    expect(ctx.history[0].content).toBe('msg 10');
  });

  it('handles empty project', () => {
    const emptyProject = { ...mockProject, pieces: [] };
    const ctx = buildCopilotContext(emptyProject, { selectedPieceIds: [] }, 'test', []);
    expect(ctx.project.pieces).toHaveLength(0);
    expect(ctx.selectedPieceIds).toEqual([]);
  });
});

describe('DEFAULT_SYSTEM_PROMPT', () => {
  it('includes coordinate system docs', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('1 unit = 1mm');
  });

  it('routes pattern entry through the user-imported DXF (no catalog, no agentic load)', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('imported DXF');
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain('Seamly');
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain('loadSeamlyPattern');
  });
});
