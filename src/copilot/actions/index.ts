/**
 * Copilot Action System — Phase 2 of Issue #130
 *
 * This module provides domain-specific actions that the Copilot can execute.
 * Actions are validated, create undo checkpoints, and return structured results.
 *
 * @example
 * ```ts
 * import { createActionExecutor, CopilotAction } from './copilot/actions';
 *
 * const executor = createActionExecutor(dispatch, getState);
 *
 * const action: CopilotAction = {
 *   action: 'create_piece',
 *   shape: 'rectangle',
 *   params: { width: 200, height: 300, name: 'Front Bodice' }
 * };
 *
 * const result = await executor.execute(action);
 * if (result.success) {
 *   console.log(result.summary); // "Created piece 'Front Bodice'"
 * }
 * ```
 *
 * @module copilot/actions
 */

// Types
export type {
  // Main union type
  CopilotAction,

  // Action categories
  SelectionAction,
  PieceAction,
  GeometryAction,
  SeamAction,
  MeasurementAction,
  SimulationAction,
  AvatarAction,
  ViewAction,
  ProjectAction,
  MessageAction,

  // Individual action types
  SelectPieceAction,
  SelectPiecesAction,
  SelectEdgeAction,
  SelectPointAction,
  ClearSelectionAction,

  CreatePieceAction,
  DuplicatePieceAction,
  DeletePieceAction,
  RenamePieceAction,
  MirrorPieceAction,
  MovePieceAction,
  RotatePieceAction,
  ScalePieceAction,

  MovePointAction,
  AddPointAction,
  DeletePointAction,
  AddEaseAction,
  AddDartAction,
  CurveEdgeAction,
  SplitEdgeAction,

  CreateSeamAction,
  DeleteSeamAction,
  FlipSeamDirectionAction,
  AutoDetectSeamsAction,

  MeasureEdgeAction,
  MeasurePieceAreaAction,
  CompareEdgesAction,
  MeasureDistanceAction,

  StartSimulationAction,
  StopSimulationAction,
  ResetSimulationAction,
  SetFabricAction,
  ShowFitMapAction,

  SetAvatarMeasurementAction,
  SetAvatarMeasurementsAction,
  SetPoseAction,
  SetAvatarTypeAction,

  ZoomToPieceAction,
  ZoomToFitAction,
  SwitchViewAction,
  SetViewModeAction,
  TogglePanelAction,

  SaveProjectAction,
  ExportDXFAction,
  ExportPDFAction,
  UndoAction,
  RedoAction,

  // Result types
  ActionResult,
  ActionBatchResult,
} from './actionTypes';

// Category helpers
export {
  ACTION_CATEGORIES,
  READ_ONLY_ACTIONS,
  DANGEROUS_ACTIONS,
  UNDOABLE_ACTIONS,
  getActionCategory,
  isReadOnlyAction,
  isDangerousAction,
  isUndoableAction,
} from './actionTypes';

// Validator
export { validateAction } from './actionValidator';
export type { ValidationResult } from './actionValidator';

// Piece query resolver
export {
  resolvePieceQuery,
  resolvePieceQueryOrId,
} from './pieceQueryResolver';
export type { QueryResult } from './pieceQueryResolver';

// Executor
export {
  CopilotActionExecutor,
  createActionExecutor,
} from './actionExecutor';
