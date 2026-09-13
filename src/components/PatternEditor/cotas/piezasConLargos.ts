import type { EditorState, PatternPiece } from '../../../types/types';

export type LineLengthMode = EditorState['lineLengthMode'];

export function piezasConLargos(
  pieces: PatternPiece[],
  mode: LineLengthMode,
  context: { suppress: boolean },
): PatternPiece[] {
  return mode === 'all' && !context.suppress ? pieces : [];
}
