/**
 * #80 — Copilot UI Awareness: State Query Tools
 * Read-only tools for the copilot to understand current editor/simulation context.
 */

import type { ToolDefinition } from '../registry';
import { canUndo, canRedo, getUndoLength, getRedoLength } from '../../../store/undoMiddleware';

export const tools: ToolDefinition[] = [
  {
    name: 'getEditorState',
    description: 'Get current editor state: active tool, view mode (2D/3D/split), zoom level, pan position.',
    parameters: { type: 'object', properties: {} },
    execute: async (_params, _dispatch, getState) => {
      const state = getState();
      const editor = state.editor;
      return {
        success: true,
        activeTool: editor.activeTool,
        viewMode: editor.viewMode,
        zoom2D: editor.zoom2D,
        pan2D: editor.pan2D,
        selectedPieceIds: editor.selectedPieceIds,
        selectedCount: editor.selectedPieceIds.length,
      };
    },
  },
  {
    name: 'getSelection',
    description: 'Get detailed info about currently selected pieces including their names, categories, edges, and darts.',
    parameters: { type: 'object', properties: {} },
    execute: async (_params, _dispatch, getState) => {
      const state = getState();
      const selectedIds = state.editor.selectedPieceIds;
      if (selectedIds.length === 0) {
        return { success: true, selectedCount: 0, pieces: [], message: 'Nothing selected' };
      }
      const pieces = state.project.pieces
        .filter((p: any) => selectedIds.includes(p.id))
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          category: p.category || null,
          side: p.side || null,
          hasGrainLine: !!p.grainLine,
          grainDirection: p.grainLine?.direction || null,
          edgeCount: p.edges?.length || 0,
          edges: (p.edges || []).map((e: any) => ({ name: e.name, edgeType: e.edgeType, length: e.length })),
          dartCount: p.darts?.length || 0,
          seamAllowance: p.seamAllowance || 0,
          internalCount: p.internals?.length || 0,
        }));
      return { success: true, selectedCount: pieces.length, pieces };
    },
  },
  {
    name: 'getProjectSummary',
    description: 'Get project overview: piece count, seam count, measurement state, fabrics, simulation readiness.',
    parameters: { type: 'object', properties: {} },
    execute: async (_params, _dispatch, getState) => {
      const state = getState();
      const project = state.project;
      const sim = state.simulation;
      const pieces = project.pieces || [];
      const seams = project.seams || [];
      const fabrics = project.fabrics || [];
      const avatar = project.avatar;
      const measurements = avatar?.measurements || {};
      const measKeys = Object.keys(measurements).filter((k: string) => (measurements as any)[k] > 0);

      return {
        success: true,
        pieceCount: pieces.length,
        pieceNames: pieces.map((p: any) => p.name),
        seamCount: seams.length,
        fabricCount: fabrics.length,
        measurementsSet: measKeys.length,
        measurementKeys: measKeys,
        hasMeasurements: measKeys.length > 0,
        simulationState: sim.simulationState,
        categorized: pieces.filter((p: any) => p.category).length,
        withGrainLine: pieces.filter((p: any) => p.grainLine).length,
        withEdges: pieces.filter((p: any) => p.edges && p.edges.length > 0).length,
        withDarts: pieces.filter((p: any) => p.darts && p.darts.length > 0).length,
      };
    },
  },
  {
    name: 'getSimulationState',
    description: 'Get simulation status: running/paused/idle, solver tier, FPS, particle count, quality level, fabric assignments.',
    parameters: { type: 'object', properties: {} },
    execute: async (_params, _dispatch, getState) => {
      const state = getState();
      const sim = state.simulation;
      return {
        success: true,
        state: sim.simulationState,
        solverTier: sim.solverTier,
        frameTimeMs: sim.frameTimeMs,
        fps: sim.frameTimeMs > 0 ? Math.round(1000 / sim.frameTimeMs) : 0,
        particleCount: sim.particleCount,
        qualityLevel: sim.qualityLevel,
        autoQuality: sim.autoQuality,
        pieceFabrics: sim.pieceFabrics,
      };
    },
  },
  {
    name: 'getUndoState',
    description: 'Get undo/redo availability and stack depth.',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      return {
        success: true,
        canUndo: canUndo(),
        canRedo: canRedo(),
        undoDepth: getUndoLength(),
        redoDepth: getRedoLength(),
      };
    },
  },
];
