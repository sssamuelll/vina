/**
 * FloorGrid — geometry-based infinite-look grid for the 3D viewport floor.
 *
 * Uses LineSegments (no ShaderMaterial) so it works with the WebGPU/NodeMaterial
 * renderer. Fine cells (10cm) in light gray, major sections (1m) darker.
 * Fades at the edges via vertex alpha for depth perception.
 */
import { useMemo } from 'react';
import * as THREE from 'three';

interface FloorGridProps {
  /** Total grid extent in meters (default 10 = ±5m) */
  size?: number;
  /** Fine cell size in meters (default 0.1 = 10cm) */
  cellSize?: number;
  /** Major section every N cells (default 10 = 1m) */
  sectionEvery?: number;
  /** Y position (default 0) */
  y?: number;
}

export default function FloorGrid({
  size = 10,
  cellSize = 0.1,
  sectionEvery = 10,
  y = 0,
}: FloorGridProps) {
  const { fineGeo, sectionGeo } = useMemo(() => {
    const half = size / 2;
    const count = Math.round(size / cellSize);

    const fineVerts: number[] = [];
    const fineAlphas: number[] = [];
    const sectionVerts: number[] = [];
    const sectionAlphas: number[] = [];

    for (let i = 0; i <= count; i++) {
      const pos = -half + i * cellSize;
      const isSection = i % sectionEvery === 0;

      // Fade factor: 1 at center, 0 at edge
      const edgeFrac = Math.abs(pos) / half;
      const alpha = 1 - edgeFrac * edgeFrac; // quadratic falloff

      const target = isSection ? sectionVerts : fineVerts;
      const alphaTarget = isSection ? sectionAlphas : fineAlphas;

      // Line along Z (at this X)
      target.push(pos, 0, -half, pos, 0, half);
      alphaTarget.push(alpha * 0.0, alpha, alpha, alpha * 0.0);

      // Line along X (at this Z)
      target.push(-half, 0, pos, half, 0, pos);
      alphaTarget.push(alpha * 0.0, alpha, alpha, alpha * 0.0);
    }

    const buildGeo = (verts: number[], alphas: number[]) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas, 1));
      return geo;
    };

    return {
      fineGeo: buildGeo(fineVerts, fineAlphas),
      sectionGeo: buildGeo(sectionVerts, sectionAlphas),
    };
  }, [size, cellSize, sectionEvery]);

  return (
    <group position={[0, y, 0]}>
      {/* Fine grid lines */}
      <lineSegments geometry={fineGeo}>
        <lineBasicMaterial color="#d4d4d4" transparent opacity={0.4} />
      </lineSegments>
      {/* Major section lines */}
      <lineSegments geometry={sectionGeo}>
        <lineBasicMaterial color="#b0b0b0" transparent opacity={0.6} />
      </lineSegments>
    </group>
  );
}
