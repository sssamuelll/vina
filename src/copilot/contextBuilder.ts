/**
 * Agent Context Builder — reads Redux state and builds the context object
 * sent to the LLM alongside messages.
 *
 * Summarizes pieces (name, bounds, SA, internal count) without sending full outlines
 * to keep token usage manageable.
 *
 * @module contextBuilder
 */

import type { RootState } from '../store';
import type { PatternPiece, PathCommand } from '../types/types';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Summary of a single pattern piece for agent context.
 */
export interface PieceSummary {
  id: string;
  name: string;
  bounds: { width: number; height: number };
  seamAllowance: number;
  mirrored: boolean;
  rotation: number;
  position: { x: number; y: number };
  internals: { type: string; count: number }[];
  fabricId?: string;
}

/**
 * Summary of a seam connection for agent context.
 */
export interface SeamSummary {
  id: string;
  pieceAId: string;
  pieceBId: string;
  type: string;
}

/**
 * Summary of a fabric for agent context.
 */
export interface FabricSummary {
  id: string;
  name: string;
  weight: number;
}

/**
 * Complete agent context built from Redux state.
 */
export interface AgentContext {
  project: {
    name: string;
    pieces: PieceSummary[];
    seams: SeamSummary[];
    fabrics: FabricSummary[];
    measurements: Record<string, number>;
  };
  editor: {
    selectedPieceIds: string[];
    selectedSeamId: string | null;
    activeTool: string;
    viewMode: string;
    units: string;
    showSeamAllowance: boolean;
  };
  simulation: {
    state: string;
    pieceFabrics: Record<string, string>;
  };
}

/**
 * Compute bounding box from piece outline.
 */
function computeBounds(outline: PathCommand[]): { width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cmd of outline) {
    for (let i = 0; i < cmd.values.length - 1; i += 2) {
      minX = Math.min(minX, cmd.values[i]);
      minY = Math.min(minY, cmd.values[i + 1]);
      maxX = Math.max(maxX, cmd.values[i]);
      maxY = Math.max(maxY, cmd.values[i + 1]);
    }
  }
  if (!isFinite(minX)) return { width: 0, height: 0 };
  return { width: Math.round(maxX - minX), height: Math.round(maxY - minY) };
}

/**
 * Summarize a pattern piece for the agent context.
 */
function summarizePiece(piece: PatternPiece): PieceSummary {
  const internalCounts: Record<string, number> = {};
  for (const line of piece.internals) {
    internalCounts[line.type] = (internalCounts[line.type] || 0) + 1;
  }

  return {
    id: piece.id,
    name: piece.name,
    bounds: computeBounds(piece.outline),
    seamAllowance: piece.seamAllowance,
    mirrored: piece.mirrored,
    rotation: piece.rotation,
    position: piece.position,
    internals: Object.entries(internalCounts).map(([type, count]) => ({ type, count })),
    fabricId: piece.fabricId,
  };
}

/**
 * Build the complete agent context from the current Redux state.
 *
 * This function extracts and summarizes the relevant information from the
 * Redux store, keeping the payload compact for LLM consumption.
 *
 * @param state - Current Redux root state
 * @returns AgentContext object ready for serialization
 */
export function buildAgentContext(state: RootState): AgentContext {
  const { project, editor, simulation } = state;

  return {
    project: {
      name: project.name,
      pieces: project.pieces.map(summarizePiece),
      seams: project.seams.map(s => ({
        id: s.id,
        pieceAId: s.pieceA.pieceId,
        pieceBId: s.pieceB.pieceId,
        type: s.type,
      })),
      fabrics: project.fabrics.map(f => ({
        id: f.id,
        name: f.name,
        weight: f.weight,
      })),
      measurements: project.avatar.measurements as unknown as Record<string, number>,
    },
    editor: {
      selectedPieceIds: editor.selectedPieceIds,
      selectedSeamId: editor.selectedSeamId,
      activeTool: editor.activeTool,
      viewMode: editor.viewMode,
      units: editor.units,
      showSeamAllowance: editor.showSeamAllowance,
    },
    simulation: {
      state: simulation.simulationState,
      pieceFabrics: simulation.pieceFabrics,
    },
  };
}

/**
 * Serialize agent context to a compact string for the system prompt.
 * Only includes non-empty data to save tokens.
 *
 * @param context - The agent context
 * @returns Compact JSON string
 */
export function serializeContext(context: AgentContext): string {
  const parts: string[] = [];

  parts.push(`Project: "${context.project.name}"`);
  parts.push(`Units: ${context.editor.units} | View: ${context.editor.viewMode} | SA visible: ${context.editor.showSeamAllowance}`);

  if (context.project.pieces.length > 0) {
    parts.push(`\nPieces (${context.project.pieces.length}):`);
    for (const p of context.project.pieces) {
      const selected = context.editor.selectedPieceIds.includes(p.id) ? ' [SELECTED]' : '';
      const internals = p.internals.length > 0 ? ` | ${p.internals.map(i => `${i.count}×${i.type}`).join(', ')}` : '';
      parts.push(`  - ${p.name} (${p.bounds.width}×${p.bounds.height}mm) SA=${p.seamAllowance}mm${internals}${selected}`);
    }
  } else {
    parts.push('\nNo pieces yet.');
  }

  if (context.project.seams.length > 0) {
    parts.push(`\nSeams (${context.project.seams.length}):`);
    for (const s of context.project.seams) {
      parts.push(`  - ${s.pieceAId} ↔ ${s.pieceBId} (${s.type})`);
    }
  }

  const m = context.project.measurements;
  const primary = ['height', 'chest', 'waist', 'hips', 'shoulder', 'armLength', 'inseam'];
  const measStr = primary
    .filter(k => m[k] !== undefined)
    .map(k => `${k}=${m[k]}cm`)
    .join(', ');
  if (measStr) {
    parts.push(`\nMeasurements: ${measStr}`);
  }

  if (context.simulation.state !== 'idle') {
    parts.push(`\nSimulation: ${context.simulation.state}`);
  }

  return parts.join('\n');
}
