import type { InternalLineType, SemanticEdgeType } from '../types/types';

const EDGE_TYPE_LABELS = {
  seam: 'costura',
  fold: 'doblez',
  hem: 'dobladillo',
  opening: 'abertura',
  'dart-leg': 'lado de pinza',
  unknown: 'tipo desconocido',
} as const satisfies Record<SemanticEdgeType, string>;

const INTERNAL_TYPE_LABELS = {
  dart: 'pinza',
  grainline: 'hilo',
  notch: 'piquete',
  fold: 'doblez',
  pleat: 'pliegue',
  topstitch: 'pespunte',
  reference: 'referencia',
  seam: 'costura',
} as const satisfies Record<InternalLineType, string>;

export function inspectionEdgeTypeLabel(type: string): string {
  return EDGE_TYPE_LABELS[type as SemanticEdgeType] ?? 'tipo desconocido';
}

export function inspectionInternalTypeLabel(type: string): string {
  return INTERNAL_TYPE_LABELS[type as InternalLineType] ?? 'tipo desconocido';
}
