/** Trim type classification */
export type TrimType = 'button' | 'zipper' | 'snap' | 'rivet' | 'buckle' | 'ring' | 'hook-eye' | 'drawstring-stop' | 'custom';

/** Placement mode — discriminated union */
export type TrimPlacement =
  | { mode: 'edge'; edgeName: string; tStart: number; tEnd: number }
  | { mode: 'edge-points'; edgeName: string; positions: number[] }
  | { mode: 'count'; quantity: number }
  | { mode: 'point'; positions: { x: number; y: number }[] };

/** A trim instance attached to a pattern piece */
export interface Trim {
  id: string;
  pieceId: string;
  type: TrimType;
  presetId?: string;
  name: string;
  description: string;
  placement: TrimPlacement;
  material: string;
  color: string;
  size: number;       // mm — diameter for buttons, width for zippers
  unitCost: number;
  active: boolean;
}

/** A trim preset from the built-in library */
export interface TrimPreset {
  id: string;
  name: string;
  nameEs: string;
  type: TrimType;
  material: string;
  color: string;
  size: number;
  unitCost: number;
  tags: string[];
}

/** Default values for new trims — sourced from utils/defaults.ts */
export { DEFAULT_TRIM_TYPE, DEFAULT_TRIM_MATERIAL, DEFAULT_TRIM_COLOR, DEFAULT_TRIM_SIZE, DEFAULT_TRIM_UNIT_COST } from '../utils/defaults';

/** Convenience aggregate for all trim defaults */
export const TRIM_DEFAULTS: Omit<Trim, 'id' | 'pieceId' | 'placement'> = {
  type: 'button',
  name: 'Trim',
  description: '',
  material: 'plastic',
  color: '#333333',
  size: 15,
  unitCost: 0,
  active: true,
};
