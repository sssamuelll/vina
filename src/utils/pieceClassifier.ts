/**
 * Piece Type Classification — auto-detect category and side from piece name.
 *
 * Supports EN/ES/FR/DE pattern naming conventions.
 *
 * @module pieceClassifier
 */

import type { PatternPiece, PieceCategory, PieceSide } from '../types/types';

interface Classification {
  category: PieceCategory;
  side: PieceSide;
}

// Order matters: more specific patterns first
const CATEGORY_PATTERNS: [RegExp, PieceCategory][] = [
  [/pocket|bolsillo|poche|tasche/i, 'pocket'],
  [/cuff|puño|poignet|manschette/i, 'cuff'],
  [/hood|capucha|capuche|kapuze/i, 'hood'],
  [/collar|cuello|col\b|kragen/i, 'collar'],
  [/yoke|canesú|empiècement|passe/i, 'yoke'],
  [/facing|vista|parementure/i, 'facing'],
  [/lining|forro|doublure|futter/i, 'lining'],
  [/waist\s*band|pretina|ceinture|bund/i, 'waistband'],
  [/sleeve|manga|manche|ärmel/i, 'sleeve'],
  [/skirt|falda|jupe|rock/i, 'skirt'],
  [/trouser|pantal|pantalon|hose|pant(?!s?\b)|leg\b/i, 'trouser'],
  [/bodice|corpiño|corsage|mieder/i, 'bodice'],
  // Generic body pieces → bodice
  [/front|back|espalda|delantero|devant|dos\b|vorder|rück/i, 'bodice'],
  [/blouse|shirt|camis|chemise|hemd/i, 'bodice'],
  [/jacket|chaqueta|veste|jacke/i, 'bodice'],
];

const SIDE_PATTERNS: [RegExp, PieceSide][] = [
  [/\bfront\b|delantero|devant|vorder/i, 'front'],
  [/\bback\b|espalda|trasero|dos\b|rück|hinter/i, 'back'],
  [/\bleft\b|izquierd|gauche|link/i, 'left'],
  [/\bright\b|derech|droit|recht/i, 'right'],
  [/\bcenter\b|centr|milieu|mitte/i, 'center'],
];

/**
 * Classify a pattern piece by name.
 */
export function classifyPiece(piece: PatternPiece): Classification {
  return classifyByName(piece.name);
}

/**
 * Classify by name string (also usable without a full PatternPiece).
 */
export function classifyByName(name: string): Classification {
  let category: PieceCategory = 'other';
  let side: PieceSide = 'both';

  for (const [re, cat] of CATEGORY_PATTERNS) {
    if (re.test(name)) { category = cat; break; }
  }

  for (const [re, s] of SIDE_PATTERNS) {
    if (re.test(name)) { side = s; break; }
  }

  return { category, side };
}

/**
 * Apply classification to a piece (mutates category/side fields).
 */
export function applyClassification(piece: PatternPiece): void {
  const { category, side } = classifyPiece(piece);
  piece.category = category;
  piece.side = side;
}
