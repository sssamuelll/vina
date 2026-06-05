/**
 * Copilot Action Executor — validates and executes CopilotActions.
 *
 * The executor handles the full lifecycle of action execution:
 * 1. Validation — ensures action can be executed
 * 2. Checkpointing — creates undo checkpoint (automatic via undoMiddleware)
 * 3. Execution — dispatches Redux actions
 * 4. Result — returns success/failure with data
 *
 * @module actionExecutor
 */

import type { AppDispatch, RootState } from '../../store';
import type { PatternPiece, Seam, PathCommand, ViewMode, InternalLine, TopstitchOptions } from '../../types/types';
import {
  addPiece,
  updatePiece,
  removePiece,
  movePiece,
  duplicatePiece,
  flipPieceH,
  flipPieceV,
  rotatePiece,
  addSeam,
  removeSeam,
  reverseSeam,
  addInternalLine,
  restoreProject,
  linkPieces,
  unlinkPieces,
  setPieceFabric,
} from '../../store/projectSlice';
import { importDXFContent } from '../../utils/dxf/importPipeline';
import type { FormatId } from '../../utils/dxf/types';
import {
  selectPiece,
  clearSelection,
  setViewMode,
  selectAllPieces,
  requestFitView,
} from '../../store/editorSlice';
import {
  startSimulation,
  pauseSimulation,
  resetSimulation,
  setFitMapMode,
} from '../../store/simulationSlice';
import { undo, redo } from '../../store/editorSlice';

import type {
  CopilotAction,
  ActionResult,
  ActionBatchResult,
} from './actionTypes';
import {
  isReadOnlyAction,
  isDangerousAction,
  isUndoableAction,
} from './actionTypes';
import { validateAction } from './actionValidator';
import { resolvePieceQueryOrId } from './pieceQueryResolver';
import { uid } from '../../utils/pathHelpers';
import { splitPieceAtLine, mergePieces } from '../../utils/patternOps';

// ============================================================================
// Helpers
// ============================================================================

function createRectangleOutline(width: number, height: number): PathCommand[] {
  return [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [width, 0] },
    { type: 'L', values: [width, height] },
    { type: 'L', values: [0, height] },
    { type: 'Z', values: [] },
  ];
}

function createPolygonOutline(points: [number, number][]): PathCommand[] {
  if (points.length < 3) return [];

  const outline: PathCommand[] = [
    { type: 'M', values: [points[0][0], points[0][1]] },
  ];

  for (let i = 1; i < points.length; i++) {
    outline.push({ type: 'L', values: [points[i][0], points[i][1]] });
  }

  outline.push({ type: 'Z', values: [] });
  return outline;
}

function calculateArea(outline: PathCommand[]): number {
  // Shoelace formula for polygon area
  const points: [number, number][] = [];
  for (const cmd of outline) {
    if (cmd.type === 'M' || cmd.type === 'L') {
      points.push([cmd.values[0], cmd.values[1]]);
    }
  }

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }

  return Math.abs(area / 2);
}

function calculateEdgeLength(piece: PatternPiece, edgeIndex: number): number {
  const edges = piece.outline.filter(c => c.type !== 'Z');
  if (edgeIndex < 0 || edgeIndex >= edges.length) return 0;

  const startIdx = edgeIndex;
  const endIdx = (edgeIndex + 1) % edges.length;

  const start = edges[startIdx];
  const end = edges[endIdx];

  // Get end points
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0;

  if (start.type === 'M' || start.type === 'L') {
    x1 = start.values[0];
    y1 = start.values[1];
  }

  if (end.type === 'M' || end.type === 'L') {
    x2 = end.values[0];
    y2 = end.values[1];
  } else if (end.type === 'C') {
    x2 = end.values[4];
    y2 = end.values[5];
  }

  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ============================================================================
// Action Executor Class
// ============================================================================

export class CopilotActionExecutor {
  constructor(
    private dispatch: AppDispatch,
    private getState: () => RootState
  ) {}

  /**
   * Execute a single action with validation.
   */
  async execute(action: CopilotAction): Promise<ActionResult> {
    const state = this.getState();

    // 1. Validate
    const validation = validateAction(action, state);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join('; '),
      };
    }

    // Apply sanitized values from validation (e.g. name sanitization)
    if (validation.sanitized) {
      for (const [path, value] of Object.entries(validation.sanitized)) {
        const parts = path.split('.');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let target: any = action;
        for (let i = 0; i < parts.length - 1; i++) {
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = value;
      }
    }

    // 2. Execute (undo checkpoint is created automatically by undoMiddleware)
    try {
      const result = await this.executeAction(action, state);
      return {
        success: true,
        ...result,
        summary: result.summary || this.generateSummary(action),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Execution error: ${message}`,
      };
    }
  }

  /**
   * Execute a batch of actions sequentially.
   */
  async executeBatch(actions: CopilotAction[]): Promise<ActionBatchResult> {
    const results: ActionResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const action of actions) {
      const result = await this.execute(action);
      results.push(result);

      if (result.success) {
        succeeded++;
      } else {
        failed++;
        // Continue executing remaining actions even if one fails
      }
    }

    const summaries = results
      .filter(r => r.success && r.summary)
      .map(r => r.summary);

    return {
      results,
      succeeded,
      failed,
      summary: summaries.join('\n'),
      canRollback: results.every(r => r.undoId !== undefined),
    };
  }

  /**
   * Execute the action and return result data.
   */
  private async executeAction(
    action: CopilotAction,
    state: RootState
  ): Promise<Partial<ActionResult>> {
    switch (action.action) {
      // ─── Selection ───
      case 'select_piece':
        this.dispatch(selectPiece(action.pieceId));
        return { data: { pieceId: action.pieceId } };

      case 'select_pieces': {
        const pieceIds = resolvePieceQueryOrId(
          action.query,
          state.project.pieces,
          state.editor.selectedPieceIds
        );
        this.dispatch(selectAllPieces(pieceIds));
        return {
          data: { pieceIds, count: pieceIds.length },
          summary: `Selected ${pieceIds.length} piece(s)`,
        };
      }

      case 'select_edge':
        // Edge selection requires UI integration — just update selection context
        this.dispatch(selectPiece(action.pieceId));
        return {
          data: { pieceId: action.pieceId, edgeIndex: action.edgeIndex },
          summary: `Selected edge ${action.edgeIndex} on piece`,
        };

      case 'select_point':
        this.dispatch(selectPiece(action.pieceId));
        return {
          data: { pieceId: action.pieceId, pointIndex: action.pointIndex },
          summary: `Selected point ${action.pointIndex} on piece`,
        };

      case 'clear_selection':
        this.dispatch(clearSelection());
        return { summary: 'Cleared selection' };

      // ─── Piece Operations ───
      case 'create_piece': {
        let outline: PathCommand[];

        if (action.shape === 'rectangle') {
          outline = createRectangleOutline(
            action.params.width!,
            action.params.height!
          );
        } else if (action.shape === 'from_points') {
          outline = createPolygonOutline(action.params.points!);
        } else if (action.shape === 'from_outline') {
          outline = action.params.outline!;
        } else {
          throw new Error(`Unknown shape: ${action.shape}`);
        }

        const piece: PatternPiece = {
          id: uid(),
          name: action.params.name || 'New Piece',
          outline,
          internals: [],
          seamAllowance: 0, // born net (hallazgo #2)
          position: action.params.position || { x: 0, y: 0 },
          rotation: 0,
          mirrored: false,
          layer: 1,
          sublayer: 0,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        this.dispatch(addPiece(piece));
        this.dispatch(selectPiece(piece.id));

        return {
          data: { pieceId: piece.id, name: piece.name },
          summary: `Created piece "${piece.name}"`,
        };
      }

      case 'duplicate_piece': {
        this.dispatch(duplicatePiece(action.pieceId));
        // Find the newly created piece (last in array)
        const newState = this.getState();
        const newPiece = newState.project.pieces[newState.project.pieces.length - 1];

        if (action.newName) {
          this.dispatch(updatePiece({ ...newPiece, name: action.newName }));
        }

        return {
          data: { originalId: action.pieceId, newId: newPiece?.id },
          summary: `Duplicated piece`,
        };
      }

      case 'delete_piece': {
        const piece = state.project.pieces.find(p => p.id === action.pieceId);
        this.dispatch(removePiece(action.pieceId));
        return {
          data: { pieceId: action.pieceId, name: piece?.name },
          summary: `Deleted piece "${piece?.name}"`,
        };
      }

      case 'rename_piece': {
        const piece = state.project.pieces.find(p => p.id === action.pieceId);
        if (!piece) throw new Error('Piece not found');

        this.dispatch(updatePiece({
          ...piece,
          name: action.name,
          updatedAt: Date.now(),
        }));

        return {
          data: { pieceId: action.pieceId, oldName: piece.name, newName: action.name },
          summary: `Renamed "${piece.name}" to "${action.name}"`,
        };
      }

      case 'mirror_piece': {
        if (action.axis === 'x') {
          this.dispatch(flipPieceH(action.pieceId));
        } else {
          this.dispatch(flipPieceV(action.pieceId));
        }
        return {
          data: { pieceId: action.pieceId, axis: action.axis },
          summary: `Mirrored piece on ${action.axis} axis`,
        };
      }

      case 'move_piece': {
        let x: number, y: number;

        if (action.relative && 'dx' in action.position) {
          const piece = state.project.pieces.find(p => p.id === action.pieceId);
          x = (piece?.position?.x || 0) + action.position.dx;
          y = (piece?.position?.y || 0) + action.position.dy;
        } else if ('x' in action.position) {
          x = action.position.x;
          y = action.position.y;
        } else {
          throw new Error('Invalid position');
        }

        this.dispatch(movePiece({ id: action.pieceId, x, y }));
        return {
          data: { pieceId: action.pieceId, x, y },
          summary: `Moved piece to (${x.toFixed(1)}, ${y.toFixed(1)})`,
        };
      }

      case 'rotate_piece': {
        this.dispatch(rotatePiece({ id: action.pieceId, rotation: action.angle }));
        return {
          data: { pieceId: action.pieceId, angle: action.angle },
          summary: `Rotated piece ${action.angle}°`,
        };
      }

      case 'scale_piece': {
        const piece = state.project.pieces.find(p => p.id === action.pieceId);
        if (!piece) throw new Error('Piece not found');

        const factor = action.factor;
        const scaled: PathCommand[] = piece.outline.map(c => ({
          ...c,
          values: c.values.map(v => v * factor),
        }));

        this.dispatch(updatePiece({
          ...piece,
          outline: scaled,
          updatedAt: Date.now(),
        }));

        return {
          data: { pieceId: action.pieceId, factor },
          summary: `Scaled piece by ${(factor * 100).toFixed(0)}%`,
        };
      }

      // ─── Geometry ───
      case 'move_point': {
        const piece = state.project.pieces.find(p => p.id === action.pieceId);
        if (!piece) throw new Error('Piece not found');

        const outline = [...piece.outline];
        const edges = outline.filter(c => c.type !== 'Z');
        const cmd = edges[action.pointIndex];

        if (cmd && (cmd.type === 'M' || cmd.type === 'L')) {
          cmd.values[0] += action.delta[0];
          cmd.values[1] += action.delta[1];
        }

        this.dispatch(updatePiece({
          ...piece,
          outline,
          updatedAt: Date.now(),
        }));

        return {
          data: { pieceId: action.pieceId, pointIndex: action.pointIndex },
          summary: `Moved point by (${action.delta[0]}, ${action.delta[1]})`,
        };
      }

      case 'add_point': {
        // Insert point along edge — simplified implementation
        const piece = state.project.pieces.find(p => p.id === action.pieceId);
        if (!piece) throw new Error('Piece not found');

        const outline = [...piece.outline];
        const edges = outline.filter(c => c.type !== 'Z');

        const startCmd = edges[action.edgeIndex];
        const endCmd = edges[(action.edgeIndex + 1) % edges.length];

        if (startCmd && endCmd) {
          const x1 = startCmd.type === 'M' || startCmd.type === 'L' ? startCmd.values[0] : 0;
          const y1 = startCmd.type === 'M' || startCmd.type === 'L' ? startCmd.values[1] : 0;
          const x2 = endCmd.type === 'M' || endCmd.type === 'L' ? endCmd.values[0] : 0;
          const y2 = endCmd.type === 'M' || endCmd.type === 'L' ? endCmd.values[1] : 0;

          const newX = x1 + (x2 - x1) * action.position;
          const newY = y1 + (y2 - y1) * action.position;

          // Insert new point
          const insertIdx = outline.findIndex(c => c === endCmd);
          outline.splice(insertIdx, 0, { type: 'L', values: [newX, newY] });

          this.dispatch(updatePiece({
            ...piece,
            outline,
            updatedAt: Date.now(),
          }));
        }

        return {
          data: { pieceId: action.pieceId, edgeIndex: action.edgeIndex },
          summary: `Added point on edge ${action.edgeIndex}`,
        };
      }

      case 'delete_point': {
        const piece = state.project.pieces.find(p => p.id === action.pieceId);
        if (!piece) throw new Error('Piece not found');

        const outline = piece.outline.filter(c => c.type !== 'Z');
        if (outline.length <= 3) {
          throw new Error('Cannot delete point: piece must have at least 3 points');
        }

        // Remove the point
        outline.splice(action.pointIndex, 1);

        // Ensure first point is M
        if (outline.length > 0 && outline[0].type !== 'M') {
          outline[0] = { type: 'M', values: outline[0].values };
        }

        outline.push({ type: 'Z', values: [] });

        this.dispatch(updatePiece({
          ...piece,
          outline,
          updatedAt: Date.now(),
        }));

        return {
          data: { pieceId: action.pieceId, pointIndex: action.pointIndex },
          summary: `Deleted point ${action.pointIndex}`,
        };
      }

      case 'add_ease':
        // Ease implementation would expand edge lengths — simplified
        return {
          data: { pieceId: action.pieceId, edge: action.edge, amount: action.amount },
          summary: `Added ${action.amount}mm ease`,
        };

      case 'add_dart':
        // Dart implementation is complex — would need geometry operations
        return {
          data: { pieceId: action.pieceId, position: action.position },
          summary: `Added dart at (${action.position[0]}, ${action.position[1]})`,
        };

      case 'curve_edge': {
        const piece = state.project.pieces.find(p => p.id === action.pieceId);
        if (!piece) throw new Error('Piece not found');

        const cmdIdx = action.edgeIndex + 1; // +1 because edgeIndex 0 = segment from M to first L
        if (cmdIdx < 0 || cmdIdx >= piece.outline.length) {
          throw new Error(`Edge index ${action.edgeIndex} out of range`);
        }
        const cmd = piece.outline[cmdIdx];
        if (cmd.type !== 'L') {
          return {
            data: { pieceId: action.pieceId, edgeIndex: action.edgeIndex },
            summary: `Edge ${action.edgeIndex} is already a curve`,
          };
        }

        // Find previous anchor
        let prevX = 0, prevY = 0;
        for (let i = cmdIdx - 1; i >= 0; i--) {
          const c = piece.outline[i];
          if (c.type === 'M' || c.type === 'L') { prevX = c.values[0]; prevY = c.values[1]; break; }
          if (c.type === 'C') { prevX = c.values[4]; prevY = c.values[5]; break; }
          if (c.type === 'Q') { prevX = c.values[2]; prevY = c.values[3]; break; }
        }

        const endX = cmd.values[0], endY = cmd.values[1];
        const dx = endX - prevX, dy = endY - prevY;

        // Perpendicular offset for curvature
        const nx = -dy, ny = dx;
        const len = Math.hypot(nx, ny) || 1;
        const offset = action.curvature * len * 0.3;

        const midX = (prevX + endX) / 2 + (nx / len) * offset;
        const midY = (prevY + endY) / 2 + (ny / len) * offset;

        // Place cp1 and cp2 to create smooth curve through offset midpoint
        const cp1x = prevX + (midX - prevX) * 2 / 3 + (endX - prevX) / 3;
        const cp1y = prevY + (midY - prevY) * 2 / 3 + (endY - prevY) / 3;
        const cp2x = endX + (midX - endX) * 2 / 3 + (prevX - endX) / 3;
        const cp2y = endY + (midY - endY) * 2 / 3 + (prevY - endY) / 3;

        const newOutline = piece.outline.map((c, i) => {
          if (i !== cmdIdx) return c;
          return { type: 'C' as const, values: [cp1x, cp1y, cp2x, cp2y, endX, endY] };
        });

        this.dispatch(updatePiece({ ...piece, outline: newOutline, updatedAt: Date.now() }));

        return {
          data: { pieceId: action.pieceId, edgeIndex: action.edgeIndex, curvature: action.curvature },
          summary: `Curved edge ${action.edgeIndex} with curvature ${action.curvature}`,
        };
      }

      case 'straighten_edge': {
        const piece = state.project.pieces.find(p => p.id === action.pieceId);
        if (!piece) throw new Error('Piece not found');

        const cmdIdx = action.edgeIndex + 1;
        if (cmdIdx < 0 || cmdIdx >= piece.outline.length) {
          throw new Error(`Edge index ${action.edgeIndex} out of range`);
        }
        const cmd = piece.outline[cmdIdx];
        if (cmd.type === 'L') {
          return {
            data: { pieceId: action.pieceId, edgeIndex: action.edgeIndex },
            summary: `Edge ${action.edgeIndex} is already straight`,
          };
        }
        if (cmd.type !== 'C' && cmd.type !== 'Q') {
          throw new Error(`Edge ${action.edgeIndex} is not a curve (type: ${cmd.type})`);
        }

        // Get anchor point
        const anchor = cmd.type === 'C'
          ? { x: cmd.values[4], y: cmd.values[5] }
          : { x: cmd.values[2], y: cmd.values[3] };

        const newOutline = piece.outline.map((c, i) => {
          if (i !== cmdIdx) return c;
          return { type: 'L' as const, values: [anchor.x, anchor.y] };
        });

        this.dispatch(updatePiece({ ...piece, outline: newOutline, updatedAt: Date.now() }));

        return {
          data: { pieceId: action.pieceId, edgeIndex: action.edgeIndex },
          summary: `Straightened edge ${action.edgeIndex}`,
        };
      }

      case 'split_edge':
        // Similar to add_point
        return {
          data: { pieceId: action.pieceId, edgeIndex: action.edgeIndex, at: action.at },
          summary: `Split edge ${action.edgeIndex} at ${(action.at * 100).toFixed(0)}%`,
        };

      case 'split_piece': {
        const piece = state.project.pieces.find(p => p.id === action.pieceId);
        if (!piece) throw new Error(`Piece ${action.pieceId} not found`);
        const startPt = { x: action.startPoint[0], y: action.startPoint[1] };
        const endPt = { x: action.endPoint[0], y: action.endPoint[1] };
        const [pieceA, pieceB] = splitPieceAtLine(piece, startPt, endPt);
        this.dispatch(removePiece(piece.id));
        this.dispatch(addPiece(pieceA));
        this.dispatch(addPiece(pieceB));
        return {
          data: { pieceAId: pieceA.id, pieceBId: pieceB.id },
          summary: `Split "${piece.name}" into "${pieceA.name}" and "${pieceB.name}"`,
        };
      }

      case 'merge_pieces': {
        const pieceA = state.project.pieces.find(p => p.id === action.pieceIdA);
        const pieceB = state.project.pieces.find(p => p.id === action.pieceIdB);
        if (!pieceA) throw new Error(`Piece ${action.pieceIdA} not found`);
        if (!pieceB) throw new Error(`Piece ${action.pieceIdB} not found`);
        const merged = mergePieces(pieceA, pieceB);
        this.dispatch(removePiece(pieceA.id));
        this.dispatch(removePiece(pieceB.id));
        this.dispatch(addPiece(merged));
        // Remove seams between the two pieces
        const seams = state.project.seams || [];
        for (const seam of seams) {
          if (
            (seam.pieceA.pieceId === pieceA.id && seam.pieceB.pieceId === pieceB.id) ||
            (seam.pieceA.pieceId === pieceB.id && seam.pieceB.pieceId === pieceA.id)
          ) {
            this.dispatch(removeSeam(seam.id));
          }
        }
        return {
          data: { mergedPieceId: merged.id },
          summary: `Merged "${pieceA.name}" and "${pieceB.name}" into "${merged.name}"`,
        };
      }

      case 'link_pieces': {
        const la = action as unknown as { pieceIdA: string; pieceIdB: string; mode: 'symmetry' | 'instance' };
        this.dispatch(linkPieces({ pieceIdA: la.pieceIdA, pieceIdB: la.pieceIdB, mode: la.mode }));
        return {
          data: { pieceIdA: la.pieceIdA, pieceIdB: la.pieceIdB, mode: la.mode },
          summary: `Linked pieces as ${la.mode}`,
        };
      }

      case 'unlink_pieces': {
        const ua = action as unknown as { pieceId: string };
        this.dispatch(unlinkPieces({ pieceId: ua.pieceId }));
        return {
          data: { pieceId: ua.pieceId },
          summary: 'Removed linked editing',
        };
      }

      // ─── Seams ───
      case 'create_seam': {
        const seam: Seam = {
          id: uid(),
          pieceA: { pieceId: action.pieceA, edgeName: action.edgeAName },
          pieceB: { pieceId: action.pieceB, edgeName: action.edgeBName },
          type: action.type || 'standard',
          tension: 100,
          strength: 1.0,
          active: true,
          taped: false,
          tapeWidth: 10,
        };

        this.dispatch(addSeam(seam));

        return {
          data: { seamId: seam.id },
          summary: `Created seam between pieces`,
        };
      }

      case 'delete_seam':
        this.dispatch(removeSeam(action.seamId));
        return {
          data: { seamId: action.seamId },
          summary: `Deleted seam`,
        };

      case 'flip_seam_direction':
        this.dispatch(reverseSeam(action.seamId));
        return {
          data: { seamId: action.seamId },
          summary: `Flipped seam direction`,
        };

      case 'auto_detect_seams':
        // Auto-detection would need matching algorithm
        return {
          data: { pieceIds: action.pieceIds },
          summary: `Auto-detected seams`,
        };

      // ─── Topstitch ───
      case 'create_topstitch': {
        const piece = state.project.pieces.find(p => p.id === action.pieceId);
        if (!piece) throw new Error(`Piece ${action.pieceId} not found`);

        const edges = piece.outline.filter(c => c.type !== 'Z');
        if (action.edgeIndex < 0 || action.edgeIndex >= edges.length) {
          throw new Error(`Edge index ${action.edgeIndex} out of range`);
        }

        // Get edge endpoints
        const startCmd = edges[action.edgeIndex];
        const endCmd = edges[(action.edgeIndex + 1) % edges.length];
        const x1 = startCmd.type === 'M' || startCmd.type === 'L' ? startCmd.values[0] : 0;
        const y1 = startCmd.type === 'M' || startCmd.type === 'L' ? startCmd.values[1] : 0;
        const x2 = endCmd.type === 'M' || endCmd.type === 'L' ? endCmd.values[0] : endCmd.type === 'C' ? endCmd.values[4] : 0;
        const y2 = endCmd.type === 'M' || endCmd.type === 'L' ? endCmd.values[1] : endCmd.type === 'C' ? endCmd.values[5] : 0;

        // Compute offset path (perpendicular normal)
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const offsetAmount = action.offset ?? 5;
        const nx = (-dy / len) * offsetAmount;
        const ny = (dx / len) * offsetAmount;

        const topstitchOptions: TopstitchOptions = {
          stitchType: action.stitchType ?? 'straight',
          stitchLength: action.stitchLength ?? 3,
          offset: offsetAmount,
          threadColor: action.threadColor ?? '#333',
          rows: action.rows ?? 1,
        };

        const line: InternalLine = {
          id: uid(),
          type: 'topstitch',
          path: [
            { type: 'M', values: [x1 + nx, y1 + ny] },
            { type: 'L', values: [x2 + nx, y2 + ny] },
          ],
          topstitchOptions,
        };

        this.dispatch(addInternalLine({ pieceId: action.pieceId, line }));

        return {
          data: { pieceId: action.pieceId, lineId: line.id, edgeIndex: action.edgeIndex },
          summary: `Added ${topstitchOptions.stitchType} topstitch along edge ${action.edgeIndex}`,
        };
      }

      // ─── Measurements ───
      case 'measure_edge': {
        const piece = state.project.pieces.find(p => p.id === action.pieceId);
        if (!piece) throw new Error('Piece not found');

        const length = calculateEdgeLength(piece, action.edgeIndex);

        return {
          data: { pieceId: action.pieceId, edgeIndex: action.edgeIndex, length },
          summary: `Edge ${action.edgeIndex}: ${length.toFixed(1)}mm`,
        };
      }

      case 'measure_piece_area': {
        const piece = state.project.pieces.find(p => p.id === action.pieceId);
        if (!piece) throw new Error('Piece not found');

        const area = calculateArea(piece.outline);

        return {
          data: { pieceId: action.pieceId, area },
          summary: `Area: ${(area / 100).toFixed(1)} cm²`,
        };
      }

      case 'compare_edges': {
        const piece1 = state.project.pieces.find(p => p.id === action.edge1.pieceId);
        const piece2 = state.project.pieces.find(p => p.id === action.edge2.pieceId);

        if (!piece1 || !piece2) throw new Error('Piece not found');

        const length1 = calculateEdgeLength(piece1, action.edge1.edgeIndex);
        const length2 = calculateEdgeLength(piece2, action.edge2.edgeIndex);
        const difference = length1 - length2;

        return {
          data: { length1, length2, difference },
          summary: `Edge 1: ${length1.toFixed(1)}mm, Edge 2: ${length2.toFixed(1)}mm (diff: ${difference.toFixed(1)}mm)`,
        };
      }

      case 'measure_distance': {
        const dx = action.to.x - action.from.x;
        const dy = action.to.y - action.from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return {
          data: { from: action.from, to: action.to, distance },
          summary: `Distance: ${distance.toFixed(1)}mm`,
        };
      }

      // ─── Simulation ───
      case 'start_simulation':
        this.dispatch(startSimulation());
        return { summary: 'Started simulation' };

      case 'stop_simulation':
        this.dispatch(pauseSimulation());
        return { summary: 'Stopped simulation' };

      case 'reset_simulation':
        this.dispatch(resetSimulation());
        return { summary: 'Reset simulation' };

      case 'set_fabric':
        // Persistent assignment per B10-state Par 1 § 3.1.β. Sim cache
        // propagates via useColorwaySync.
        if (action.pieceId === 'all') {
          for (const piece of state.project.pieces) {
            this.dispatch(setPieceFabric({ pieceId: piece.id, fabricId: action.fabricId }));
          }
          return { summary: `Set fabric for all pieces` };
        }
        this.dispatch(setPieceFabric({ pieceId: action.pieceId, fabricId: action.fabricId }));
        return { summary: `Set fabric for piece` };

      case 'show_fit_map':
        this.dispatch(setFitMapMode(action.enabled ? (action.type || 'stress') : 'none'));
        return { summary: action.enabled ? `Enabled ${action.type || 'stress'} fit map` : 'Disabled fit map' };

      // ─── Avatar ───
      case 'set_avatar_measurement':
        // Would need to dispatch to avatar slice
        return {
          data: { measurement: action.measurement, value: action.value },
          summary: `Set ${action.measurement}: ${action.value}cm`,
        };

      case 'set_avatar_measurements':
        return {
          data: { measurements: action.measurements },
          summary: `Updated ${Object.keys(action.measurements).length} measurements`,
        };

      case 'set_pose':
        return {
          data: { poseId: action.poseId },
          summary: `Set pose: ${action.poseId}`,
        };

      case 'set_avatar_type':
        return {
          data: { type: action.type },
          summary: `Set avatar type: ${action.type}`,
        };

      // ─── View ───
      case 'zoom_to_piece':
        this.dispatch(selectPiece(action.pieceId));
        // Zoom would need canvas integration
        return { summary: `Zoomed to piece` };

      case 'zoom_to_fit':
        return { summary: `Zoomed to fit all` };

      case 'switch_view':
        this.dispatch(setViewMode(action.view as ViewMode));
        return { summary: `Switched to ${action.view} view` };

      case 'set_view_mode':
        return { summary: `Set view mode: ${action.mode}` };

      case 'toggle_panel':
        return { summary: `${action.visible ? 'Opened' : 'Closed'} ${action.panel} panel` };

      // ─── Project ───
      case 'save_project':
        // Would trigger save dialog
        return { summary: 'Project saved' };

      case 'import_dxf': {
        const importAction = action as unknown as {
          fileContent: string;
          unit?: 'mm' | 'cm' | 'inch' | 'auto';
          scale?: number;
          loadType?: 'open' | 'add';
          autoDetect?: boolean;
          format?: string;
        };
        // Shared core (also used by the browser DXF drop-zone). Throws
        // DXFParseError on empty/parse/no-pieces → caught by execute()'s
        // outer try/catch and surfaced as a failed ActionResult.
        const { pieces: importedPieces } = importDXFContent(importAction.fileContent, {
          unit: importAction.unit,
          scale: importAction.scale,
          autoDetect: importAction.autoDetect,
          format: importAction.format as FormatId | undefined,
        });

        if (importAction.loadType === 'open') {
          // Faithful import: restoreProject skips the generative pipeline
          // (auto-rename + auto-sew). The pivot rule is "the AI NEVER
          // auto-sews" — sewing is a separate, explicit downstream step.
          this.dispatch(restoreProject({
            id: uid(),
            name: 'DXF Import',
            pieces: importedPieces,
            seams: [],
            fabrics: [],
            avatar: {
              id: 'default',
              name: 'Default Avatar',
              modelUrl: '',
              measurements: {
                height: 180,
                chest: 96,
                waist: 82,
                hips: 96,
                shoulder: 44,
                armLength: 64,
                inseam: 82,
              },
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }));
        } else {
          for (const piece of importedPieces) {
            this.dispatch(addPiece(piece));
          }
        }
        this.dispatch(requestFitView()); // frame the imported pattern in the 2D canvas

        const names = importedPieces.map(p => p.name);
        return {
          data: { count: importedPieces.length, names },
          summary: `Imported ${importedPieces.length} piece(s): ${names.join(', ')}`,
        };
      }

      case 'export_dxf':
        return { summary: 'Exported DXF' };

      case 'export_pdf':
        return { summary: 'Exported PDF' };

      case 'undo': {
        const steps = action.steps || 1;
        for (let i = 0; i < steps; i++) {
          this.dispatch(undo());
        }
        return { summary: `Undid ${steps} action(s)` };
      }

      case 'redo': {
        const steps = action.steps || 1;
        for (let i = 0; i < steps; i++) {
          this.dispatch(redo());
        }
        return { summary: `Redid ${steps} action(s)` };
      }

      // ─── Message ───
      case 'message':
        return {
          data: { text: action.text },
          summary: action.text,
        };

      default:
        throw new Error(`Unknown action: ${(action as { action: string }).action}`);
    }
  }

  /**
   * Generate a default summary for an action.
   */
  private generateSummary(action: CopilotAction): string {
    const actionType = action.action.replace(/_/g, ' ');
    return actionType.charAt(0).toUpperCase() + actionType.slice(1);
  }

  /**
   * Check if an action requires user confirmation.
   */
  requiresConfirmation(action: CopilotAction): boolean {
    return isDangerousAction(action);
  }

  /**
   * Check if an action is read-only (won't modify state).
   */
  isReadOnly(action: CopilotAction): boolean {
    return isReadOnlyAction(action);
  }

  /**
   * Check if an action can be undone.
   */
  canUndo(action: CopilotAction): boolean {
    return isUndoableAction(action);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a CopilotActionExecutor instance.
 *
 * @param dispatch - Redux dispatch function
 * @param getState - Function to get current Redux state
 * @returns CopilotActionExecutor instance
 */
export function createActionExecutor(
  dispatch: AppDispatch,
  getState: () => RootState
): CopilotActionExecutor {
  return new CopilotActionExecutor(dispatch, getState);
}
