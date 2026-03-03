/**
 * searchPieces Meta-Tool
 *
 * Searches pattern pieces by a free-text query, matching against piece name,
 * category, side, and ID. Returns matches sorted by relevance score (0-1).
 * Used by the LLM to locate pieces when the user refers to them by
 * description rather than exact ID.
 *
 * Read-only — never modifies state.
 *
 * @module searchPieces
 */

import type { MetaToolDefinition, MetaToolResult } from './types';

/**
 * Compute a relevance score (0-1) for how well a piece matches the query.
 * Higher scores indicate better matches. Checks name, category, side, and ID.
 */
function computeMatchScore(
  piece: { id: string; name: string; category?: string; side?: string },
  queryLower: string,
): { score: number; reason: string } {
  const nameLower = piece.name.toLowerCase();
  const categoryLower = (piece.category ?? '').toLowerCase();
  const sideLower = (piece.side ?? '').toLowerCase();
  const idLower = piece.id.toLowerCase();

  // Exact name match
  if (nameLower === queryLower) {
    return { score: 1.0, reason: `Exact name match: "${piece.name}"` };
  }

  let score = 0;
  const reasons: string[] = [];

  // Name contains query
  if (nameLower.includes(queryLower)) {
    score = Math.max(score, 0.8);
    reasons.push(`Name contains "${queryLower}"`);
  }

  // Query contains name words
  const queryWords = queryLower.split(/\s+/);
  const nameWords = nameLower.split(/\s+/);
  const matchingNameWords = nameWords.filter((w) =>
    queryWords.some((qw) => w.includes(qw) || qw.includes(w)),
  );
  if (matchingNameWords.length > 0) {
    const wordScore = 0.6 * (matchingNameWords.length / nameWords.length);
    if (wordScore > score) {
      score = wordScore;
      reasons.push(`Name words match: ${matchingNameWords.join(', ')}`);
    }
  }

  // Category match
  if (categoryLower && categoryLower.includes(queryLower)) {
    const catScore = 0.5;
    if (catScore > score) {
      score = catScore;
      reasons.push(`Category matches: "${piece.category}"`);
    }
  } else if (categoryLower && queryLower.includes(categoryLower)) {
    const catScore = 0.4;
    if (catScore > score) {
      score = catScore;
      reasons.push(`Query contains category: "${piece.category}"`);
    }
  }

  // Side match
  if (sideLower && sideLower.includes(queryLower)) {
    const sideScore = 0.5;
    if (sideScore > score) {
      score = sideScore;
      reasons.push(`Side matches: "${piece.side}"`);
    }
  } else if (sideLower && queryLower.includes(sideLower)) {
    const sideScore = 0.35;
    if (sideScore > score) {
      score = sideScore;
      reasons.push(`Query contains side: "${piece.side}"`);
    } else if (score > 0) {
      // Add as supplementary match
      score = Math.min(score + 0.1, 1.0);
      reasons.push(`Side also matches: "${piece.side}"`);
    }
  }

  // ID match
  if (idLower.includes(queryLower)) {
    const idScore = 0.3;
    if (idScore > score) {
      score = idScore;
      reasons.push(`ID contains "${queryLower}"`);
    }
  }

  return {
    score,
    reason: reasons.join('; ') || 'No match',
  };
}

export const searchPiecesTool: MetaToolDefinition = {
  name: 'searchPieces',
  description:
    'Searches pattern pieces by a free-text query, matching against piece name, category, side, and ID. Returns matches sorted by relevance score.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Free-text search query to match against piece name, category, side, or ID.',
      },
    },
    required: ['query'],
  },
  execute: async (params, getState): Promise<MetaToolResult> => {
    const query = params.query as string;
    const queryLower = query.toLowerCase();
    const state = getState();
    const pieces = (state.project?.pieces ?? []) as Array<{
      id: string;
      name: string;
      category?: string;
      side?: string;
    }>;

    const matches = pieces
      .map((piece) => {
        const { score, reason } = computeMatchScore(piece, queryLower);
        return {
          pieceId: piece.id,
          pieceName: piece.name,
          score,
          reason,
        };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);

    return {
      success: true,
      data: {
        matches,
      } as unknown as Record<string, unknown>,
    };
  },
};
