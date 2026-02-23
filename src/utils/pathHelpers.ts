import { PathCommand } from '../types/types';

export const uid = () => `piece-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
export const lineId = () => `int-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`;
export const M = (x: number, y: number): PathCommand => ({ type: 'M', values: [x, y] });
export const L = (x: number, y: number): PathCommand => ({ type: 'L', values: [x, y] });
export const C = (cx1: number, cy1: number, cx2: number, cy2: number, x: number, y: number): PathCommand => ({ type: 'C', values: [cx1, cy1, cx2, cy2, x, y] });
export const Z = (): PathCommand => ({ type: 'Z', values: [] });
