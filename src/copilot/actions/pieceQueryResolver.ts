/**
 * Piece Query Resolver — converts natural language queries to piece IDs.
 *
 * Examples:
 * - "all sleeve pieces" → ["left_sleeve", "right_sleeve"]
 * - "the front bodice" → ["front_bodice"]
 * - "pieces with darts" → ["front_bodice", "back_bodice"]
 * - "all pieces" → [...allPieceIds]
 *
 * @module pieceQueryResolver
 */

import type { PatternPiece } from '../../types/types';

// ============================================================================
// Query Result
// ============================================================================

export interface QueryResult {
  /** Matched piece IDs */
  pieceIds: string[];
  /** Human-readable explanation of what matched */
  explanation: string;
  /** Confidence score (0-1) */
  confidence: number;
}

// ============================================================================
// Query Patterns
// ============================================================================

/** Common piece type patterns for matching */
const PIECE_TYPE_PATTERNS: Record<string, RegExp[]> = {
  sleeve: [/sleeve/i, /manga/i, /manche/i],
  bodice: [/bodice/i, /cuerpo/i, /corsage/i, /torso/i],
  front: [/front/i, /delantero/i, /devant/i, /frente/i],
  back: [/back/i, /espalda/i, /dos/i, /trasero/i],
  collar: [/collar/i, /cuello/i, /col/i],
  cuff: [/cuff/i, /puño/i, /poignet/i],
  pocket: [/pocket/i, /bolsillo/i, /poche/i],
  skirt: [/skirt/i, /falda/i, /jupe/i],
  panel: [/panel/i, /paño/i, /panneau/i],
  waistband: [/waistband/i, /pretina/i, /ceinture/i],
  facing: [/facing/i, /vista/i, /parementure/i],
  yoke: [/yoke/i, /canesú/i, /empiècement/i],
  hood: [/hood/i, /capucha/i, /capuche/i],
  placket: [/placket/i, /tapeta/i, /patte/i],
};

/** Modifiers that refine piece selection */
const MODIFIER_PATTERNS: Record<string, RegExp[]> = {
  left: [/left/i, /izquierd/i, /gauche/i],
  right: [/right/i, /derech/i, /droit/i],
  upper: [/upper/i, /superior/i, /supérieur/i, /top/i],
  lower: [/lower/i, /inferior/i, /inférieur/i, /bottom/i],
  inner: [/inner/i, /interior/i, /intérieur/i, /inside/i],
  outer: [/outer/i, /exterior/i, /extérieur/i, /outside/i],
};

/** Internal feature patterns */
const FEATURE_PATTERNS: Record<string, RegExp[]> = {
  dart: [/dart/i, /pinza/i, /pince/i],
  pleat: [/pleat/i, /pliegue/i, /pli/i],
  grainline: [/grain/i, /hilo/i, /droit-fil/i],
  notch: [/notch/i, /muesca/i, /cran/i],
};

// ============================================================================
// Resolver Functions
// ============================================================================

/**
 * Check if a piece name matches a pattern type.
 */
function matchesPieceType(name: string, type: string): boolean {
  const patterns = PIECE_TYPE_PATTERNS[type];
  if (!patterns) return false;
  return patterns.some(p => p.test(name));
}

/**
 * Check if a piece name has a modifier.
 */
function hasModifier(name: string, modifier: string): boolean {
  const patterns = MODIFIER_PATTERNS[modifier];
  if (!patterns) return false;
  return patterns.some(p => p.test(name));
}

/**
 * Check if a piece has a specific internal feature.
 */
function hasFeature(piece: PatternPiece, feature: string): boolean {
  const patterns = FEATURE_PATTERNS[feature];
  if (!patterns) return false;

  // Check piece name
  if (patterns.some(p => p.test(piece.name))) return true;

  // Check internals
  for (const internal of piece.internals) {
    if (patterns.some(p => p.test(internal.type))) return true;
  }

  return false;
}

/**
 * Extract keywords from a query.
 */
function extractKeywords(query: string): {
  types: string[];
  modifiers: string[];
  features: string[];
  all: boolean;
  selected: boolean;
} {
  const q = query.toLowerCase();

  const types = Object.keys(PIECE_TYPE_PATTERNS).filter(type =>
    PIECE_TYPE_PATTERNS[type].some(p => p.test(q))
  );

  const modifiers = Object.keys(MODIFIER_PATTERNS).filter(mod =>
    MODIFIER_PATTERNS[mod].some(p => p.test(q))
  );

  const features = Object.keys(FEATURE_PATTERNS).filter(feat =>
    FEATURE_PATTERNS[feat].some(p => p.test(q))
  );

  const all = /\ball\b|\btodos?\b|\btout(es?)?\b/i.test(q);
  const selected = /\bselected\b|\bseleccionad/i.test(q);

  return { types, modifiers, features, all, selected };
}

/**
 * Score how well a piece matches a query.
 */
function scorePieceMatch(piece: PatternPiece, keywords: ReturnType<typeof extractKeywords>): number {
  let score = 0;

  // Type matches are worth most
  for (const type of keywords.types) {
    if (matchesPieceType(piece.name, type)) {
      score += 10;
    }
  }

  // Modifier matches refine selection
  for (const mod of keywords.modifiers) {
    if (hasModifier(piece.name, mod)) {
      score += 5;
    }
  }

  // Feature matches
  for (const feat of keywords.features) {
    if (hasFeature(piece, feat)) {
      score += 8;
    }
  }

  return score;
}

// ============================================================================
// Main Resolver
// ============================================================================

/**
 * Resolve a natural language query to piece IDs.
 *
 * @param query - Natural language query like "all sleeve pieces"
 * @param pieces - Available pieces to search
 * @param selectedPieceIds - Currently selected piece IDs (for "selected" queries)
 * @returns QueryResult with matched piece IDs
 */
export function resolvePieceQuery(
  query: string,
  pieces: PatternPiece[],
  selectedPieceIds: string[] = []
): QueryResult {
  // Handle explicit "all" queries (English, Spanish, French)
  const allPiecesPattern = /\b(all|tod[ao]s?)\s*(the\s+|las?\s+)?(pieces?|piezas?|pi[eè]ces?)?\s*$/i;
  if (allPiecesPattern.test(query.trim()) || query.trim().toLowerCase() === 'all') {
    return {
      pieceIds: pieces.map(p => p.id),
      explanation: `All ${pieces.length} pieces`,
      confidence: 1.0,
    };
  }

  // Handle "selected" queries
  if (/\bselected\b|\bseleccionad/i.test(query)) {
    if (selectedPieceIds.length === 0) {
      return {
        pieceIds: [],
        explanation: 'No pieces currently selected',
        confidence: 1.0,
      };
    }
    return {
      pieceIds: [...selectedPieceIds],
      explanation: `${selectedPieceIds.length} selected piece(s)`,
      confidence: 1.0,
    };
  }

  // Handle "none" / "clear" queries
  if (/\b(none|clear|ninguno?|limpiar)\b/i.test(query)) {
    return {
      pieceIds: [],
      explanation: 'Cleared selection',
      confidence: 1.0,
    };
  }

  // Extract keywords from query
  const keywords = extractKeywords(query);

  // If no keywords matched, try direct name matching
  if (keywords.types.length === 0 && keywords.features.length === 0) {
    // Try fuzzy name matching
    const queryLower = query.toLowerCase().trim();
    const directMatches = pieces.filter(p =>
      p.name.toLowerCase().includes(queryLower) ||
      p.id.toLowerCase().includes(queryLower)
    );

    if (directMatches.length > 0) {
      return {
        pieceIds: directMatches.map(p => p.id),
        explanation: directMatches.length === 1
          ? `Found "${directMatches[0].name}"`
          : `Found ${directMatches.length} pieces matching "${query}"`,
        confidence: directMatches.length === 1 ? 0.9 : 0.7,
      };
    }

    // No matches found
    return {
      pieceIds: [],
      explanation: `No pieces matching "${query}"`,
      confidence: 0.5,
    };
  }

  // Score each piece
  const scoredPieces = pieces.map(piece => ({
    piece,
    score: scorePieceMatch(piece, keywords),
  }));

  // Filter pieces with positive scores
  const matches = scoredPieces
    .filter(sp => sp.score > 0)
    .sort((a, b) => b.score - a.score);

  if (matches.length === 0) {
    return {
      pieceIds: [],
      explanation: `No pieces matching "${query}"`,
      confidence: 0.5,
    };
  }

  // If "all" modifier present, return all matches
  if (keywords.all) {
    return {
      pieceIds: matches.map(m => m.piece.id),
      explanation: `All ${matches.length} ${keywords.types[0] || 'matching'} pieces`,
      confidence: 0.9,
    };
  }

  // Otherwise, return matches (threshold based on highest score)
  const threshold = matches[0].score * 0.5;
  const filtered = matches.filter(m => m.score >= threshold);

  const pieceNames = filtered.map(m => m.piece.name).join(', ');

  return {
    pieceIds: filtered.map(m => m.piece.id),
    explanation: filtered.length === 1
      ? `"${filtered[0].piece.name}"`
      : `${filtered.length} pieces: ${pieceNames}`,
    confidence: filtered.length === 1 ? 0.85 : 0.75,
  };
}

/**
 * Try to resolve a query that might be either a piece ID or natural language.
 *
 * @param queryOrId - Either a piece ID or a natural language query
 * @param pieces - Available pieces
 * @param selectedPieceIds - Currently selected pieces
 * @returns Resolved piece IDs
 */
export function resolvePieceQueryOrId(
  queryOrId: string | string[],
  pieces: PatternPiece[],
  selectedPieceIds: string[] = []
): string[] {
  // If array, assume they're IDs
  if (Array.isArray(queryOrId)) {
    return queryOrId.filter(id => pieces.some(p => p.id === id));
  }

  // Check if it's a direct ID match
  const directMatch = pieces.find(p => p.id === queryOrId);
  if (directMatch) {
    return [directMatch.id];
  }

  // Otherwise, treat as natural language query
  const result = resolvePieceQuery(queryOrId, pieces, selectedPieceIds);
  return result.pieceIds;
}
