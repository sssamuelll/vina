import type { EditorState, PatternPiece } from '../../../types/types';

export type LineLengthMode = EditorState['lineLengthMode'];

export function piezasConLargos(
  pieces: PatternPiece[],
  mode: LineLengthMode,
  context: { hotPieceId: string | null; suppress: boolean },
): PatternPiece[] {
  if (context.suppress || mode === 'none') return [];
  if (mode === 'all') return pieces;
  if (context.hotPieceId === null) return [];
  return pieces.filter(piece => piece.id === context.hotPieceId);
}
