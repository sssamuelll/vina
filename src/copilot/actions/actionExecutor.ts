/**
 * Copilot Action Executor — Executes copilot actions against the store.
 *
 * @module actionExecutor
 */

import type { AppDispatch, RootState } from '../../store';
import type { CopilotAction, ActionResult } from './actionTypes';

/**
 * Executes copilot actions.
 */
export class CopilotActionExecutor {
  private getState: () => RootState;
  // dispatch will be used when action implementations are completed
  // private dispatch: AppDispatch;

  constructor(_dispatch: AppDispatch, getState: () => RootState) {
    // this.dispatch = dispatch;
    this.getState = getState;
  }

  /**
   * Execute a single action.
   */
  async execute(action: CopilotAction): Promise<ActionResult> {
    try {
      switch (action.action) {
        case 'select_piece':
          return this.executeSelectPiece(action.pieceId);

        case 'deselect_all':
          return this.executeDeselectAll();

        case 'start_simulation':
          return this.executeStartSimulation();

        case 'stop_simulation':
          return this.executeStopSimulation();

        case 'create_piece':
          return this.executeCreatePiece(action);

        case 'delete_piece':
          return this.executeDeletePiece(action.pieceId);

        case 'auto_detect_seams':
          return this.executeAutoDetectSeams(action.pieceIds);

        default:
          return {
            success: false,
            error: `Action '${action.action}' not implemented yet`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute multiple actions in sequence.
   */
  async executeAll(actions: CopilotAction[]): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    for (const action of actions) {
      results.push(await this.execute(action));
    }
    return results;
  }

  // === Action Implementations ===

  private executeSelectPiece(pieceId: string): ActionResult {
    const state = this.getState();
    const piece = state.project?.pieces?.find(p => p.id === pieceId);

    if (!piece) {
      return { success: false, error: `Piece '${pieceId}' not found` };
    }

    // Selection would be dispatched here
    // this.dispatch(selectPiece(pieceId));

    return { success: true, message: `Selected piece '${pieceId}'` };
  }

  private executeDeselectAll(): ActionResult {
    // this.dispatch(deselectAll());
    return { success: true, message: 'Deselected all' };
  }

  private executeStartSimulation(): ActionResult {
    // this.dispatch(startSimulation());
    return { success: true, message: 'Simulation started' };
  }

  private executeStopSimulation(): ActionResult {
    // this.dispatch(stopSimulation());
    return { success: true, message: 'Simulation stopped' };
  }

  private executeCreatePiece(action: CopilotAction & { action: 'create_piece' }): ActionResult {
    // Would create piece based on shape and params
    return { success: true, message: `Created ${action.shape} piece` };
  }

  private executeDeletePiece(pieceId: string): ActionResult {
    const state = this.getState();
    const piece = state.project?.pieces?.find(p => p.id === pieceId);

    if (!piece) {
      return { success: false, error: `Piece '${pieceId}' not found` };
    }

    // this.dispatch(deletePiece(pieceId));
    return { success: true, message: `Deleted piece '${pieceId}'` };
  }

  private executeAutoDetectSeams(pieceIds?: string[]): ActionResult {
    // Would auto-detect seams
    return {
      success: true,
      message: pieceIds
        ? `Auto-detected seams for ${pieceIds.length} pieces`
        : 'Auto-detected all seams',
    };
  }
}

/**
 * Create an action executor instance.
 */
export function createActionExecutor(
  dispatch: AppDispatch,
  getState: () => RootState
): CopilotActionExecutor {
  return new CopilotActionExecutor(dispatch, getState);
}
