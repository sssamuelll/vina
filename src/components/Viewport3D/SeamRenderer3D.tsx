/**
 * SeamRenderer3D — draws each project seam as a CLO3D-style FAN OF THREADS
 * connecting corresponding points of its two sewn edges, in ARRANGE mode
 * (before simulation). This is the "see the sewing before you drape"
 * perception layer: the fan shows WHICH sub-range is sewn (tStart/tEnd) and
 * in WHICH direction (pieceB.reversed — crossed fan when the pairing flips),
 * so a user can verify what is connected before hitting Simulate.
 *
 * Coordinate space: edge points are sampled in piece-local space at the
 * seam's arc-length parameters (seamThreads helpers) and transformed to
 * world space using the SAME position + rotation (pieceHighlightRotation) +
 * flip(scale z) chain that Sew3DTool / DraggablePiece apply — both pull from
 * edgePicker so the thread endpoints land exactly on the edges they
 * represent.
 *
 * Rendering: ALL threads of ALL seams are merged into ONE LineSegments with
 * a vertex-colored LineBasicMaterial (one draw call — dictamen Halberg).
 * WebGPURenderer rejects drei's LineMaterial/fat-lines (see DraggablePiece
 * header), so v1 is hairlines; ribbons of instanced quads are the plan B if
 * legibility demands it.
 *
 * Lifecycle: geometry + material are built in a memo keyed on the seams and
 * every piece placement, and disposed on change/unmount (RFC C1).
 *
 * @module Viewport3D/SeamRenderer3D
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { seamThreadColor } from '../../utils/colors/seamPalette';
import type { PatternPiece, Seam } from '../../types/types';
import type { PlacementResult } from '../../utils/cloth/garmentPlacement';
import { pieceHighlightRotation } from '../../utils/3d/edgePicker';
import {
  edgeLocalPolyline,
  pairSeamRanges,
  polylineArcLength,
  sampleAtParams,
  threadCount,
} from './seamThreads';
import { useDisposable } from './hooks/useDisposable';

interface SeamRenderer3DProps {
  seams: Seam[];
  pieces: PatternPiece[];
  placements: PlacementResult[];
  flippedPieceIds: string[];
}

// Provenance coloring: AI-proposed seams are amber ("review me"), human-sewn
// seams are green ("confirmed"). Undefined provenance (legacy seams) is treated
// as human. Amber is deliberately calm, not a red alarm — an AI seam is a
// suggestion awaiting the human's confirmation, not an error.
const SEAM_COLOR_AI = '#f59e0b';    // amber
const SEAM_COLOR_HUMAN = '#3fb950'; // green

// eslint-disable-next-line react-refresh/only-export-components -- helper puro pre-existente (pineado por seamColor.test.ts); moverlo es churn de imports sin ganancia de fast-refresh real
export function seamColor(createdBy: Seam['createdBy']): string {
  return createdBy === 'ai' ? SEAM_COLOR_AI : SEAM_COLOR_HUMAN;
}

/**
 * World-space points of an edge sampled at arc-length parameters `ts`.
 * Generalization of the old `edgeWorldMidpoint` — SAME T * R * S chain
 * applied per sample, matching the piece's group transform.
 */
function edgeWorldPoints(
  piece: PatternPiece,
  edgeName: string,
  pos: [number, number, number],
  rot: [number, number, number] | undefined,
  flipped: boolean,
  ts: number[],
): THREE.Vector3[] | null {
  const edge = piece.edges?.find((e) => e.name === edgeName);
  if (!edge) return null;
  const poly = edgeLocalPolyline(piece.outline, edge);
  if (!poly) return null;
  const euler = new THREE.Euler(...pieceHighlightRotation(piece.rotation, rot));
  const offset = new THREE.Vector3(pos[0], pos[1], pos[2]);
  return sampleAtParams(poly, ts).map((local) =>
    new THREE.Vector3(local.x, 0.003, local.z * (flipped ? -1 : 1))
      .applyEuler(euler)
      .add(offset),
  );
}

export default function SeamRenderer3D({
  seams,
  pieces,
  placements,
  flippedPieceIds,
}: SeamRenderer3DProps) {
  const seamThreads = useMemo(() => {
    const placementOf = (pieceId: string) => {
      const idx = pieces.findIndex((p) => p.id === pieceId);
      if (idx === -1) return null;
      const pos = placements[idx]?.position
        || ([0, 0, 0] as [number, number, number]); // placements ya resueltos (única autoridad)
      return {
        piece: pieces[idx],
        pos,
        rot: placements[idx]?.rotation,
        flipped: flippedPieceIds.includes(pieceId),
      };
    };

    const positions: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();
    for (const seam of seams) {
      if (seam.active === false) continue;
      const a = placementOf(seam.pieceA.pieceId);
      const b = placementOf(seam.pieceB.pieceId);
      if (!a || !b) continue;

      // K adaptivo: one thread per ~2cm of A's SEWN arc (A is the direction
      // reference), clamped [4, 40].
      const edgeA = a.piece.edges?.find((e) => e.name === seam.pieceA.edgeName);
      const polyA = edgeA ? edgeLocalPolyline(a.piece.outline, edgeA) : null;
      if (!polyA) continue;
      const sewnArc = polylineArcLength(polyA)
        * Math.abs((seam.pieceA.tEnd ?? 1) - (seam.pieceA.tStart ?? 0));
      const pairs = pairSeamRanges(seam.pieceA, seam.pieceB, threadCount(sewnArc));

      const ptsA = edgeWorldPoints(
        a.piece, seam.pieceA.edgeName, a.pos, a.rot, a.flipped, pairs.map((p) => p.tA),
      );
      const ptsB = edgeWorldPoints(
        b.piece, seam.pieceB.edgeName, b.pos, b.rot, b.flipped, pairs.map((p) => p.tB),
      );
      if (!ptsA || !ptsB) continue;

      // Identidad por-seam (paleta hash-estable) + proveniencia como
      // saturación (IA = hue pálido "revísame", humano = pleno). El viejo
      // ámbar/verde global (seamColor) queda para superficies no-hilo.
      color.set(seamThreadColor(seam.id, seam.createdBy));
      for (let i = 0; i < ptsA.length; i++) {
        positions.push(ptsA[i].x, ptsA[i].y, ptsA[i].z, ptsB[i].x, ptsB[i].y, ptsB[i].z);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    }

    // ONE merged LineSegments = one draw call for all K×N threads.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    });
    const segments = new THREE.LineSegments(geometry, material);
    segments.renderOrder = 999; // draw over the pieces
    return {
      segments,
      dispose() {
        geometry.dispose();
        material.dispose();
      },
    };
  }, [seams, pieces, placements, flippedPieceIds]);

  useDisposable(seamThreads);

  return <primitive object={seamThreads.segments} />;
}
