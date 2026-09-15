/**
 * Action Validator — validates CopilotActions before execution.
 *
 * Each action type has specific validation rules that ensure
 * the action can be executed successfully.
 *
 * @module actionValidator
 */

import type { RootState } from '../../store';
import type {
  CopilotAction,
  SelectionAction,
  PieceAction,
  GeometryAction,
  SeamAction,
  MeasurementAction,
  SimulationAction,
  AvatarAction,
  ViewAction,
  ProjectAction,
} from './actionTypes';
import { validateName } from '../../utils/sanitizeName';
import { piezaBloqueada } from '../../utils/piezaBloqueada';

// ============================================================================
// Validation Result
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Sanitized values that the caller should apply to the action before execution. */
  sanitized?: Record<string, unknown>;
}

function ok(): ValidationResult {
  return { valid: true, errors: [], warnings: [] };
}

function fail(...errors: string[]): ValidationResult {
  return { valid: false, errors, warnings: [] };
}

function warn(warnings: string[]): ValidationResult {
  return { valid: true, errors: [], warnings };
}

// ============================================================================
// Helpers
// ============================================================================

function pieceExists(state: RootState, pieceId: string): boolean {
  return state.project.pieces.some(p => p.id === pieceId);
}

function seamExists(state: RootState, seamId: string): boolean {
  return state.project.seams.some(s => s.id === seamId);
}

function getPiece(state: RootState, pieceId: string) {
  return state.project.pieces.find(p => p.id === pieceId);
}

/**
 * El candado se leía para pintar (el chip, la fila de capas) y nunca para el
 * copiloto (#1176, mismo mecanismo que #1136/#1145 encontraron en la UI).
 *
 * Vive junto a `pieceExists`, en el mismo sitio central que ya protege a las
 * diez acciones geométricas de un `pieceId` inexistente — un llamador por
 * `case`, no siete guardianes repartidos: eso es lo que #1176 señaló como el
 * límite de "un gancho por llamador" al llegar a un despachador con más de
 * una función registrada.
 *
 * Asume que `pieceExists` ya se comprobó antes (todos los llamadores lo
 * hacen): una pieza inexistente no está "bloqueada", simplemente no está.
 */
function pieceNotLocked(state: RootState, pieceId: string): ValidationResult {
  const piece = getPiece(state, pieceId);
  if (piece && piezaBloqueada(piece, state.project.layerLocked)) {
    return fail(`Piece "${pieceId}" is locked (directly or via its layer); ask the user to unlock it first`);
  }
  return ok();
}

function validateEdgeIndex(state: RootState, pieceId: string, edgeIndex: number): ValidationResult {
  const piece = getPiece(state, pieceId);
  if (!piece) {
    return fail(`Piece "${pieceId}" not found`);
  }
  // Edge count = number of outline commands (excluding Z/closepath)
  const edgeCount = piece.outline.filter(c => c.type !== 'Z').length;
  if (edgeIndex < 0 || edgeIndex >= edgeCount) {
    return fail(`Edge index ${edgeIndex} out of range (piece has ${edgeCount} edges)`);
  }
  return ok();
}

function validatePointIndex(state: RootState, pieceId: string, pointIndex: number): ValidationResult {
  const piece = getPiece(state, pieceId);
  if (!piece) {
    return fail(`Piece "${pieceId}" not found`);
  }
  // Point count = number of vertices in outline
  const pointCount = piece.outline.filter(c => c.type !== 'Z').length;
  if (pointIndex < 0 || pointIndex >= pointCount) {
    return fail(`Point index ${pointIndex} out of range (piece has ${pointCount} points)`);
  }
  return ok();
}

// ============================================================================
// Selection Validators
// ============================================================================

function validateSelectionAction(action: SelectionAction, state: RootState): ValidationResult {
  switch (action.action) {
    case 'select_piece':
      if (!pieceExists(state, action.pieceId)) {
        return fail(`Piece "${action.pieceId}" not found`);
      }
      return ok();

    case 'select_pieces':
      if (Array.isArray(action.query)) {
        const missing = action.query.filter(id => !pieceExists(state, id));
        if (missing.length > 0) {
          return fail(`Pieces not found: ${missing.join(', ')}`);
        }
      }
      // Natural language queries are validated at execution time
      return ok();

    case 'select_edge':
      return validateEdgeIndex(state, action.pieceId, action.edgeIndex);

    case 'select_point':
      return validatePointIndex(state, action.pieceId, action.pointIndex);

    case 'clear_selection':
      return ok();

    default:
      return fail(`Unknown selection action`);
  }
}

// ============================================================================
// Piece Validators
// ============================================================================

function validatePieceAction(action: PieceAction, state: RootState): ValidationResult {
  switch (action.action) {
    case 'create_piece': {
      if (action.shape === 'rectangle') {
        if (!action.params.width || !action.params.height) {
          return fail('Rectangle requires width and height');
        }
        if (action.params.width <= 0 || action.params.height <= 0) {
          return fail('Width and height must be positive');
        }
      } else if (action.shape === 'from_points') {
        if (!action.params.points || action.params.points.length < 3) {
          return fail('from_points requires at least 3 points');
        }
      } else if (action.shape === 'from_outline') {
        if (!action.params.outline || action.params.outline.length < 2) {
          return fail('from_outline requires a valid outline');
        }
      }
      // Validate optional name if provided
      if (action.params.name != null) {
        const nameResult = validateName(action.params.name);
        if (!nameResult.valid) return fail(...nameResult.errors);
        return { valid: true, errors: [], warnings: [], sanitized: { 'params.name': nameResult.sanitized } };
      }
      return ok();
    }

    case 'duplicate_piece':
      if (!pieceExists(state, action.pieceId)) {
        return fail(`Piece "${action.pieceId}" not found`);
      }
      return ok();

    case 'delete_piece': {
      if (!pieceExists(state, action.pieceId)) {
        return fail(`Piece "${action.pieceId}" not found`);
      }
      const lockResult = pieceNotLocked(state, action.pieceId);
      if (!lockResult.valid) return lockResult;
      // Warn about connected seams
      const connectedSeams = state.project.seams.filter(
        s => s.pieceA.pieceId === action.pieceId || s.pieceB.pieceId === action.pieceId
      );
      if (connectedSeams.length > 0 && action.deleteConnectedSeams !== false) {
        return warn([`Will delete ${connectedSeams.length} connected seam(s)`]);
      }
      return ok();
    }

    case 'rename_piece': {
      if (!pieceExists(state, action.pieceId)) {
        return fail(`Piece "${action.pieceId}" not found`);
      }
      const lockResult = pieceNotLocked(state, action.pieceId);
      if (!lockResult.valid) return lockResult;
      if (!action.name) {
        return fail('Name cannot be empty');
      }
      const nameResult = validateName(action.name);
      if (!nameResult.valid) return fail(...nameResult.errors);
      return { valid: true, errors: [], warnings: [], sanitized: { name: nameResult.sanitized } };
    }

    case 'mirror_piece':
      if (!pieceExists(state, action.pieceId)) {
        return fail(`Piece "${action.pieceId}" not found`);
      }
      if (action.axis !== 'x' && action.axis !== 'y') {
        return fail('Axis must be "x" or "y"');
      }
      // `createCopy` no lo lee el executor (mirror_piece siempre voltea
      // in-place vía flipPieceH/flipPieceV) — el candado aplica siempre,
      // no solo cuando createCopy es false.
      return pieceNotLocked(state, action.pieceId);

    case 'move_piece':
      if (!pieceExists(state, action.pieceId)) {
        return fail(`Piece "${action.pieceId}" not found`);
      }
      return pieceNotLocked(state, action.pieceId);

    case 'rotate_piece':
      if (!pieceExists(state, action.pieceId)) {
        return fail(`Piece "${action.pieceId}" not found`);
      }
      return pieceNotLocked(state, action.pieceId);

    case 'scale_piece':
      if (!pieceExists(state, action.pieceId)) {
        return fail(`Piece "${action.pieceId}" not found`);
      }
      if (action.factor <= 0) {
        return fail('Scale factor must be positive');
      }
      return pieceNotLocked(state, action.pieceId);

    case 'link_pieces': {
      const la = action as unknown as { pieceIdA?: string; pieceIdB?: string; mode?: string };
      if (!la.pieceIdA || !pieceExists(state, la.pieceIdA)) return fail(`Piece "${la.pieceIdA}" not found`);
      if (!la.pieceIdB || !pieceExists(state, la.pieceIdB)) return fail(`Piece "${la.pieceIdB}" not found`);
      if (la.pieceIdA === la.pieceIdB) return fail('Cannot link a piece to itself');
      if (la.mode !== 'symmetry' && la.mode !== 'instance') return fail('Mode must be "symmetry" or "instance"');
      const lockA = pieceNotLocked(state, la.pieceIdA);
      if (!lockA.valid) return lockA;
      const lockB = pieceNotLocked(state, la.pieceIdB);
      if (!lockB.valid) return lockB;
      return ok();
    }
    case 'unlink_pieces': {
      const ua = action as unknown as { pieceId?: string };
      if (!ua.pieceId || !pieceExists(state, ua.pieceId)) return fail(`Piece "${ua.pieceId}" not found`);
      return pieceNotLocked(state, ua.pieceId);
    }

    default:
      return fail(`Unknown piece action`);
  }
}

// ============================================================================
// Geometry Validators
// ============================================================================

function validateGeometryAction(action: GeometryAction, state: RootState): ValidationResult {
  switch (action.action) {
    case 'move_point': {
      const pointResult = validatePointIndex(state, action.pieceId, action.pointIndex);
      if (!pointResult.valid) return pointResult;
      return pieceNotLocked(state, action.pieceId);
    }

    case 'add_point': {
      const edgeResult = validateEdgeIndex(state, action.pieceId, action.edgeIndex);
      if (!edgeResult.valid) return edgeResult;
      if (action.position < 0 || action.position > 1) {
        return fail('Position must be between 0 and 1');
      }
      return pieceNotLocked(state, action.pieceId);
    }

    case 'delete_point': {
      const pointResult = validatePointIndex(state, action.pieceId, action.pointIndex);
      if (!pointResult.valid) return pointResult;
      const lockResult = pieceNotLocked(state, action.pieceId);
      if (!lockResult.valid) return lockResult;
      // Warn if piece would have too few points
      const piece = getPiece(state, action.pieceId);
      const pointCount = piece?.outline.filter(c => c.type !== 'Z').length || 0;
      if (pointCount <= 3) {
        return fail('Cannot delete point: piece must have at least 3 points');
      }
      return ok();
    }

    case 'add_ease': {
      if (!pieceExists(state, action.pieceId)) {
        return fail(`Piece "${action.pieceId}" not found`);
      }
      const lockResult = pieceNotLocked(state, action.pieceId);
      if (!lockResult.valid) return lockResult;
      if (action.edge !== 'all' && typeof action.edge === 'number') {
        return validateEdgeIndex(state, action.pieceId, action.edge);
      }
      if (action.amount === 0) {
        return warn(['Ease amount is 0, no change will occur']);
      }
      return ok();
    }

    case 'add_dart': {
      if (!pieceExists(state, action.pieceId)) {
        return fail(`Piece "${action.pieceId}" not found`);
      }
      const lockResult = pieceNotLocked(state, action.pieceId);
      if (!lockResult.valid) return lockResult;
      if (action.depth <= 0) {
        return fail('Dart depth must be positive');
      }
      return ok();
    }

    case 'curve_edge': {
      const curveResult = validateEdgeIndex(state, action.pieceId, action.edgeIndex);
      if (!curveResult.valid) return curveResult;
      if (action.curvature < -1 || action.curvature > 1) {
        return fail('Curvature must be between -1 and 1');
      }
      return pieceNotLocked(state, action.pieceId);
    }

    case 'straighten_edge': {
      const straightenResult = validateEdgeIndex(state, action.pieceId, action.edgeIndex);
      if (!straightenResult.valid) return straightenResult;
      return pieceNotLocked(state, action.pieceId);
    }

    case 'split_edge': {
      const splitResult = validateEdgeIndex(state, action.pieceId, action.edgeIndex);
      if (!splitResult.valid) return splitResult;
      if (action.at <= 0 || action.at >= 1) {
        return fail('Split position must be between 0 and 1 (exclusive)');
      }
      return pieceNotLocked(state, action.pieceId);
    }

    case 'split_piece': {
      if (!pieceExists(state, action.pieceId)) {
        return fail(`Piece "${action.pieceId}" not found`);
      }
      const lockResult = pieceNotLocked(state, action.pieceId);
      if (!lockResult.valid) return lockResult;
      if (!Array.isArray(action.startPoint) || action.startPoint.length !== 2) {
        return fail('startPoint must be [x, y]');
      }
      if (!Array.isArray(action.endPoint) || action.endPoint.length !== 2) {
        return fail('endPoint must be [x, y]');
      }
      return ok();
    }

    case 'merge_pieces': {
      if (!pieceExists(state, action.pieceIdA)) {
        return fail(`Piece "${action.pieceIdA}" not found`);
      }
      if (!pieceExists(state, action.pieceIdB)) {
        return fail(`Piece "${action.pieceIdB}" not found`);
      }
      // Cualquiera de las dos basta: unir borra las DOS, así que ambas son
      // sujeto de escritura (#1176 — mismo hallazgo que la revisión de #1145
      // hizo en `useMergeTool`, donde la pieza A tampoco se revisaba).
      const lockA = pieceNotLocked(state, action.pieceIdA);
      if (!lockA.valid) return lockA;
      const lockB = pieceNotLocked(state, action.pieceIdB);
      if (!lockB.valid) return lockB;
      if (action.pieceIdA === action.pieceIdB) {
        return fail('Cannot merge a piece with itself');
      }
      return ok();
    }

    default:
      return fail(`Unknown geometry action`);
  }
}

// ============================================================================
// Seam Validators
// ============================================================================

function validateSeamAction(action: SeamAction, state: RootState): ValidationResult {
  switch (action.action) {
    case 'create_seam': {
      if (!pieceExists(state, action.pieceA)) {
        return fail(`Piece A "${action.pieceA}" not found`);
      }
      if (!pieceExists(state, action.pieceB)) {
        return fail(`Piece B "${action.pieceB}" not found`);
      }
      // Validate edge names exist on the pieces
      const pA = getPiece(state, action.pieceA);
      const pB = getPiece(state, action.pieceB);
      if (pA && !pA.edges?.some(e => e.name === action.edgeAName)) {
        return fail(`Edge "${action.edgeAName}" not found on piece "${pA.name}"`);
      }
      if (pB && !pB.edges?.some(e => e.name === action.edgeBName)) {
        return fail(`Edge "${action.edgeBName}" not found on piece "${pB.name}"`);
      }
      // Check for existing seam (comparing against edgeName)
      const existingSeam = state.project.seams.find(
        s =>
          (s.pieceA.pieceId === action.pieceA && s.pieceA.edgeName === action.edgeAName) ||
          (s.pieceB.pieceId === action.pieceA && s.pieceB.edgeName === action.edgeAName) ||
          (s.pieceA.pieceId === action.pieceB && s.pieceA.edgeName === action.edgeBName) ||
          (s.pieceB.pieceId === action.pieceB && s.pieceB.edgeName === action.edgeBName)
      );
      if (existingSeam) {
        return warn(['One or both edges already have seams']);
      }
      return ok();
    }

    case 'delete_seam':
      if (!seamExists(state, action.seamId)) {
        return fail(`Seam "${action.seamId}" not found`);
      }
      return ok();

    case 'flip_seam_direction':
      if (!seamExists(state, action.seamId)) {
        return fail(`Seam "${action.seamId}" not found`);
      }
      return ok();

    case 'auto_detect_seams':
      if (action.pieceIds) {
        const missing = action.pieceIds.filter(id => !pieceExists(state, id));
        if (missing.length > 0) {
          return fail(`Pieces not found: ${missing.join(', ')}`);
        }
      }
      return ok();

    default:
      return fail(`Unknown seam action`);
  }
}

// ============================================================================
// Measurement Validators
// ============================================================================

function validateMeasurementAction(action: MeasurementAction, state: RootState): ValidationResult {
  switch (action.action) {
    case 'measure_edge':
      return validateEdgeIndex(state, action.pieceId, action.edgeIndex);

    case 'measure_piece_area':
      if (!pieceExists(state, action.pieceId)) {
        return fail(`Piece "${action.pieceId}" not found`);
      }
      return ok();

    case 'compare_edges': {
      const edge1Result = validateEdgeIndex(state, action.edge1.pieceId, action.edge1.edgeIndex);
      if (!edge1Result.valid) return edge1Result;
      const edge2Result = validateEdgeIndex(state, action.edge2.pieceId, action.edge2.edgeIndex);
      if (!edge2Result.valid) return edge2Result;
      return ok();
    }

    case 'measure_distance':
      // No state validation needed for point-to-point distance
      return ok();

    default:
      return fail(`Unknown measurement action`);
  }
}

// ============================================================================
// Simulation Validators
// ============================================================================

function validateSimulationAction(action: SimulationAction, state: RootState): ValidationResult {
  switch (action.action) {
    case 'start_simulation':
      if (state.project.pieces.length === 0) {
        return fail('Cannot start simulation without any pieces');
      }
      if (state.simulation.simulationState === 'running') {
        return warn(['Simulation is already running']);
      }
      return ok();

    case 'stop_simulation':
      if (state.simulation.simulationState === 'idle') {
        return warn(['Simulation is not running']);
      }
      return ok();

    case 'reset_simulation':
      return ok();

    case 'set_fabric':
      if (action.pieceId !== 'all') {
        if (!pieceExists(state, action.pieceId)) {
          return fail(`Piece "${action.pieceId}" not found`);
        }
      }
      // Note: fabricId validation would need a fabric registry lookup
      return ok();

    case 'show_fit_map':
      if (action.enabled && state.simulation.simulationState !== 'running') {
        return warn(['Fit map works best during simulation']);
      }
      return ok();

    default:
      return fail(`Unknown simulation action`);
  }
}

// ============================================================================
// Avatar Validators
// ============================================================================

const VALID_MEASUREMENTS = new Set([
  'height', 'chest', 'waist', 'hips', 'shoulder', 'armLength',
  'inseam', 'neck', 'bust', 'underBust', 'highHip', 'thigh',
  'knee', 'calf', 'ankle', 'wrist', 'upperArm', 'forearm',
]);

 
function validateAvatarAction(action: AvatarAction, _state: RootState): ValidationResult {
  switch (action.action) {
    case 'set_avatar_measurement':
      if (!VALID_MEASUREMENTS.has(action.measurement)) {
        return warn([`Unknown measurement "${action.measurement}"`]);
      }
      if (action.value <= 0) {
        return fail('Measurement value must be positive');
      }
      return ok();

    case 'set_avatar_measurements':
      for (const [key, value] of Object.entries(action.measurements)) {
        if (!VALID_MEASUREMENTS.has(key)) {
          // Don't fail, just warn about unknown measurements
          return warn([`Unknown measurement "${key}"`]);
        }
        if (typeof value !== 'number' || value <= 0) {
          return fail(`Measurement "${key}" must be a positive number`);
        }
      }
      return ok();

    case 'set_pose':
      // Pose validation would need a pose registry lookup
      return ok();

    case 'set_avatar_type':
      if (action.type !== 'dressform' && action.type !== 'model') {
        return fail('Avatar type must be "dressform" or "model"');
      }
      return ok();

    default:
      return fail(`Unknown avatar action`);
  }
}

// ============================================================================
// View Validators
// ============================================================================

function validateViewAction(action: ViewAction, state: RootState): ValidationResult {
  switch (action.action) {
    case 'zoom_to_piece':
      if (!pieceExists(state, action.pieceId)) {
        return fail(`Piece "${action.pieceId}" not found`);
      }
      return ok();

    case 'zoom_to_fit':
      return ok();

    case 'switch_view':
      if (!['2d', '3d', 'split'].includes(action.view)) {
        return fail('View must be "2d", "3d", or "split"');
      }
      return ok();

    case 'set_view_mode':
      if (!['edit', 'preview', 'simulation'].includes(action.mode)) {
        return fail('Mode must be "edit", "preview", or "simulation"');
      }
      return ok();

    case 'toggle_panel':
      if (!['properties', 'layers', 'simulation', 'measurements'].includes(action.panel)) {
        return fail(`Unknown panel "${action.panel}"`);
      }
      return ok();

    default:
      return fail(`Unknown view action`);
  }
}

// ============================================================================
// Project Validators
// ============================================================================

 
function validateProjectAction(action: ProjectAction, _state: RootState): ValidationResult {
  switch (action.action) {
    case 'save_project':
      return ok();

    case 'export_dxf':
    case 'export_pdf':
      // pieceIds validation handled at execution
      return ok();

    case 'undo':
      if (action.steps !== undefined && action.steps <= 0) {
        return fail('Undo steps must be positive');
      }
      return ok();

    case 'redo':
      if (action.steps !== undefined && action.steps <= 0) {
        return fail('Redo steps must be positive');
      }
      return ok();

    case 'import_dxf': {
      const importAction = action as unknown as { fileContent?: string };
      if (!importAction.fileContent || importAction.fileContent.trim().length === 0) {
        return fail('import_dxf requires non-empty fileContent');
      }
      return ok();
    }

    default:
      return fail(`Unknown project action`);
  }
}

// ============================================================================
// Main Validator
// ============================================================================

/**
 * Validate a CopilotAction before execution.
 *
 * @param action - The action to validate
 * @param state - Current Redux state
 * @returns ValidationResult with valid flag and any errors/warnings
 */
export function validateAction(action: CopilotAction, state: RootState): ValidationResult {
  // Selection actions
  if (['select_piece', 'select_pieces', 'select_edge', 'select_point', 'clear_selection'].includes(action.action)) {
    return validateSelectionAction(action as SelectionAction, state);
  }

  // Piece actions
  if (['create_piece', 'duplicate_piece', 'delete_piece', 'rename_piece', 'mirror_piece', 'move_piece', 'rotate_piece', 'scale_piece', 'link_pieces', 'unlink_pieces'].includes(action.action)) {
    return validatePieceAction(action as PieceAction, state);
  }

  // Geometry actions
  if (['move_point', 'add_point', 'delete_point', 'add_ease', 'add_dart', 'curve_edge', 'straighten_edge', 'split_edge', 'split_piece', 'merge_pieces'].includes(action.action)) {
    return validateGeometryAction(action as GeometryAction, state);
  }

  // Seam actions
  if (['create_seam', 'delete_seam', 'flip_seam_direction', 'auto_detect_seams'].includes(action.action)) {
    return validateSeamAction(action as SeamAction, state);
  }

  // Measurement actions
  if (['measure_edge', 'measure_piece_area', 'compare_edges', 'measure_distance'].includes(action.action)) {
    return validateMeasurementAction(action as MeasurementAction, state);
  }

  // Simulation actions
  if (['start_simulation', 'stop_simulation', 'reset_simulation', 'set_fabric', 'show_fit_map'].includes(action.action)) {
    return validateSimulationAction(action as SimulationAction, state);
  }

  // Avatar actions
  if (['set_avatar_measurement', 'set_avatar_measurements', 'set_pose', 'set_avatar_type'].includes(action.action)) {
    return validateAvatarAction(action as AvatarAction, state);
  }

  // View actions
  if (['zoom_to_piece', 'zoom_to_fit', 'switch_view', 'set_view_mode', 'toggle_panel'].includes(action.action)) {
    return validateViewAction(action as ViewAction, state);
  }

  // Project actions
  if (['save_project', 'export_dxf', 'export_pdf', 'undo', 'redo', 'import_dxf'].includes(action.action)) {
    return validateProjectAction(action as ProjectAction, state);
  }

  // Message action - always valid
  if (action.action === 'message') {
    return ok();
  }

  return fail(`Unknown action type: ${(action as { action: string }).action}`);
}
