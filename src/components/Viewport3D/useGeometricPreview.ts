import { useEffect, useRef } from 'react';
import type { PatternPiece } from '../../types/types';
import { classifyEdit } from '../../utils/cloth/editClassifier';

interface GeometricPreviewOptions {
  pieces: PatternPiece[];
  simulationState: string;
  positionsRef: React.MutableRefObject<Float32Array | null>;
  onPreviewFrame: ((positions: Float32Array) => void) | null;
}

/**
 * Applies instant geometric vertex displacement when pattern dimensions change.
 * Provides immediate visual feedback before debounced warm-start re-simulation.
 *
 * For v1, scales vertex positions proportionally based on the bounding box
 * change of each piece's outline.
 */
export function useGeometricPreview({
  pieces,
  simulationState,
  positionsRef,
  onPreviewFrame,
}: GeometricPreviewOptions): void {
  const prevPiecesRef = useRef<PatternPiece[]>([]);

  useEffect(() => {
    const prev = prevPiecesRef.current;
    prevPiecesRef.current = pieces;

    if (prev.length === 0) return;
    if (simulationState !== 'running' && simulationState !== 'paused') return;
    if (!positionsRef.current || !onPreviewFrame) return;

    const editType = classifyEdit(prev, pieces);
    if (editType !== 'dimension') return;

    const positions = positionsRef.current;
    const preview = new Float32Array(positions);

    // For each piece, compute 2D bounding box ratio and scale vertices
    const numPieces = pieces.length;
    if (numPieces === 0) return;

    const vertsPerPiece = Math.floor(positions.length / 3 / numPieces);
    let vertexOffset = 0;

    for (let pi = 0; pi < numPieces; pi++) {
      const prevBB = outlineBounds(prev[pi].outline);
      const nextBB = outlineBounds(pieces[pi].outline);

      if (!prevBB || !nextBB) {
        vertexOffset += vertsPerPiece;
        continue;
      }

      const scaleX = prevBB.width > 0 ? nextBB.width / prevBB.width : 1;
      const scaleZ = prevBB.height > 0 ? nextBB.height / prevBB.height : 1;

      // Compute center of mass for this piece's vertices
      let cx = 0, cz = 0;
      for (let v = 0; v < vertsPerPiece; v++) {
        const idx = (vertexOffset + v) * 3;
        cx += positions[idx];
        cz += positions[idx + 2];
      }
      cx /= vertsPerPiece;
      cz /= vertsPerPiece;

      // Scale relative to center of mass
      for (let v = 0; v < vertsPerPiece; v++) {
        const idx = (vertexOffset + v) * 3;
        preview[idx] = cx + (positions[idx] - cx) * scaleX;
        // y stays unchanged (gravity axis)
        preview[idx + 2] = cz + (positions[idx + 2] - cz) * scaleZ;
      }
      vertexOffset += vertsPerPiece;
    }

    onPreviewFrame(preview);
  }, [pieces, simulationState, positionsRef, onPreviewFrame]);
}

interface BoundingBox {
  cx: number; cy: number;
  width: number; height: number;
}

function outlineBounds(outline: Array<{ type: string; values: number[] }>): BoundingBox | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasPoints = false;

  for (const cmd of outline) {
    const vals = cmd.values;
    for (let i = 0; i < vals.length - 1; i += 2) {
      const x = vals[i], y = vals[i + 1];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      hasPoints = true;
    }
  }

  if (!hasPoints) return null;
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}
