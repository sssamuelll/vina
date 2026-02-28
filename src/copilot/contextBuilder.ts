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
import type { PatternPiece, PathCommand, Seam } from '../types/types';
import type { PieceSemantics, SpatialRelationship, SpatialConflict } from './vision';
import type { CerebralContext, DesignLogEntry, SkillOverride } from './vision/types';
import { generateFingerprint, describeSpatialRelationships } from './vision';

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
  /** Names of active pattern skills matched from user message */
  activeSkills: string[];
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
export function buildAgentContext(state: RootState, activeSkills: string[] = []): AgentContext {
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
    activeSkills,
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

/**
 * Build semantic analysis for a single piece.
 */
export function buildPieceSemantics(piece: PatternPiece): PieceSemantics {
  const fingerprint = generateFingerprint(piece.id, piece.outline);

  return {
    pieceId: piece.id,
    fingerprint,
    // bestMatch and avatarProximity are optional, computed separately
  };
}

/**
 * Result of spatial analysis.
 */
export interface SpatialAnalysisResult {
  relationships: SpatialRelationship[];
  conflicts: SpatialConflict[];
}

/**
 * Convert a 2D outline to a 3D vertex array (z=0).
 */
function outlineToVertices(outline: PathCommand[], position: { x: number; y: number }): Float32Array {
  const points: number[] = [];

  for (const cmd of outline) {
    // Extract x,y pairs from command values
    for (let i = 0; i < cmd.values.length - 1; i += 2) {
      const x = cmd.values[i] + position.x;
      const y = cmd.values[i + 1] + position.y;
      points.push(x, y, 0); // z = 0 for 2D layout
    }
  }

  return new Float32Array(points);
}

/**
 * Build spatial relationships between all pieces.
 */
export function buildSpatialRelationships(
  pieces: PatternPiece[],
  seams: Seam[],
): SpatialAnalysisResult {
  if (pieces.length < 2) {
    return { relationships: [], conflicts: [] };
  }

  // Convert pieces to spatial input format
  const spatialPieces = pieces.map(p => ({
    id: p.id,
    vertices: outlineToVertices(p.outline, p.position),
  }));

  // Build positions map (already incorporated into vertices, so use zero offsets)
  const positions: Record<string, [number, number, number]> = {};
  for (const p of pieces) {
    positions[p.id] = [0, 0, 0];
  }

  // Convert seams to spatial input format
  const spatialSeams = seams.map(s => ({
    pieceAId: s.pieceA.pieceId,
    pieceBId: s.pieceB.pieceId,
  }));

  const result = describeSpatialRelationships({
    pieces: spatialPieces,
    positions,
    seams: spatialSeams,
  });

  return {
    relationships: result.relationships,
    conflicts: result.conflicts,
  };
}

/** Priority weights for entry types (higher = more important) */
const ENTRY_TYPE_PRIORITY: Record<string, number> = {
  warning: 3,
  constraint: 2,
  decision: 1,
  note: 0,
};

/**
 * Get recent design decisions, prioritizing warnings and constraints.
 */
export function getRecentDecisions(
  entries: DesignLogEntry[],
  limit: number,
): DesignLogEntry[] {
  if (entries.length === 0) return [];

  // Sort by priority (desc) then timestamp (desc)
  const sorted = [...entries].sort((a, b) => {
    const priorityDiff = (ENTRY_TYPE_PRIORITY[b.type] ?? 0) - (ENTRY_TYPE_PRIORITY[a.type] ?? 0);
    if (priorityDiff !== 0) return priorityDiff;
    return b.timestamp - a.timestamp;
  });

  return sorted.slice(0, limit);
}

/**
 * Input for building cerebral context.
 */
export interface CerebralContextInput {
  /** Pattern pieces */
  pieces: PatternPiece[];
  /** Seams connecting pieces */
  seams: Seam[];
  /** Design log entries */
  designLogEntries: DesignLogEntry[];
  /** Active formula overrides */
  overrides: SkillOverride[];
  /** Maximum recent decisions to include (default: 10) */
  maxDecisions?: number;
}

/**
 * Build the complete cerebral context for LLM consumption.
 */
export function buildCerebralContext(input: CerebralContextInput): CerebralContext {
  const { pieces, seams, designLogEntries, overrides, maxDecisions = 10 } = input;

  // Build piece semantics
  const pieceSemantics = pieces.map(buildPieceSemantics);

  // Build spatial relationships
  const spatial = buildSpatialRelationships(pieces, seams);

  // Get recent decisions
  const recentDecisions = getRecentDecisions(designLogEntries, maxDecisions);

  return {
    pieceSemantics,
    spatialRelationships: spatial.relationships,
    conflicts: spatial.conflicts,
    recentDecisions,
    activeOverrides: overrides,
  };
}

/**
 * Serialize cerebral context for LLM system prompt.
 */
export function serializeCerebralContext(context: CerebralContext): string {
  const sections: string[] = [];

  // Piece analysis section
  if (context.pieceSemantics.length > 0) {
    sections.push('## Piece Analysis');
    for (const ps of context.pieceSemantics) {
      const fp = ps.fingerprint;
      const segTypes = fp.segmentTypes.join(', ');
      const density = (fp.curvatureDensity * 100).toFixed(0);
      sections.push(`- **${ps.pieceId}**: ${segTypes} | ${density}% curved`);
      if (fp.landmarks.length > 0) {
        const landmarks = fp.landmarks.map(l => l.label).join(', ');
        sections.push(`  - Landmarks: ${landmarks}`);
      }
    }
    sections.push('');
  }

  // Spatial relationships section
  if (context.spatialRelationships.length > 0) {
    sections.push('## Spatial Relationships');
    for (const rel of context.spatialRelationships) {
      const sewn = rel.hasSewingConnection ? ' [sewn]' : '';
      sections.push(`- ${rel.pieceAId} ↔ ${rel.pieceBId}: ${rel.type} (${rel.distance3D.toFixed(1)}mm)${sewn}`);
    }
    sections.push('');
  }

  // Conflicts section
  if (context.conflicts.length > 0) {
    sections.push('## ⚠️ Conflicts');
    for (const c of context.conflicts) {
      sections.push(`- [${c.severity.toUpperCase()}] ${c.type}: ${c.description}`);
    }
    sections.push('');
  }

  // Recent decisions section
  if (context.recentDecisions.length > 0) {
    sections.push('## Recent Decisions');
    for (const d of context.recentDecisions) {
      const icon = d.type === 'warning' ? '⚠️' : d.type === 'constraint' ? '🔒' : '📝';
      sections.push(`- ${icon} ${d.summary}`);
    }
    sections.push('');
  }

  // Overrides section
  if (context.activeOverrides.length > 0) {
    sections.push('## User Formula Overrides');
    for (const o of context.activeOverrides) {
      sections.push(`- **${o.formulaName}** (${o.skillId}): \`${o.overrideValue}\``);
      sections.push(`  - Reason: ${o.reason}`);
    }
    sections.push('');
  }

  if (sections.length === 0) {
    return '## Context\nNo pieces or design history yet.';
  }

  return sections.join('\n');
}
