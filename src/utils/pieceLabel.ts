import type { PatternPiece } from '../types/types';

/**
 * Composed label-block content for a pattern piece (design surface 5, P0.2).
 *
 * The block answers María's first acceptance question — "what piece is this and
 * how many do I cut?" — at a glance. `name` is the headline (`FRONT · 01`);
 * `meta` is the ordered list of secondary lines (`CUT ×2`, size, fabric,
 * symmetry). The renderer draws `name` larger and `meta` smaller, both in mono.
 *
 * Numbering and quantity are DERIVED, not stored: the PatternPiece model has no
 * `number`/`quantity`/`cutOnFold` field, so we derive `number` from the piece's
 * stable index and `quantity` from mirroring (a mirrored / symmetry-linked piece
 * cuts ×2). This keeps the data model untouched; promoting these to real fields
 * is a separate, model-rippling change.
 */
export interface PieceLabelLines {
  name: string;
  meta: string[];
}

type LabelPiece = Pick<PatternPiece, 'name' | 'mirrored' | 'linkMode' | 'gradedSize' | 'fabricCode'>;

/** Two-digit, 1-based piece number (`0` → `"01"`, `11` → `"12"`). */
export function pieceNumberLabel(index: number): string {
  return String(index + 1).padStart(2, '0');
}

/** Pieces cut ×2 when mirrored or symmetry-linked; otherwise ×1. */
export function pieceCutQuantity(piece: Pick<PatternPiece, 'mirrored' | 'linkMode'>): number {
  return piece.mirrored || piece.linkMode === 'symmetry' ? 2 : 1;
}

/**
 * Build the label block for a piece.
 *
 * @param piece     piece fields used for the label
 * @param index     0-based position used to derive the displayed number
 * @param fabricName resolved fabric label (e.g. "Jersey 180"); omitted if unknown
 */
export function formatPieceLabel(
  piece: LabelPiece,
  index: number,
  fabricName?: string,
): PieceLabelLines {
  const name = `${(piece.name || 'PIECE').trim().toUpperCase()} · ${pieceNumberLabel(index)}`;

  const meta: string[] = [`CUT ×${pieceCutQuantity(piece)}`];

  if (piece.gradedSize && piece.gradedSize.trim()) {
    meta.push(piece.gradedSize.trim().toUpperCase());
  }
  if (fabricName && fabricName.trim()) {
    meta.push(fabricName.trim().toUpperCase());
  } else if (piece.fabricCode && piece.fabricCode.trim()) {
    meta.push(piece.fabricCode.trim().toUpperCase());
  }
  if (piece.linkMode === 'symmetry') {
    meta.push('MIRROR PAIR');
  }

  return { name, meta };
}
