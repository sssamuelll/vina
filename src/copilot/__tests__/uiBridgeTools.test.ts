/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDefaultRegistry, resetDefaultRegistry } from '../tools/registry';

describe('UI Bridge Tools (#82)', () => {
  const basePiece = {
    id: 'p1', name: 'Front', outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 300] }, { type: 'Z', values: [] },
    ], internals: [], position: { x: 0, y: 0 }, rotation: 0,
  };

  let pieces: any[];
  const mockState = () => ({
    editor: { activeTool: 'select', viewMode: 'split', zoom2D: 1, pan2D: { x: 0, y: 0 }, selectedPieceIds: [] },
    project: { id: 'proj1', pieces, seams: [], fabrics: [] },
    simulation: { simulationState: 'idle', solverTier: 'none', frameTimeMs: 0, particleCount: 0, qualityLevel: 'medium', autoQuality: true, pieceFabrics: {} },
  });

  const dispatch = vi.fn((action: any) => {
    // Simulate duplicatePiece
    if (action.type?.includes('duplicatePiece')) {
      pieces.push({ ...basePiece, id: 'p1_copy', name: 'Front (copy)' });
    }
  });

  beforeEach(() => {
    pieces = [{ ...basePiece }];
    dispatch.mockClear();
    resetDefaultRegistry();
  });

  it('duplicatePiece creates a copy', async () => {
    const registry = getDefaultRegistry();
    const tool = registry.get('duplicatePiece')!;
    const result: any = await tool.execute({ pieceId: 'p1' }, dispatch as any, mockState as any);
    expect(result.success).toBe(true);
    expect(dispatch).toHaveBeenCalled();
  });

  it('duplicatePiece fails on missing piece', async () => {
    const registry = getDefaultRegistry();
    const tool = registry.get('duplicatePiece')!;
    const result: any = await tool.execute({ pieceId: 'nonexistent' }, dispatch as any, mockState as any);
    expect(result.success).toBe(false);
  });

  it('quickRectangle creates a rectangular piece', async () => {
    const registry = getDefaultRegistry();
    const tool = registry.get('quickRectangle')!;
    const result: any = await tool.execute({ name: 'Panel', width: 300, height: 400 }, dispatch as any, mockState as any);
    expect(result.success).toBe(true);
    expect(result.width).toBe(300);
    expect(result.height).toBe(400);
    expect(dispatch).toHaveBeenCalled();
  });

  it('activateTool dispatches setActiveTool', async () => {
    const registry = getDefaultRegistry();
    const tool = registry.get('activateTool')!;
    const result: any = await tool.execute({ tool: 'pen' }, dispatch as any, mockState as any);
    expect(result.success).toBe(true);
    expect(result.activeTool).toBe('pen');
  });

  it('switchViewMode dispatches setViewMode', async () => {
    const registry = getDefaultRegistry();
    const tool = registry.get('switchViewMode')!;
    const result: any = await tool.execute({ mode: '3d' }, dispatch as any, mockState as any);
    expect(result.success).toBe(true);
    expect(result.viewMode).toBe('3d');
  });

  it('selectPieceById selects a piece', async () => {
    const registry = getDefaultRegistry();
    const tool = registry.get('selectPieceById')!;
    const result: any = await tool.execute({ pieceId: 'p1' }, dispatch as any, mockState as any);
    expect(result.success).toBe(true);
    expect(result.name).toBe('Front');
  });

  it('clearEditorSelection dispatches clearSelection', async () => {
    const registry = getDefaultRegistry();
    const tool = registry.get('clearEditorSelection')!;
    const result: any = await tool.execute({}, dispatch as any, mockState as any);
    expect(result.success).toBe(true);
  });

  it('addAnnotation adds internal line to piece', async () => {
    const registry = getDefaultRegistry();
    const tool = registry.get('addAnnotation')!;
    const result: any = await tool.execute({ pieceId: 'p1', text: 'CF', x: 50, y: 100 }, dispatch as any, mockState as any);
    expect(result.success).toBe(true);
    expect(result.text).toBe('CF');
  });
});
