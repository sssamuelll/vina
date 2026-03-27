export interface NestingSheet {
  width: number;
  height: number;
  margin: number;
}

export interface NestingOptions {
  sheet: NestingSheet;
  gap: number;
  rotationStep: number;
  allowMirror: boolean;
  sortStrategy: 'area-desc' | 'height-desc' | 'width-desc';
  /** Per-piece placement rules keyed by pieceId */
  placementRules?: Record<string, import('../../types/types').PlacementRule[]>;
}

export interface PlacedPiece {
  pieceId: string;
  sheetIndex: number;
  x: number;
  y: number;
  rotation: number;
  mirrored: boolean;
}

export interface NestingResult {
  placements: PlacedPiece[];
  sheetsUsed: number;
  utilization: number;
  unplaced: string[];
}

export interface SkylineSegment {
  x: number;
  width: number;
  y: number;
}
