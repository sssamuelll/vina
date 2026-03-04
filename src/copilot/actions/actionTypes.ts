/**
 * Copilot Action Types — Phase 2 of Issue #130
 *
 * These domain-specific actions go beyond individual tools, providing
 * higher-level operations that the Copilot can execute. Each action
 * is validated, creates an undo checkpoint, and can be composed into
 * multi-step plans.
 *
 * @module actionTypes
 */

import type { PathCommand, Point2D } from '../../types/types';

// ============================================================================
// Selection Actions
// ============================================================================

export interface SelectPieceAction {
  action: 'select_piece';
  pieceId: string;
}

export interface SelectPiecesAction {
  action: 'select_pieces';
  /** Natural language query like "all sleeve pieces" or explicit IDs */
  query: string | string[];
}

export interface SelectEdgeAction {
  action: 'select_edge';
  pieceId: string;
  edgeIndex: number;
}

export interface SelectPointAction {
  action: 'select_point';
  pieceId: string;
  pointIndex: number;
}

export interface ClearSelectionAction {
  action: 'clear_selection';
}

export type SelectionAction =
  | SelectPieceAction
  | SelectPiecesAction
  | SelectEdgeAction
  | SelectPointAction
  | ClearSelectionAction;

// ============================================================================
// Piece Operations
// ============================================================================

export interface CreatePieceAction {
  action: 'create_piece';
  shape: 'rectangle' | 'from_points' | 'from_outline';
  params: {
    name?: string;
    /** For rectangle: width and height in mm */
    width?: number;
    height?: number;
    /** For from_points: array of [x, y] coordinates */
    points?: [number, number][];
    /** For from_outline: PathCommand array */
    outline?: PathCommand[];
    /** Position to place the piece */
    position?: Point2D;
  };
}

export interface DuplicatePieceAction {
  action: 'duplicate_piece';
  pieceId: string;
  /** Offset from original [x, y] in mm */
  offset?: [number, number];
  /** New name for the duplicate */
  newName?: string;
}

export interface DeletePieceAction {
  action: 'delete_piece';
  pieceId: string;
  /** If true, also delete connected seams (default: true) */
  deleteConnectedSeams?: boolean;
}

export interface RenamePieceAction {
  action: 'rename_piece';
  pieceId: string;
  name: string;
}

export interface MirrorPieceAction {
  action: 'mirror_piece';
  pieceId: string;
  axis: 'x' | 'y';
  /** If true, create a mirrored copy instead of modifying in place */
  createCopy?: boolean;
}

export interface MovePieceAction {
  action: 'move_piece';
  pieceId: string;
  /** Absolute position or relative delta */
  position: Point2D | { dx: number; dy: number };
  relative?: boolean;
}

export interface RotatePieceAction {
  action: 'rotate_piece';
  pieceId: string;
  /** Angle in degrees */
  angle: number;
  /** Center of rotation (defaults to piece center) */
  center?: Point2D;
}

export interface ScalePieceAction {
  action: 'scale_piece';
  pieceId: string;
  /** Scale factor (1.0 = no change, 2.0 = double) */
  factor: number;
  /** If true, scale uniformly; if false, allow separate x/y factors */
  uniform?: boolean;
  factorX?: number;
  factorY?: number;
}

export type PieceAction =
  | CreatePieceAction
  | DuplicatePieceAction
  | DeletePieceAction
  | RenamePieceAction
  | MirrorPieceAction
  | MovePieceAction
  | RotatePieceAction
  | ScalePieceAction;

// ============================================================================
// Geometry Modification
// ============================================================================

export interface MovePointAction {
  action: 'move_point';
  pieceId: string;
  pointIndex: number;
  /** Delta movement [dx, dy] in mm */
  delta: [number, number];
}

export interface AddPointAction {
  action: 'add_point';
  pieceId: string;
  edgeIndex: number;
  /** Position along edge (0 = start, 1 = end) */
  position: number;
}

export interface DeletePointAction {
  action: 'delete_point';
  pieceId: string;
  pointIndex: number;
}

export interface AddEaseAction {
  action: 'add_ease';
  pieceId: string;
  /** Edge index or 'all' for entire piece */
  edge: number | 'all';
  /** Ease amount in mm */
  amount: number;
  /** Distribution: uniform, center-weighted, or custom */
  distribution?: 'uniform' | 'center' | 'custom';
}

export interface AddDartAction {
  action: 'add_dart';
  pieceId: string;
  /** Position on piece [x, y] in mm */
  position: [number, number];
  /** Dart angle in degrees */
  angle: number;
  /** Dart depth (length) in mm */
  depth: number;
  /** Dart width at base in mm */
  width?: number;
}

export interface CurveEdgeAction {
  action: 'curve_edge';
  pieceId: string;
  edgeIndex: number;
  /** Curvature factor (-1 to 1, 0 = straight) */
  curvature: number;
}

export interface StraightenEdgeAction {
  action: 'straighten_edge';
  pieceId: string;
  edgeIndex: number;
}

export interface SplitEdgeAction {
  action: 'split_edge';
  pieceId: string;
  edgeIndex: number;
  /** Split position (0-1 along edge) */
  at: number;
}

export interface SplitPieceAction {
  action: 'split_piece';
  pieceId: string;
  startPoint: [number, number];
  endPoint: [number, number];
}

export interface MergePiecesAction {
  action: 'merge_pieces';
  pieceIdA: string;
  pieceIdB: string;
}

export type GeometryAction =
  | MovePointAction
  | AddPointAction
  | DeletePointAction
  | AddEaseAction
  | AddDartAction
  | CurveEdgeAction
  | StraightenEdgeAction
  | SplitEdgeAction
  | SplitPieceAction
  | MergePiecesAction;

// ============================================================================
// Seam Actions
// ============================================================================

export interface CreateSeamAction {
  action: 'create_seam';
  pieceA: string;
  /** Edge range for piece A: [start, end] indices */
  edgeA: number | [number, number];
  pieceB: string;
  /** Edge range for piece B: [start, end] indices */
  edgeB: number | [number, number];
  /** Seam type for simulation */
  type?: 'standard' | 'french' | 'flat-felled' | 'overlock';
}

export interface DeleteSeamAction {
  action: 'delete_seam';
  seamId: string;
}

export interface FlipSeamDirectionAction {
  action: 'flip_seam_direction';
  seamId: string;
}

export interface AutoDetectSeamsAction {
  action: 'auto_detect_seams';
  /** Only for specific pieces, or all if empty */
  pieceIds?: string[];
  /** Tolerance for edge matching in mm */
  tolerance?: number;
}

export type SeamAction =
  | CreateSeamAction
  | DeleteSeamAction
  | FlipSeamDirectionAction
  | AutoDetectSeamsAction;

// ============================================================================
// Topstitch Actions
// ============================================================================

export interface CreateTopstitchAction {
  action: 'create_topstitch';
  pieceId: string;
  edgeIndex: number;
  /** Stitch type */
  stitchType?: 'straight' | 'zigzag' | 'triple';
  /** Stitch length in mm */
  stitchLength?: number;
  /** Offset from edge in mm */
  offset?: number;
  /** Thread color (hex) */
  threadColor?: string;
  /** Number of parallel rows */
  rows?: number;
}

export type TopstitchAction = CreateTopstitchAction;

// ============================================================================
// Measurement Actions
// ============================================================================

export interface MeasureEdgeAction {
  action: 'measure_edge';
  pieceId: string;
  edgeIndex: number;
}

export interface MeasurePieceAreaAction {
  action: 'measure_piece_area';
  pieceId: string;
}

export interface CompareEdgesAction {
  action: 'compare_edges';
  edge1: { pieceId: string; edgeIndex: number };
  edge2: { pieceId: string; edgeIndex: number };
}

export interface MeasureDistanceAction {
  action: 'measure_distance';
  from: Point2D;
  to: Point2D;
}

export type MeasurementAction =
  | MeasureEdgeAction
  | MeasurePieceAreaAction
  | CompareEdgesAction
  | MeasureDistanceAction;

// ============================================================================
// Simulation Actions
// ============================================================================

export interface StartSimulationAction {
  action: 'start_simulation';
  quality?: 'fast' | 'normal' | 'high';
}

export interface StopSimulationAction {
  action: 'stop_simulation';
}

export interface ResetSimulationAction {
  action: 'reset_simulation';
}

export interface SetFabricAction {
  action: 'set_fabric';
  pieceId: string | 'all';
  fabricId: string;
}

export interface ShowFitMapAction {
  action: 'show_fit_map';
  enabled: boolean;
  /** Type of map to show */
  type?: 'stress' | 'strain' | 'fit' | 'pressure';
}

export type SimulationAction =
  | StartSimulationAction
  | StopSimulationAction
  | ResetSimulationAction
  | SetFabricAction
  | ShowFitMapAction;

// ============================================================================
// Avatar Actions
// ============================================================================

export interface SetAvatarMeasurementAction {
  action: 'set_avatar_measurement';
  /** Measurement key (chest, waist, hips, etc.) */
  measurement: string;
  /** Value in cm */
  value: number;
}

export interface SetAvatarMeasurementsAction {
  action: 'set_avatar_measurements';
  /** Multiple measurements at once */
  measurements: Record<string, number>;
}

export interface SetPoseAction {
  action: 'set_pose';
  poseId: string;
}

export interface SetAvatarTypeAction {
  action: 'set_avatar_type';
  type: 'dressform' | 'model';
}

export type AvatarAction =
  | SetAvatarMeasurementAction
  | SetAvatarMeasurementsAction
  | SetPoseAction
  | SetAvatarTypeAction;

// ============================================================================
// View Actions
// ============================================================================

export interface ZoomToPieceAction {
  action: 'zoom_to_piece';
  pieceId: string;
}

export interface ZoomToFitAction {
  action: 'zoom_to_fit';
}

export interface SwitchViewAction {
  action: 'switch_view';
  view: '2d' | '3d' | 'split';
}

export interface SetViewModeAction {
  action: 'set_view_mode';
  mode: 'edit' | 'preview' | 'simulation';
}

export interface TogglePanelAction {
  action: 'toggle_panel';
  panel: 'properties' | 'layers' | 'simulation' | 'measurements';
  visible: boolean;
}

export type ViewAction =
  | ZoomToPieceAction
  | ZoomToFitAction
  | SwitchViewAction
  | SetViewModeAction
  | TogglePanelAction;

// ============================================================================
// Project Actions
// ============================================================================

export interface SaveProjectAction {
  action: 'save_project';
}

export interface ExportDXFAction {
  action: 'export_dxf';
  /** Which pieces to export (default: all) */
  pieceIds?: string[];
  /** Include seam allowance in export */
  includeSeamAllowance?: boolean;
}

export interface ExportPDFAction {
  action: 'export_pdf';
  pieceIds?: string[];
  /** Paper size */
  paperSize?: 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'letter' | 'tabloid';
  /** Scale factor (1.0 = full size) */
  scale?: number;
}

export interface UndoAction {
  action: 'undo';
  /** Number of steps to undo (default: 1) */
  steps?: number;
}

export interface RedoAction {
  action: 'redo';
  /** Number of steps to redo (default: 1) */
  steps?: number;
}

export type ProjectAction =
  | SaveProjectAction
  | ExportDXFAction
  | ExportPDFAction
  | UndoAction
  | RedoAction;

// ============================================================================
// Message Action (no-op, just display text)
// ============================================================================

export interface MessageAction {
  action: 'message';
  text: string;
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * All possible Copilot actions.
 *
 * Each action is self-describing via the `action` discriminator field.
 * The executor validates, checkpoints, executes, and returns results.
 */
export type CopilotAction =
  | SelectionAction
  | PieceAction
  | GeometryAction
  | SeamAction
  | TopstitchAction
  | MeasurementAction
  | SimulationAction
  | AvatarAction
  | ViewAction
  | ProjectAction
  | MessageAction;

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of executing a single action.
 */
export interface ActionResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Result data (action-specific) */
  data?: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
  /** Undo checkpoint ID (for rollback) */
  undoId?: string;
  /** Human-readable summary of what was done */
  summary?: string;
}

/**
 * Result of executing a batch of actions.
 */
export interface ActionBatchResult {
  /** Individual results for each action */
  results: ActionResult[];
  /** Total succeeded */
  succeeded: number;
  /** Total failed */
  failed: number;
  /** Combined summary */
  summary: string;
  /** If any failed, can we rollback all? */
  canRollback: boolean;
}

// ============================================================================
// Action Categories (for UI and validation)
// ============================================================================

export const ACTION_CATEGORIES = {
  selection: ['select_piece', 'select_pieces', 'select_edge', 'select_point', 'clear_selection'],
  piece: ['create_piece', 'duplicate_piece', 'delete_piece', 'rename_piece', 'mirror_piece', 'move_piece', 'rotate_piece', 'scale_piece'],
  geometry: ['move_point', 'add_point', 'delete_point', 'add_ease', 'add_dart', 'curve_edge', 'straighten_edge', 'split_edge', 'split_piece', 'merge_pieces'],
  seam: ['create_seam', 'delete_seam', 'flip_seam_direction', 'auto_detect_seams'],
  topstitch: ['create_topstitch'],
  measurement: ['measure_edge', 'measure_piece_area', 'compare_edges', 'measure_distance'],
  simulation: ['start_simulation', 'stop_simulation', 'reset_simulation', 'set_fabric', 'show_fit_map'],
  avatar: ['set_avatar_measurement', 'set_avatar_measurements', 'set_pose', 'set_avatar_type'],
  view: ['zoom_to_piece', 'zoom_to_fit', 'switch_view', 'set_view_mode', 'toggle_panel'],
  project: ['save_project', 'export_dxf', 'export_pdf', 'undo', 'redo'],
  message: ['message'],
} as const;

/**
 * Actions that are read-only (don't modify state).
 */
export const READ_ONLY_ACTIONS = new Set([
  'measure_edge',
  'measure_piece_area',
  'compare_edges',
  'measure_distance',
  'message',
]);

/**
 * Actions that require confirmation before executing.
 */
export const DANGEROUS_ACTIONS = new Set([
  'delete_piece',
  'delete_seam',
  'delete_point',
  'split_piece',
]);

/**
 * Actions that can be undone.
 */
export const UNDOABLE_ACTIONS = new Set([
  'create_piece', 'duplicate_piece', 'delete_piece', 'rename_piece',
  'mirror_piece', 'move_piece', 'rotate_piece', 'scale_piece',
  'move_point', 'add_point', 'delete_point', 'add_ease', 'add_dart',
  'curve_edge', 'straighten_edge', 'split_edge',
  'split_piece', 'merge_pieces',
  'create_seam', 'delete_seam', 'flip_seam_direction', 'auto_detect_seams',
  'create_topstitch',
  'set_avatar_measurement', 'set_avatar_measurements',
]);

/**
 * Get the category of an action.
 */
export function getActionCategory(action: CopilotAction): keyof typeof ACTION_CATEGORIES | null {
  for (const [category, actions] of Object.entries(ACTION_CATEGORIES)) {
    if ((actions as readonly string[]).includes(action.action)) {
      return category as keyof typeof ACTION_CATEGORIES;
    }
  }
  return null;
}

/**
 * Check if an action is read-only.
 */
export function isReadOnlyAction(action: CopilotAction): boolean {
  return READ_ONLY_ACTIONS.has(action.action);
}

/**
 * Check if an action requires confirmation.
 */
export function isDangerousAction(action: CopilotAction): boolean {
  return DANGEROUS_ACTIONS.has(action.action);
}

/**
 * Check if an action can be undone.
 */
export function isUndoableAction(action: CopilotAction): boolean {
  return UNDOABLE_ACTIONS.has(action.action);
}
