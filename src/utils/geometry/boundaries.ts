/**
 * Boundary helpers for crossing the m ↔ mm gap at the importMesh API.
 *
 * importMesh (src/utils/import/meshImporter.ts) expects target heights in
 * mm and returns scenes in mm. Three.js viewport convention is metres.
 * These helpers encapsulate the conversion at the boundary so callers
 * speak in their own units.
 *
 * Closes the 4 // C6-impl: markers in AvatarModel.tsx and avatarCollisionMesh.ts
 * (drift-fase2-c5-coord-systems-transforms.md, Cat C).
 */

import type { Object3D } from 'three';
import { mToMm } from './units';

/** Convert metres → millimetres for the importMesh API (e.g., targetHeightMm). */
export function metresToImporter(metres: number): number {
  return mToMm(metres);
}

/**
 * Apply mm → m scale to a Three.js scene returned by importMesh.
 *
 * importMesh emits scenes in mm coordinate space. This mutates the scene's
 * top-level scale so the rendered tree matches Three.js metre convention.
 * Caller should follow with `scene.updateMatrixWorld(true)` before reads.
 */
export function importerToMetres(scene: Object3D): void {
  scene.scale.multiplyScalar(0.001);
}
