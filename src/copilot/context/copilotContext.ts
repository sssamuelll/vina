/**
 * Copilot Context — Phase 3 of Issue #130
 *
 * Enhanced context generation for LLM requests. Provides comprehensive
 * state information while keeping token usage efficient.
 *
 * @module copilotContext
 */

import type { RootState } from '../../store';
import type { PatternPiece, PathCommand, PieceCategory } from '../../types/types';
import { getRecentActions, type TrackedAction } from './recentActionsTracker';

// ============================================================================
// Types
// ============================================================================

/**
 * Piece information for copilot context.
 */
export interface CopilotPieceInfo {
  id: string;
  name: string;
  /** Piece category/type (bodice, sleeve, collar, etc.) */
  category?: PieceCategory;
  /** Bounding box dimensions in mm */
  bounds: { width: number; height: number };
  /** Calculated area in mm² */
  area: number;
  /** Seam allowance in mm */
  seamAllowance: number;
  /** Whether piece is mirrored */
  mirrored: boolean;
  /** Rotation in degrees */
  rotation: number;
  /** Position on 2D canvas */
  position: { x: number; y: number };
  /** Internal features summary */
  internals: { type: string; count: number }[];
  /** Assigned fabric ID */
  fabricId?: string;
  /** Number of edges in outline */
  edgeCount: number;
}

/**
 * Seam information for copilot context.
 */
export interface CopilotSeamInfo {
  id: string;
  pieceA: { pieceId: string; pieceName: string };
  pieceB: { pieceId: string; pieceName: string };
  type: string;
}

/**
 * Current selection state.
 */
export interface CopilotSelection {
  /** Selected piece IDs */
  pieces: string[];
  /** Selected piece names (for convenience) */
  pieceNames: string[];
  /** Selected edges (if any) */
  edges: { pieceId: string; edgeIndex: number }[];
  /** Selected points (if any) */
  points: { pieceId: string; pointIndex: number }[];
  /** Selected seam ID */
  seamId: string | null;
}

/**
 * Current view state.
 */
export interface CopilotViewState {
  /** View mode: 2d, 3d, or split */
  mode: '2d' | '3d' | 'split';
  /** Active tool ID */
  activeTool: string;
  /** Current tool options */
  toolOptions: Record<string, unknown>;
  /** Unit system */
  units: 'mm' | 'cm' | 'in';
  /** Whether seam allowance is visible */
  showSeamAllowance: boolean;
  /** Zoom level (2D) */
  zoom2D: number;
}

/**
 * Simulation state.
 */
export interface CopilotSimulationState {
  /** Current simulation state */
  state: 'idle' | 'running' | 'paused';
  /** Quality preset */
  qualityLevel: string;
  /** Whether fit map is visible */
  fitMapVisible: boolean;
  /** Active fit map mode */
  fitMapMode: string;
  /** 3D view mode */
  viewMode3D: 'arrange' | 'simulate';
  /** Active solver tier */
  solverTier: string;
}

/**
 * Avatar state.
 */
export interface CopilotAvatarState {
  /** Avatar type */
  type: 'dressform' | 'model';
  /** Key body measurements in cm */
  measurements: {
    height?: number;
    chest?: number;
    waist?: number;
    hips?: number;
    shoulder?: number;
    armLength?: number;
    inseam?: number;
    [key: string]: number | undefined;
  };
  /** Current pose ID (if applicable) */
  pose?: string;
}

/**
 * Complete copilot context.
 */
export interface CopilotContext {
  /** Project information */
  project: {
    name: string;
    pieceCount: number;
    seamCount: number;
    pieces: CopilotPieceInfo[];
    seams: CopilotSeamInfo[];
    fabrics: { id: string; name: string; weight: number }[];
  };

  /** Current selection */
  selection: CopilotSelection;

  /** View state */
  view: CopilotViewState;

  /** Simulation state */
  simulation: CopilotSimulationState;

  /** Avatar state */
  avatar: CopilotAvatarState;

  /** Recent actions for conversation continuity */
  recentActions: TrackedAction[];

  /** Active pattern skills (from user message analysis) */
  activeSkills: string[];

  /** Context generation timestamp */
  timestamp: number;
}

// ============================================================================
// Calculation Helpers
// ============================================================================

/**
 * Calculate bounding box from outline.
 */
function calculateBounds(outline: PathCommand[]): { width: number; height: number } {
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
  return {
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  };
}

/**
 * Calculate polygon area using shoelace formula.
 */
function calculateArea(outline: PathCommand[]): number {
  const points: [number, number][] = [];

  for (const cmd of outline) {
    if (cmd.type === 'M' || cmd.type === 'L') {
      points.push([cmd.values[0], cmd.values[1]]);
    } else if (cmd.type === 'C') {
      // For curves, just use endpoint
      points.push([cmd.values[4], cmd.values[5]]);
    } else if (cmd.type === 'Q') {
      points.push([cmd.values[2], cmd.values[3]]);
    }
  }

  if (points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }

  return Math.abs(area / 2);
}

/**
 * Count edges in outline (excluding Z command).
 */
function countEdges(outline: PathCommand[]): number {
  return outline.filter(c => c.type !== 'Z').length;
}

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build piece info from PatternPiece.
 */
function buildPieceInfo(piece: PatternPiece, fabricId?: string): CopilotPieceInfo {
  const internalCounts: Record<string, number> = {};
  for (const line of piece.internals) {
    internalCounts[line.type] = (internalCounts[line.type] || 0) + 1;
  }

  return {
    id: piece.id,
    name: piece.name,
    category: piece.category,
    bounds: calculateBounds(piece.outline),
    area: calculateArea(piece.outline),
    seamAllowance: piece.seamAllowance,
    mirrored: piece.mirrored,
    rotation: piece.rotation,
    position: piece.position,
    internals: Object.entries(internalCounts).map(([type, count]) => ({ type, count })),
    fabricId,
    edgeCount: countEdges(piece.outline),
  };
}

/**
 * Generate complete copilot context from Redux state.
 *
 * @param state - Current Redux root state
 * @param activeSkills - Active pattern skills from message analysis
 * @param recentActionCount - Number of recent actions to include
 * @returns Complete CopilotContext
 */
export function generateCopilotContext(
  state: RootState,
  activeSkills: string[] = [],
  recentActionCount = 10
): CopilotContext {
  const { project, editor, simulation } = state;

  // Build piece name lookup for seams
  const pieceNameMap = new Map(project.pieces.map(p => [p.id, p.name]));

  // Get tool options from tools slice if available
  const toolOptions: Record<string, unknown> = {};
  if (state.tools?.toolOptions && editor.activeTool) {
    const activeToolOptions = state.tools.toolOptions[editor.activeTool];
    if (activeToolOptions) {
      Object.assign(toolOptions, activeToolOptions);
    }
  }

  return {
    project: {
      name: project.name,
      pieceCount: project.pieces.length,
      seamCount: project.seams.length,
      pieces: project.pieces.map(p =>
        buildPieceInfo(p, simulation.pieceFabrics[p.id])
      ),
      seams: project.seams.map(s => ({
        id: s.id,
        pieceA: {
          pieceId: s.pieceA.pieceId,
          pieceName: pieceNameMap.get(s.pieceA.pieceId) || 'Unknown',
        },
        pieceB: {
          pieceId: s.pieceB.pieceId,
          pieceName: pieceNameMap.get(s.pieceB.pieceId) || 'Unknown',
        },
        type: s.type,
      })),
      fabrics: project.fabrics.map(f => ({
        id: f.id,
        name: f.name,
        weight: f.weight,
      })),
    },

    selection: {
      pieces: editor.selectedPieceIds,
      pieceNames: editor.selectedPieceIds
        .map(id => pieceNameMap.get(id))
        .filter((n): n is string => n !== undefined),
      edges: [], // TODO: Add edge selection tracking
      points: [], // TODO: Add point selection tracking
      seamId: editor.selectedSeamId,
    },

    view: {
      mode: editor.viewMode as '2d' | '3d' | 'split',
      activeTool: editor.activeTool,
      toolOptions,
      units: editor.units as 'mm' | 'cm' | 'in',
      showSeamAllowance: editor.showSeamAllowance,
      zoom2D: editor.zoom2D,
    },

    simulation: {
      state: simulation.simulationState,
      qualityLevel: simulation.qualityLevel,
      fitMapVisible: simulation.fitMapMode !== 'none',
      fitMapMode: simulation.fitMapMode,
      viewMode3D: simulation.viewMode3D,
      solverTier: simulation.solverTier,
    },

    avatar: {
      type: project.avatarMode,
      measurements: project.avatar.measurements as CopilotAvatarState['measurements'],
      pose: undefined, // TODO: Add pose tracking when available
    },

    recentActions: getRecentActions(recentActionCount),
    activeSkills,
    timestamp: Date.now(),
  };
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize context to a compact string for LLM consumption.
 * Optimized for token efficiency while maintaining usefulness.
 *
 * @param context - The copilot context
 * @returns Compact string representation
 */
export function serializeCopilotContext(context: CopilotContext): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Project: "${context.project.name}"`);
  lines.push(`View: ${context.view.mode} | Tool: ${context.view.activeTool} | Units: ${context.view.units}`);

  // Pieces
  if (context.project.pieceCount > 0) {
    lines.push(`\n## Pieces (${context.project.pieceCount})`);
    for (const p of context.project.pieces) {
      const selected = context.selection.pieces.includes(p.id) ? ' **[SELECTED]**' : '';
      const category = p.category ? ` [${p.category}]` : '';
      const internals = p.internals.length > 0
        ? ` | ${p.internals.map(i => `${i.count}×${i.type}`).join(', ')}`
        : '';
      const area = (p.area / 100).toFixed(1); // cm²
      lines.push(`- **${p.name}**${category}: ${p.bounds.width}×${p.bounds.height}mm (${area}cm²) SA=${p.seamAllowance}mm${internals}${selected}`);
    }
  } else {
    lines.push('\n## Pieces: None');
  }

  // Seams
  if (context.project.seamCount > 0) {
    lines.push(`\n## Seams (${context.project.seamCount})`);
    for (const s of context.project.seams) {
      lines.push(`- ${s.pieceA.pieceName} ↔ ${s.pieceB.pieceName} (${s.type})`);
    }
  }

  // Avatar
  const m = context.avatar.measurements;
  const measurements = ['height', 'chest', 'waist', 'hips', 'shoulder']
    .filter(k => m[k] !== undefined)
    .map(k => `${k}=${m[k]}cm`)
    .join(', ');
  if (measurements) {
    lines.push(`\n## Avatar (${context.avatar.type})`);
    lines.push(`Measurements: ${measurements}`);
  }

  // Simulation
  if (context.simulation.state !== 'idle') {
    lines.push(`\n## Simulation: ${context.simulation.state}`);
    lines.push(`Quality: ${context.simulation.qualityLevel} | Solver: ${context.simulation.solverTier}`);
    if (context.simulation.fitMapVisible) {
      lines.push(`Fit Map: ${context.simulation.fitMapMode}`);
    }
  }

  // Recent actions
  if (context.recentActions.length > 0) {
    lines.push(`\n## Recent Actions`);
    for (const action of context.recentActions.slice(-5)) {
      const status = action.success ? '✓' : '✗';
      lines.push(`- ${status} ${action.action}: ${action.result}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate a minimal context update (delta) since last context.
 * Useful for incremental updates to save tokens.
 *
 * @param current - Current context
 * @param previous - Previous context
 * @returns Delta object with only changed fields
 */
export function generateContextDelta(
  current: CopilotContext,
  previous: CopilotContext
): Partial<CopilotContext> {
  const delta: Partial<CopilotContext> = {};

  // Check selection changes
  if (JSON.stringify(current.selection) !== JSON.stringify(previous.selection)) {
    delta.selection = current.selection;
  }

  // Check piece count changes
  if (current.project.pieceCount !== previous.project.pieceCount) {
    delta.project = current.project;
  }

  // Check simulation state changes
  if (current.simulation.state !== previous.simulation.state) {
    delta.simulation = current.simulation;
  }

  // Check view changes
  if (current.view.activeTool !== previous.view.activeTool ||
      current.view.mode !== previous.view.mode) {
    delta.view = current.view;
  }

  // Always include recent actions (they're the delta by nature)
  const newActions = current.recentActions.filter(
    a => a.timestamp > previous.timestamp
  );
  if (newActions.length > 0) {
    delta.recentActions = newActions;
  }

  delta.timestamp = current.timestamp;

  return delta;
}
