/**
 * Semantic Resolver - resolves user terms to technical pattern terminology.
 *
 * Uses fuzzy matching against the GarmentKnowledge base and validates
 * resolved entities against actual piece edges for 100% accuracy.
 *
 * @module copilot/intelligence/SemanticResolver
 */

import type { PatternPiece } from '../../types/types';
import type {
  PieceClassification,
  Resolution,
  ResolvedEdge,
  ResolvedPiece,
  ParsedValue,
  IntentType,
  ConfidenceLevel,
  OperationType,
} from './types';
import { findEdgeByUserTerm } from './GarmentKnowledge';

/**
 * Resolves user terms to technical pattern terminology with validation.
 */
export class SemanticResolver {
  /**
   * Resolve a user request to technical entities.
   */
  async resolve(
    request: string,
    pieces: PatternPiece[],
    classifications: PieceClassification[],
  ): Promise<Resolution> {
    const intent = this.detectIntent(request);
    const values = this.parseValues(request);
    const edges = this.resolveEdges(request, pieces, classifications);
    const resolvedPieces = this.resolvePieces(request, pieces, classifications);

    let confidence: ConfidenceLevel = 'certain';
    if (intent === 'modify_edge' && edges.length === 0) {
      confidence = 'ambiguous';
    } else if (edges.some(e => e.confidence < 0.8)) {
      confidence = 'probable';
    }

    return {
      intent,
      entities: {
        edges,
        pieces: resolvedPieces,
        values,
      },
      confidence,
    };
  }

  private detectIntent(request: string): IntentType {
    const r = request.toLowerCase();
    if (/reduce|reducir|disminuir|acortar|shrink|decrease/.test(r)) return 'modify_edge';
    if (/aumenta|incrementa|agranda|increase|expand|widen|lengthen/.test(r)) return 'modify_edge';
    if (/modifica|cambia|ajusta|modify|change|adjust/.test(r)) return 'modify_edge';
    if (/crea|genera|nuevo|create|make|new|add/.test(r)) return 'create';
    if (/cual|que|como|muestr|list|show|what|which|how/.test(r)) return 'query';
    return 'modify_edge';
  }

  private detectOperation(request: string): OperationType {
    const r = request.toLowerCase();
    if (/reduce|reducir|disminuir|acortar|shrink|decrease/.test(r)) return 'reduce';
    if (/aumenta|incrementa|agranda|increase|expand|widen|lengthen/.test(r)) return 'increase';
    if (/set|establecer|fijar/.test(r)) return 'set';
    return 'reduce';
  }

  private parseValues(request: string): ParsedValue[] {
    const values: ParsedValue[] = [];
    const operation = this.detectOperation(request);
    const patterns = [
      { regex: /(\d+(?:\.\d+)?)\s*cm/gi, unit: 'cm' as const, multiplier: 10 },
      { regex: /(\d+(?:\.\d+)?)\s*mm/gi, unit: 'mm' as const, multiplier: 1 },
      { regex: /(\d+(?:\.\d+)?)\s*(?:inch|in|")/gi, unit: 'cm' as const, multiplier: 25.4 },
    ];

    for (const { regex, unit, multiplier } of patterns) {
      let match;
      while ((match = regex.exec(request)) !== null) {
        const rawValue = parseFloat(match[1]);
        values.push({
          raw: match[0].trim(),
          value: rawValue * multiplier,
          unit,
          operation,
        });
      }
    }
    return values;
  }

  private resolveEdges(
    request: string,
    pieces: PatternPiece[],
    classifications: PieceClassification[],
  ): ResolvedEdge[] {
    const edges: ResolvedEdge[] = [];
    const words = this.extractPotentialEdgeTerms(request);
    const classMap = new Map<string, PieceClassification>();
    for (const c of classifications) {
      classMap.set(c.pieceId, c);
    }

    for (const term of words) {
      for (const piece of pieces) {
        const classification = classMap.get(piece.id);
        if (!classification) continue;

        const resolvedName = findEdgeByUserTerm(term, classification.type);
        if (!resolvedName) continue;

        const hasEdge = piece.edges?.some(e =>
          e.name.toLowerCase() === resolvedName.toLowerCase()
        );
        if (!hasEdge) continue;

        // Check if we already have an entry for this piece+edge combination
        const existing = edges.find(
          e => e.resolved === resolvedName && e.pieceIds.includes(piece.id)
        );
        if (!existing) {
          edges.push({
            userTerm: term,
            resolved: resolvedName,
            pieceIds: [piece.id],
            confidence: 1.0,
          });
        }
      }
    }

    if (edges.length === 0) {
      for (const term of words) {
        for (const piece of pieces) {
          const matchingEdge = piece.edges?.find(e =>
            e.name.toLowerCase().includes(term.toLowerCase())
          );
          if (matchingEdge) {
            edges.push({
              userTerm: term,
              resolved: matchingEdge.name,
              pieceIds: [piece.id],
              confidence: 0.7,
            });
          }
        }
      }
    }
    return edges;
  }

  private extractPotentialEdgeTerms(request: string): string[] {
    const stopWords = new Set([
      'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'por',
      'the', 'a', 'an', 'of', 'in', 'by', 'to', 'for', 'with',
      'reduce', 'reducir', 'aumenta', 'aumentar', 'modifica', 'modificar',
      'cm', 'mm', 'inch', 'centimetros', 'milimetros',
    ]);

    return request
      .toLowerCase()
      .replace(/[0-9.,]+\s*(cm|mm|inch|in|")?/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
  }

  private resolvePieces(
    request: string,
    pieces: PatternPiece[],
    classifications: PieceClassification[],
  ): ResolvedPiece[] {
    const resolved: ResolvedPiece[] = [];
    const r = request.toLowerCase();
    const frontPatterns = /front|delantero|frente|devant/i;
    const backPatterns = /back|espalda|trasero|dos\b/i;

    for (const piece of pieces) {
      const classification = classifications.find(c => c.pieceId === piece.id);
      if (!classification) continue;

      if (frontPatterns.test(r) && classification.type.includes('front')) {
        resolved.push({
          userTerm: r.match(frontPatterns)?.[0] ?? 'front',
          pieceId: piece.id,
          type: classification.type,
          confidence: 1.0,
        });
      } else if (backPatterns.test(r) && classification.type.includes('back')) {
        resolved.push({
          userTerm: r.match(backPatterns)?.[0] ?? 'back',
          pieceId: piece.id,
          type: classification.type,
          confidence: 1.0,
        });
      }
    }
    return resolved;
  }
}
