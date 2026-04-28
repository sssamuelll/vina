import { PathCommand } from '../types/types';
import { newId } from './ids';

// B11-state: thin wrappers around the canonical newId(). The `piece-` and
// `int-` prefixes are no longer present in returned IDs; verified
// non-load-bearing (no consumers parse the prefix; `pieceBuilder.test.ts:63`
// was a shape-lock test, updated to assert UUID shape post-migration).
export const uid = (): string => newId();
export const lineId = (): string => newId();
export const M = (x: number, y: number): PathCommand => ({ type: 'M', values: [x, y] });
export const L = (x: number, y: number): PathCommand => ({ type: 'L', values: [x, y] });
export const C = (cx1: number, cy1: number, cx2: number, cy2: number, x: number, y: number): PathCommand => ({ type: 'C', values: [cx1, cy1, cx2, cy2, x, y] });
export const Z = (): PathCommand => ({ type: 'Z', values: [] });
