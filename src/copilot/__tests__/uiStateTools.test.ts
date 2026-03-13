/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import { getDefaultRegistry, resetDefaultRegistry } from '../action/tools/registry';

describe('UI State Tools (#80)', () => {
  const mockState = {
    editor: {
      activeTool: 'select',
      viewMode: 'split',
      zoom2D: 1.5,
      pan2D: { x: 10, y: 20 },
      selectedPieceIds: ['p1'],
    },
    project: {
      pieces: [
        { id: 'p1', name: 'Front Bodice', category: 'bodice', side: 'front', grainLine: { direction: 'lengthwise' }, edges: [{ name: 'shoulder', edgeType: 'seam', length: 140 }], darts: [{ id: 'd1' }], internals: [], seamAllowance: 10 },
        { id: 'p2', name: 'Back Bodice', category: 'bodice', side: 'back', edges: [], internals: [] },
      ],
      seams: [{ id: 's1' }],
      fabrics: [{ id: 'f1' }],
      avatar: { measurements: { bust: 88, waist: 70, hips: 0 } },
    },
    simulation: {
      simulationState: 'idle',
      solverTier: 'none',
      frameTimeMs: 0,
      particleCount: 0,
      simulationMode: 'normal',
      pieceFabrics: {},
    },
  };

  const dispatch = () => {};
  const getState = () => mockState as any;

  beforeEach(() => resetDefaultRegistry());

  it('getEditorState returns tool and view info', async () => {
    const registry = getDefaultRegistry();
    const tool = registry.get('getEditorState')!;
    const result: any = await tool.execute({}, dispatch as any, getState);
    expect(result.success).toBe(true);
    expect(result.activeTool).toBe('select');
    expect(result.viewMode).toBe('split');
    expect(result.zoom2D).toBe(1.5);
    expect(result.selectedCount).toBe(1);
  });

  it('getSelection returns enriched piece data', async () => {
    const registry = getDefaultRegistry();
    const tool = registry.get('getSelection')!;
    const result: any = await tool.execute({}, dispatch as any, getState);
    expect(result.success).toBe(true);
    expect(result.selectedCount).toBe(1);
    expect((result as any).pieces[0].name).toBe('Front Bodice');
    expect((result as any).pieces[0].category).toBe('bodice');
    expect((result as any).pieces[0].hasGrainLine).toBe(true);
    expect((result as any).pieces[0].dartCount).toBe(1);
  });

  it('getSelection handles empty selection', async () => {
    const emptyState = { ...mockState, editor: { ...mockState.editor, selectedPieceIds: [] } };
    const registry = getDefaultRegistry();
    const tool = registry.get('getSelection')!;
    const result: any = await tool.execute({}, dispatch as any, () => emptyState as any);
    expect(result.selectedCount).toBe(0);
  });

  it('getProjectSummary returns counts', async () => {
    const registry = getDefaultRegistry();
    const tool = registry.get('getProjectSummary')!;
    const result: any = await tool.execute({}, dispatch as any, getState);
    expect(result.success).toBe(true);
    expect(result.pieceCount).toBe(2);
    expect(result.seamCount).toBe(1);
    expect(result.measurementsSet).toBe(2); // bust + waist (hips=0 excluded)
    expect(result.categorized).toBe(2);
    expect(result.withGrainLine).toBe(1);
  });

  it('getSimulationState returns solver info', async () => {
    const registry = getDefaultRegistry();
    const tool = registry.get('getSimulationState')!;
    const result: any = await tool.execute({}, dispatch as any, getState);
    expect(result.success).toBe(true);
    expect(result.state).toBe('idle');
    expect(result.solverTier).toBe('none');
  });

  it('getUndoState returns availability', async () => {
    const registry = getDefaultRegistry();
    const tool = registry.get('getUndoState')!;
    const result: any = await tool.execute({}, dispatch as any, getState);
    expect(result.success).toBe(true);
    expect(typeof result.canUndo).toBe('boolean');
    expect(typeof result.canRedo).toBe('boolean');
  });
});
