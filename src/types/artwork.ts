import type { Point2D } from './types';

/** Artwork placed on a pattern piece */
export interface PieceArtwork {
  id: string;
  imageId: string;        // blob ref in IndexedDB
  filename: string;
  position: Point2D;      // mm, relative to piece center
  width: number;          // mm (display size)
  height: number;         // mm
  rotation: number;       // degrees
  opacity: number;        // 0-1
}
