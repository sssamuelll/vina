// ─── DXF Type Definitions ───

import type { PatternPiece } from '../../types/types';

export interface DXFDocument {
  header: Map<string, string | number>;
  layers: DXFLayer[];
  blocks: Map<string, DXFBlock>;
  entities: DXFEntity[];
}

export interface DXFLayer {
  name: string;
  color: number;
  lineType: string;
}

export interface DXFBlock {
  name: string;
  basePoint: { x: number; y: number };
  entities: DXFEntity[];
}

export type DXFEntityType =
  | 'LINE'
  | 'LWPOLYLINE'
  | 'POLYLINE'
  | 'VERTEX'
  | 'SPLINE'
  | 'ARC'
  | 'CIRCLE'
  | 'TEXT'
  | 'MTEXT'
  | 'INSERT'
  | 'SEQEND'
  | 'POINT';

export interface DXFEntity {
  type: DXFEntityType;
  layer: string;
  data: DXFEntityData;
}

// ─── Entity Data Types ───

export interface DXFLineData {
  x1: number; y1: number;
  x2: number; y2: number;
}

/** POINT entity — used by CLO/AAMA exports for notch & drill-hole markers. */
export interface DXFPointData {
  x: number; y: number;
}

export interface DXFLWPolylineData {
  closed: boolean;
  vertices: { x: number; y: number; bulge: number }[];
}

export interface DXFPolylineData {
  closed: boolean;
  vertices: { x: number; y: number; bulge: number }[];
}

export interface DXFSplineData {
  degree: number;
  closed: boolean;
  knots: number[];
  controlPoints: { x: number; y: number }[];
  fitPoints: { x: number; y: number }[];
}

export interface DXFArcData {
  cx: number; cy: number;
  radius: number;
  startAngle: number; // degrees
  endAngle: number;   // degrees
}

export interface DXFCircleData {
  cx: number; cy: number;
  radius: number;
}

export interface DXFTextData {
  text: string;
  x: number; y: number;
  height: number;
}

export interface DXFInsertData {
  blockName: string;
  x: number; y: number;
  scaleX: number; scaleY: number;
  rotation: number; // degrees
}

export type DXFEntityData =
  | DXFLineData
  | DXFPointData
  | DXFLWPolylineData
  | DXFPolylineData
  | DXFSplineData
  | DXFArcData
  | DXFCircleData
  | DXFTextData
  | DXFInsertData;

// ─── AAMA Layer Constants ───

export const AAMA_LAYERS = {
  CUT: '1',
  NOTCH: '4',
  GRAINLINE: '7',
  DRAW: '8',
  INTCUT: '11',
  FABRIC_CODE: '13',      // fabric type/code per piece
  ANNOTATION: '14',       // annotation text per piece
  FOLD_DIR: '15',         // fold direction markers (mountain/valley)
} as const;

/**
 * Rol semántico de una capa DXF.
 *
 * `'draw'` (líneas de dibujo: estilo, STRIPE, PLAID) e `'intcut'` (cortes
 * internos genéricos) son líneas internas que NO son pinzas — se importan
 * como `type:'reference'`. `'dart'` es el rol de las capas que sí traen
 * pinzas (hoy solo `PINCE` de Lectra); esas sí llegan como `type:'dart'`
 * y las lee `extractDarts`. Ver #1019/#1020.
 */
export type LayerRole = 'cut' | 'notch' | 'grainline' | 'draw' | 'intcut' | 'dart' | 'label' | 'seam' | 'unknown';

/** Map AAMA numbered layers and named layers to semantic roles */
export function layerRole(layerName: string): LayerRole {
  const n = layerName.trim();
  switch (n) {
    case '1': case 'CUT': return 'cut';
    case '4': case 'NOTCH': return 'notch';
    case '7': case 'GRAINLINE': return 'grainline';
    case '8': case 'DRAW': return 'draw';
    case '11': case 'INTCUT': return 'intcut';
    case 'SEAM': return 'seam';
    case 'LABEL': return 'label';
    default: return 'unknown';
  }
}

// ─── Format Detection Types ───

export type FormatId = 'aama' | 'astm' | 'gerber' | 'lectra' | 'standard';

export interface DetectionResult {
  profileId: FormatId;
  name: string;
  confidence: number; // 0-100
}

export interface FormatProfile {
  id: FormatId;
  name: string;
  layerMap: Record<string, LayerRole>;
  layerPatterns: Array<{ pattern: RegExp; role: LayerRole }>;
  detectHook?: (doc: DXFDocument) => number;
  convertHook?: (piece: PatternPiece, blockEntities: DXFEntity[]) => PatternPiece;
}

export interface DXFExportOptions {
  /** DXF version: 'R12' uses POLYLINE, 'R2000' uses LWPOLYLINE + BLOCK_RECORD */
  version: 'R12' | 'R2000';
  /** Use AAMA numbered layers (true) or named layers (false) */
  aamaLayers: boolean;
}
