export interface GradeRule {
  measurement: string;
  deltaX: number;
  deltaY: number;
}

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
