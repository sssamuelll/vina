/**
 * AnchorPoints — arrangement anchor points on the BAKED body surface.
 *
 * Positions come from buildAnchorMap over the render-mesh bake
 * (bakeCollisionFromRender, fallback getRegisteredCollisionMesh) — never from
 * analytic bone offsets. The old bone-attached path (computeBoneAnchors +
 * `SO = 1.3`) was "the third definition of the body" (consejo 2026-07-03 §3)
 * and is dead: no baked surface → no points, no fallback.
 *
 * Points are camera-facing circles (billboard via lookAt in useFrame); their
 * POSITIONS are static — the bake is posed, nothing recomputes per frame.
 *
 * D2 (picking): each point is clickable — `onAnchorClick(anchorId)` is the
 * human's half of the placement contract (click pieza → click anchor). With
 * `activeNamespace` set (exactly one piece selected upstream), points of that
 * namespace show the accent material and the rest dim; every point stays
 * clickable so a cross-namespace click can explain itself via toast. The map
 * built here is also published to the module registry (registerAnchorMap) so
 * the click handler and the copilot tool read the SAME addresses being drawn.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
  buildAnchorMap,
  registerAnchorMap,
  type AnchorMap,
} from '../../utils/cloth/arrangement/anchorMap';
import { bakeCollisionFromRender } from '../../utils/cloth/renderCollisionBake';
import { getRegisteredCollisionMesh } from '../../utils/cloth/penetrationMetric';
import type { BodyRegion } from '../../utils/cloth/garmentPlacement';
import type { BodyMeasurements } from '../../types/types';

const POINT_COLOR = '#4A90D9';
const ACCENT_COLOR = '#66B8FF'; // active-namespace targets (same blue family, brighter)
const HOVER_COLOR = '#9AD1FF';
const POINT_RADIUS = 0.008;
const HOVER_SCALE = 1.4;
const DIM_OPACITY = 0.22; // other-namespace points recede but stay clickable

interface AnchorPointsProps {
  measurements: BodyMeasurements;
  visible: boolean;
  /** Click on a point → the anchor's postal address (placement contract, D2). */
  onAnchorClick?: (anchorId: string) => void;
  /** Namespace of the selected piece — its points accent, the rest dim. */
  activeNamespace?: BodyRegion | null;
}

// Shared resources — one geometry, one material per visual state (points swap
// between them instead of owning materials).
const circleGeo = new THREE.CircleGeometry(POINT_RADIUS, 16);
const makeMat = (color: string, opacity: number) =>
  new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    depthTest: false,
    transparent: true,
    opacity,
  });
const neutralMat = makeMat(POINT_COLOR, 0.92);
const accentMat = makeMat(ACCENT_COLOR, 1);
const dimMat = makeMat(POINT_COLOR, DIM_OPACITY);
const hoverMat = makeMat(HOVER_COLOR, 1);

export default function AnchorPoints({
  measurements,
  visible,
  onAnchorClick,
  activeNamespace = null,
}: AnchorPointsProps) {
  const armAxis = useSelector((s: RootState) => s.simulation.armAxis);
  const [map, setMap] = useState<AnchorMap | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);

  // Build the map when the tool activates and when measurements / arm pose
  // change. Baking on every activation (rather than caching) also picks up
  // avatar swaps for free — bakeCollisionFromRender reads the live registry.
  // The built map is registered so click handling + copilot tools resolve
  // against EXACTLY the points on screen; cleanup unregisters (consumers
  // rebuild on-demand per the registry contract in anchorMap.ts).
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const mesh = (await bakeCollisionFromRender()) ?? getRegisteredCollisionMesh();
      if (cancelled) return;
      const built = mesh
        ? buildAnchorMap(mesh, measurements, { left: armAxis.left, right: armAxis.right })
        : null;
      setMap(built);
      registerAnchorMap(built);
    })();
    return () => {
      cancelled = true;
      registerAnchorMap(null);
    };
  }, [visible, measurements, armAxis]);

  // Never leave a stale pointer cursor behind (tool switch mid-hover).
  useEffect(() => () => {
    gl.domElement.style.cursor = '';
  }, [gl]);

  // Billboard only — positions are set once from the map.
  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group || !visible) return;
    for (const child of group.children) child.lookAt(camera.position);
  });

  if (!visible || !map) return null;

  return (
    <group ref={groupRef}>
      {map.points.map((p) => {
        const hovered = hoveredId === p.id;
        const material = hovered
          ? hoverMat
          : activeNamespace === null
            ? neutralMat
            : p.region === activeNamespace
              ? accentMat
              : dimMat;
        return (
          <mesh
            key={p.id}
            position={p.position}
            geometry={circleGeo}
            material={material}
            scale={hovered ? HOVER_SCALE : 1}
            renderOrder={999}
            userData={{ anchorId: p.id }}
            onClick={(e) => {
              e.stopPropagation();
              onAnchorClick?.(p.id);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredId(p.id);
              gl.domElement.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              setHoveredId((h) => (h === p.id ? null : h));
              gl.domElement.style.cursor = '';
            }}
          />
        );
      })}
    </group>
  );
}
