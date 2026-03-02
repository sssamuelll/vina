/**
 * Garment Knowledge Base - static expert knowledge about garment construction.
 *
 * Maps piece types to expected edges and provides multilingual term resolution.
 *
 * @module copilot/intelligence/GarmentKnowledge
 */

import type { PieceType, PieceTypeKnowledge } from './types';

/**
 * Complete garment knowledge base.
 * Maps piece types to their expected edges, user term mappings, and body measurement relations.
 */
export const GARMENT_KNOWLEDGE: Partial<Record<PieceType, PieceTypeKnowledge>> = {
  'bodice-front': {
    expectedEdges: ['neckline', 'shoulder', 'armhole', 'sideSeam', 'hemline', 'centerFront'],
    edgeSemantics: {
      'neckline': ['escote', 'cuello', 'neck', 'neckline', 'encolure', 'col', 'ausschnitt'],
      'shoulder': ['hombro', 'shoulder', 'epaule', 'schulter'],
      'armhole': ['sisa', 'armhole', 'emmanchure', 'armloch'],
      'sideSeam': ['costado', 'lateral', 'side', 'sideseam', 'cote', 'seitennaht'],
      'hemline': ['bajo', 'hem', 'hemline', 'ruedo', 'ourlet', 'saum'],
      'centerFront': ['centro', 'center', 'centerfront', 'cf', 'milieu devant'],
    },
    measurementRelations: {
      'neckline': 'neckCirc',
      'shoulder': 'shoulder',
      'armhole': 'armLength',
      'hemline': 'chest',
      'sideSeam': 'height',
    },
  },
  'bodice-back': {
    expectedEdges: ['neckline', 'shoulder', 'armhole', 'sideSeam', 'hemline', 'centerBack'],
    edgeSemantics: {
      'neckline': ['escote', 'cuello', 'neck', 'neckline', 'encolure', 'ausschnitt'],
      'shoulder': ['hombro', 'shoulder', 'epaule', 'schulter'],
      'armhole': ['sisa', 'armhole', 'emmanchure', 'armloch'],
      'sideSeam': ['costado', 'lateral', 'side', 'sideseam', 'cote', 'seitennaht'],
      'hemline': ['bajo', 'hem', 'hemline', 'ruedo', 'ourlet', 'saum'],
      'centerBack': ['centro espalda', 'center back', 'centerback', 'cb', 'milieu dos'],
    },
    measurementRelations: {
      'neckline': 'neckCirc',
      'shoulder': 'shoulder',
      'armhole': 'armLength',
      'hemline': 'chest',
      'sideSeam': 'height',
    },
  },
  'sleeve': {
    expectedEdges: ['sleeveCap', 'underarmSeam', 'cuffEdge'],
    edgeSemantics: {
      'sleeveCap': ['copa', 'cabeza', 'cap', 'sleeve head', 'tete de manche', 'armelpunkt'],
      'cuffEdge': ['puño', 'bajo', 'hem', 'cuff', 'poignet', 'manschette'],
      'underarmSeam': ['axila', 'underarm', 'bajo brazo', 'couture dessous de bras'],
    },
    measurementRelations: {
      'sleeveCap': 'armLength',
      'cuffEdge': 'armLength',
      'underarmSeam': 'armLength',
    },
  },
  'skirt-front': {
    expectedEdges: ['waistline', 'sideSeam', 'hemline', 'centerFront'],
    edgeSemantics: {
      'waistline': ['cintura', 'waist', 'waistline', 'ceinture', 'taille'],
      'sideSeam': ['costado', 'lateral', 'side', 'cote', 'seitennaht'],
      'hemline': ['bajo', 'hem', 'ruedo', 'ourlet', 'saum'],
      'centerFront': ['centro', 'center', 'cf', 'milieu devant'],
    },
    measurementRelations: {
      'waistline': 'waist',
      'hemline': 'hips',
      'sideSeam': 'inseam',
    },
  },
  'skirt-back': {
    expectedEdges: ['waistline', 'sideSeam', 'hemline', 'centerBack'],
    edgeSemantics: {
      'waistline': ['cintura', 'waist', 'waistline', 'ceinture', 'taille'],
      'sideSeam': ['costado', 'lateral', 'side', 'cote', 'seitennaht'],
      'hemline': ['bajo', 'hem', 'ruedo', 'ourlet', 'saum'],
      'centerBack': ['centro espalda', 'center back', 'cb', 'milieu dos'],
    },
    measurementRelations: {
      'waistline': 'waist',
      'hemline': 'hips',
      'sideSeam': 'inseam',
    },
  },
  'pants-front': {
    expectedEdges: ['waistline', 'sideSeam', 'inseam', 'hemline', 'crotchCurve'],
    edgeSemantics: {
      'waistline': ['cintura', 'waist', 'ceinture', 'taille'],
      'sideSeam': ['costado', 'lateral', 'side', 'cote'],
      'inseam': ['entrepierna', 'inseam', 'entrejambe'],
      'hemline': ['bajo', 'hem', 'ruedo', 'ourlet'],
      'crotchCurve': ['tiro', 'crotch', 'entrecuisse'],
    },
    measurementRelations: {
      'waistline': 'waist',
      'inseam': 'inseam',
      'hemline': 'hips',
    },
  },
  'pants-back': {
    expectedEdges: ['waistline', 'sideSeam', 'inseam', 'hemline', 'crotchCurve'],
    edgeSemantics: {
      'waistline': ['cintura', 'waist', 'ceinture', 'taille'],
      'sideSeam': ['costado', 'lateral', 'side', 'cote'],
      'inseam': ['entrepierna', 'inseam', 'entrejambe'],
      'hemline': ['bajo', 'hem', 'ruedo', 'ourlet'],
      'crotchCurve': ['tiro', 'crotch', 'entrecuisse'],
    },
    measurementRelations: {
      'waistline': 'waist',
      'inseam': 'inseam',
      'hemline': 'hips',
    },
  },
  'collar': {
    expectedEdges: ['neckEdge', 'outerEdge', 'centerBack'],
    edgeSemantics: {
      'neckEdge': ['cuello interior', 'neck edge', 'bord de cou'],
      'outerEdge': ['borde exterior', 'outer edge', 'bord exterieur'],
      'centerBack': ['centro espalda', 'center back', 'milieu dos'],
    },
    measurementRelations: {
      'neckEdge': 'neckCirc',
    },
  },
  'cuff': {
    expectedEdges: ['topEdge', 'bottomEdge', 'sideSeam'],
    edgeSemantics: {
      'topEdge': ['borde superior', 'top edge', 'bord superieur'],
      'bottomEdge': ['borde inferior', 'bottom edge', 'bord inferieur'],
      'sideSeam': ['costado', 'side', 'cote'],
    },
    measurementRelations: {},
  },
};

/**
 * Get knowledge for a specific piece type.
 */
export function getKnowledgeForType(type: PieceType): PieceTypeKnowledge | undefined {
  return GARMENT_KNOWLEDGE[type];
}

/**
 * Find the technical edge name from a user term.
 *
 * @param userTerm - User's term (e.g., "escote", "hombro")
 * @param pieceType - The piece type to search in
 * @returns Technical edge name or undefined if not found
 */
export function findEdgeByUserTerm(userTerm: string, pieceType: PieceType): string | undefined {
  const knowledge = GARMENT_KNOWLEDGE[pieceType];
  if (!knowledge) return undefined;

  const normalizedTerm = userTerm.toLowerCase().trim();

  for (const [edgeName, userTerms] of Object.entries(knowledge.edgeSemantics)) {
    if (userTerms.some(t => t.toLowerCase() === normalizedTerm)) {
      return edgeName;
    }
  }

  return undefined;
}

/**
 * Get the related body measurement for an edge.
 */
export function getRelatedMeasurement(edgeName: string, pieceType: PieceType): string | undefined {
  const knowledge = GARMENT_KNOWLEDGE[pieceType];
  if (!knowledge) return undefined;
  return knowledge.measurementRelations[edgeName];
}

/**
 * Get all user terms for an edge.
 */
export function getUserTermsForEdge(edgeName: string, pieceType: PieceType): string[] {
  const knowledge = GARMENT_KNOWLEDGE[pieceType];
  if (!knowledge) return [];
  return knowledge.edgeSemantics[edgeName] ?? [];
}
