// GradeRule is part of the persisted piece model — it lives in the base
// types module (next to NotchAnchor/PatternPiece) and is re-exported here so
// existing `from './types'` imports keep working.
import type { GradeRule } from '../../types/types';
export type { GradeRule };

export interface GradedPoint {
  x: number;
  y: number;
  rules: GradeRule[];
}

export interface GradeTable {
  sizes: Record<string, Partial<Record<string, number>>>;
}

export interface GradingOptions {
  baseSize: string;
  targetSize: string;
  gradeTable: GradeTable;
  baseMeasurements: Record<string, number>;
}
