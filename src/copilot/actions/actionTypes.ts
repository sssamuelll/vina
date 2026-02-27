/**
 * Copilot Action Types — Defines the actions the copilot can execute.
 *
 * @module actionTypes
 */

// ============================================================================
// Action Type Definitions
// ============================================================================

/**
 * All possible copilot action types.
 */
export type CopilotActionType =
  | 'select_piece'
  | 'select_edge'
  | 'deselect_all'
  | 'create_piece'
  | 'delete_piece'
  | 'duplicate_piece'
  | 'mirror_piece'
  | 'move_piece'
  | 'rotate_piece'
  | 'scale_piece'
  | 'add_seam'
  | 'remove_seam'
  | 'auto_detect_seams'
  | 'add_seam_allowance'
  | 'add_dart'
  | 'measure_edge'
  | 'measure_distance'
  | 'start_simulation'
  | 'stop_simulation'
  | 'reset_simulation'
  | 'set_tool'
  | 'undo'
  | 'redo';

/**
 * Base interface for all copilot actions.
 */
export interface CopilotActionBase {
  action: CopilotActionType;
}

/**
 * Select a piece by ID.
 */
export interface SelectPieceAction extends CopilotActionBase {
  action: 'select_piece';
  pieceId: string;
}

/**
 * Select an edge on a piece.
 */
export interface SelectEdgeAction extends CopilotActionBase {
  action: 'select_edge';
  pieceId: string;
  edgeIndex: number;
}

/**
 * Deselect all.
 */
export interface DeselectAllAction extends CopilotActionBase {
  action: 'deselect_all';
}

/**
 * Create a new piece.
 */
export interface CreatePieceAction extends CopilotActionBase {
  action: 'create_piece';
  shape: 'rectangle' | 'circle' | 'from_blueprint' | 'custom';
  params?: {
    name?: string;
    width?: number;
    height?: number;
    blueprintId?: string;
    points?: Array<{ x: number; y: number }>;
  };
}

/**
 * Delete a piece.
 */
export interface DeletePieceAction extends CopilotActionBase {
  action: 'delete_piece';
  pieceId: string;
}

/**
 * Duplicate a piece.
 */
export interface DuplicatePieceAction extends CopilotActionBase {
  action: 'duplicate_piece';
  pieceId: string;
  offset?: { x: number; y: number };
}

/**
 * Mirror a piece.
 */
export interface MirrorPieceAction extends CopilotActionBase {
  action: 'mirror_piece';
  pieceId: string;
  axis: 'horizontal' | 'vertical';
}

/**
 * Move a piece.
 */
export interface MovePieceAction extends CopilotActionBase {
  action: 'move_piece';
  pieceId: string;
  delta: { x: number; y: number };
}

/**
 * Rotate a piece.
 */
export interface RotatePieceAction extends CopilotActionBase {
  action: 'rotate_piece';
  pieceId: string;
  angle: number;
}

/**
 * Scale a piece.
 */
export interface ScalePieceAction extends CopilotActionBase {
  action: 'scale_piece';
  pieceId: string;
  factor: number | { x: number; y: number };
}

/**
 * Add a seam between edges.
 */
export interface AddSeamAction extends CopilotActionBase {
  action: 'add_seam';
  pieceId1: string;
  edgeIndex1: number;
  pieceId2: string;
  edgeIndex2: number;
}

/**
 * Remove a seam.
 */
export interface RemoveSeamAction extends CopilotActionBase {
  action: 'remove_seam';
  seamId: string;
}

/**
 * Auto-detect seams between pieces.
 */
export interface AutoDetectSeamsAction extends CopilotActionBase {
  action: 'auto_detect_seams';
  pieceIds?: string[];
}

/**
 * Add seam allowance to a piece.
 */
export interface AddSeamAllowanceAction extends CopilotActionBase {
  action: 'add_seam_allowance';
  pieceId: string;
  amount: number;
  edges?: number[];
}

/**
 * Add a dart to a piece.
 */
export interface AddDartAction extends CopilotActionBase {
  action: 'add_dart';
  pieceId: string;
  position: { x: number; y: number };
  width: number;
  length: number;
  angle?: number;
}

/**
 * Measure an edge.
 */
export interface MeasureEdgeAction extends CopilotActionBase {
  action: 'measure_edge';
  pieceId: string;
  edgeIndex: number;
}

/**
 * Measure distance between points.
 */
export interface MeasureDistanceAction extends CopilotActionBase {
  action: 'measure_distance';
  point1: { x: number; y: number };
  point2: { x: number; y: number };
}

/**
 * Start simulation.
 */
export interface StartSimulationAction extends CopilotActionBase {
  action: 'start_simulation';
}

/**
 * Stop simulation.
 */
export interface StopSimulationAction extends CopilotActionBase {
  action: 'stop_simulation';
}

/**
 * Reset simulation.
 */
export interface ResetSimulationAction extends CopilotActionBase {
  action: 'reset_simulation';
}

/**
 * Set active tool.
 */
export interface SetToolAction extends CopilotActionBase {
  action: 'set_tool';
  toolId: string;
}

/**
 * Undo action.
 */
export interface UndoAction extends CopilotActionBase {
  action: 'undo';
}

/**
 * Redo action.
 */
export interface RedoAction extends CopilotActionBase {
  action: 'redo';
}

/**
 * Union of all copilot actions.
 */
export type CopilotAction =
  | SelectPieceAction
  | SelectEdgeAction
  | DeselectAllAction
  | CreatePieceAction
  | DeletePieceAction
  | DuplicatePieceAction
  | MirrorPieceAction
  | MovePieceAction
  | RotatePieceAction
  | ScalePieceAction
  | AddSeamAction
  | RemoveSeamAction
  | AutoDetectSeamsAction
  | AddSeamAllowanceAction
  | AddDartAction
  | MeasureEdgeAction
  | MeasureDistanceAction
  | StartSimulationAction
  | StopSimulationAction
  | ResetSimulationAction
  | SetToolAction
  | UndoAction
  | RedoAction;

/**
 * Result of executing an action.
 */
export interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}
