/**
 * SeamRenderer3D — draws each project seam as a 3D connection line between the
 * midpoints of its two sewn edges, in ARRANGE mode (before simulation). This
 * is the CLO3D-style "see the sewing before you drape" — the perception layer
 * that lets a user verify what is connected (and what is missing) before
 * hitting Simulate.
 *
 * Coordinate space: each edge midpoint is computed in piece-local space
 * (edgeMidpointLocal3D) and transformed to world space using the SAME
 * position + rotation (pieceHighlightRotation) + flip(scale z) chain that
 * Sew3DTool / DraggablePiece apply — both pull from edgePicker so the line
 * endpoints land exactly on the edges they represent.
 *
 * Lifecycle: geometry + material are built in a memo keyed on the seams and
 * every piece placement, and disposed on change/unmount (RFC C1).
 *
 * @module Viewport3D/SeamRenderer3D
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { PatternPiece, Seam } from '../../types/types';
import type { PlacementResult } from '../../utils/cloth/garmentPlacement';
import { edgeMidpointLocal3D, pieceHighlightRotation } from '../../utils/3d/edgePicker';
import { useDisposable } from './hooks/useDisposable';

interface SeamRenderer3DProps {
  seams: Seam[];
  pieces: PatternPiece[];
  placements: PlacementResult[];
  arrangementOverrides: Record<string, [number, number, number]>;
  flippedPieceIds: string[];
}

const SEAM_COLOR = '#6366f1'; // accent; provenance-based coloring arrives in a later phase

function edgeWorldMidpoint(
  piece: PatternPiece,
  edgeName: string,
  pos: [number, number, number],
  rot: [number, number, number] | undefined,
  flipped: boolean,
): THREE.Vector3 | null {
  const edge = piece.edges?.find((e) => e.name === edgeName);
  if (!edge) return null;
  const local = edgeMidpointLocal3D(piece.outline, edge);
  if (!local) return null;
  // T * R * S applied to the local midpoint, matching the piece's group transform.
  const v = new THREE.Vector3(local.x, 0.003, local.z * (flipped ? -1 : 1));
  v.applyEuler(new THREE.Euler(...pieceHighlightRotation(piece.rotation, rot)));
  v.add(new THREE.Vector3(pos[0], pos[1], pos[2]));
  return v;
}

export default function SeamRenderer3D({
  seams,
  pieces,
  placements,
  arrangementOverrides,
  flippedPieceIds,
}: SeamRenderer3DProps) {
  const seamLines = useMemo(() => {
    const placementOf = (pieceId: string) => {
      const idx = pieces.findIndex((p) => p.id === pieceId);
      if (idx === -1) return null;
      const pos = arrangementOverrides[pieceId]
        || placements[idx]?.position
        || ([0, 0, 0] as [number, number, number]);
      return {
        piece: pieces[idx],
        pos,
        rot: placements[idx]?.rotation,
        flipped: flippedPieceIds.includes(pieceId),
      };
    };

    const objs: THREE.Line[] = [];
    for (const seam of seams) {
      if (seam.active === false) continue;
      const a = placementOf(seam.pieceA.pieceId);
      const b = placementOf(seam.pieceB.pieceId);
      if (!a || !b) continue;
      const ma = edgeWorldMidpoint(a.piece, seam.pieceA.edgeName, a.pos, a.rot, a.flipped);
      const mb = edgeWorldMidpoint(b.piece, seam.pieceB.edgeName, b.pos, b.rot, b.flipped);
      if (!ma || !mb) continue;

      const geo = new THREE.BufferGeometry().setFromPoints([ma, mb]);
      const mat = new THREE.LineDashedMaterial({
        color: SEAM_COLOR,
        dashSize: 0.018,
        gapSize: 0.012,
        linewidth: 1,
        transparent: true,
        opacity: 0.9,
      });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances(); // required for dashes
      line.renderOrder = 999; // draw over the pieces
      objs.push(line);
    }
    // Wrap as a single disposable so useDisposable (RFC C1) can clean up all
    // line geometries + materials on change/unmount.
    return {
      lines: objs,
      dispose() {
        for (const line of objs) {
          line.geometry.dispose();
          (line.material as THREE.Material).dispose();
        }
      },
    };
  }, [seams, pieces, placements, arrangementOverrides, flippedPieceIds]);

  useDisposable(seamLines);

  return (
    <group>
      {seamLines.lines.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </group>
  );
}
