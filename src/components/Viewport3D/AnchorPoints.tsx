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
 * Each mesh carries `userData.anchorId` (picking lands in D2).
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { buildAnchorMap, type AnchorMap } from '../../utils/cloth/arrangement/anchorMap';
import { bakeCollisionFromRender } from '../../utils/cloth/renderCollisionBake';
import { getRegisteredCollisionMesh } from '../../utils/cloth/penetrationMetric';
import type { BodyMeasurements } from '../../types/types';

const POINT_COLOR = '#4A90D9';
const POINT_RADIUS = 0.008;

interface AnchorPointsProps {
  measurements: BodyMeasurements;
  visible: boolean;
}

// Shared resources
const circleGeo = new THREE.CircleGeometry(POINT_RADIUS, 16);
const circleMat = new THREE.MeshBasicMaterial({
  color: POINT_COLOR,
  side: THREE.DoubleSide,
  depthTest: false,
  transparent: true,
  opacity: 0.92,
});

export default function AnchorPoints({ measurements, visible }: AnchorPointsProps) {
  const armAxis = useSelector((s: RootState) => s.simulation.armAxis);
  const [map, setMap] = useState<AnchorMap | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Build the map when the tool activates and when measurements / arm pose
  // change. Baking on every activation (rather than caching) also picks up
  // avatar swaps for free — bakeCollisionFromRender reads the live registry.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const mesh = (await bakeCollisionFromRender()) ?? getRegisteredCollisionMesh();
      if (cancelled) return;
      setMap(
        mesh
          ? buildAnchorMap(mesh, measurements, { left: armAxis.left, right: armAxis.right })
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, measurements, armAxis]);

  // Billboard only — positions are set once from the map.
  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group || !visible) return;
    for (const child of group.children) child.lookAt(camera.position);
  });

  if (!visible || !map) return null;

  return (
    <group ref={groupRef}>
      {map.points.map((p) => (
        <mesh
          key={p.id}
          position={p.position}
          geometry={circleGeo}
          material={circleMat}
          renderOrder={999}
          userData={{ anchorId: p.id }}
        />
      ))}
    </group>
  );
}
