/**
 * Command Executor — applies CopilotCommands to the Redux store
 */

import { AppDispatch } from '../store';
import { addPiece, updatePiece, removePiece, movePiece, addInternalLine } from '../store/projectSlice';
import { selectPiece } from '../store/editorSlice';
import { CopilotCommand } from './protocol';
import { PatternPiece, PathCommand, InternalLine } from '../types/types';
import { uid } from '../utils/pathHelpers';

export function executeCommands(
  commands: CopilotCommand[],
  dispatch: AppDispatch,
  pieces: PatternPiece[],
): { executed: number; errors: string[] } {
  let executed = 0;
  const errors: string[] = [];

  for (const cmd of commands) {
    try {
      switch (cmd.type) {
        case 'create_piece': {
          const piece: PatternPiece = {
            ...cmd.piece,
            id: uid(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          dispatch(addPiece(piece));
          dispatch(selectPiece(piece.id));
          executed++;
          break;
        }

        case 'modify_outline': {
          const piece = pieces.find(p => p.id === cmd.pieceId);
          if (!piece) { errors.push(`Piece ${cmd.pieceId} not found`); break; }
          dispatch(updatePiece({
            ...piece,
            outline: cmd.outline,
            updatedAt: Date.now(),
          }));
          executed++;
          break;
        }

        case 'move_piece': {
          dispatch(movePiece({ id: cmd.pieceId, x: cmd.position.x, y: cmd.position.y }));
          executed++;
          break;
        }

        case 'rename_piece': {
          const piece = pieces.find(p => p.id === cmd.pieceId);
          if (!piece) { errors.push(`Piece ${cmd.pieceId} not found`); break; }
          dispatch(updatePiece({ ...piece, name: cmd.name, updatedAt: Date.now() }));
          executed++;
          break;
        }

        case 'set_seam_allowance': {
          const piece = pieces.find(p => p.id === cmd.pieceId);
          if (!piece) { errors.push(`Piece ${cmd.pieceId} not found`); break; }
          dispatch(updatePiece({ ...piece, seamAllowance: cmd.mm, updatedAt: Date.now() }));
          executed++;
          break;
        }

        case 'add_internal': {
          const line: InternalLine = {
            ...cmd.line,
            id: `int-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
          };
          dispatch(addInternalLine({ pieceId: cmd.pieceId, line }));
          executed++;
          break;
        }

        case 'delete_piece': {
          dispatch(removePiece(cmd.pieceId));
          executed++;
          break;
        }

        case 'scale_piece': {
          const piece = pieces.find(p => p.id === cmd.pieceId);
          if (!piece) { errors.push(`Piece ${cmd.pieceId} not found`); break; }
          const scaled: PathCommand[] = piece.outline.map(c => ({
            ...c,
            values: c.values.map(v => v * cmd.factor),
          }));
          dispatch(updatePiece({ ...piece, outline: scaled, updatedAt: Date.now() }));
          executed++;
          break;
        }

        case 'message':
          // No action needed, just display text
          break;

        default:
          errors.push(`Unknown command type: ${(cmd as any).type}`);
      }
    } catch (e: any) {
      errors.push(`Error executing ${cmd.type}: ${e.message}`);
    }
  }

  return { executed, errors };
}
