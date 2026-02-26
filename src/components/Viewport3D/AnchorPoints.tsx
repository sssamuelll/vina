/**
 * AnchorPoints — CLO3D-style arrangement points, bone-attached.
 *
 * Each point follows the avatar's skeleton in real-time via useFrame.
 * Points are rendered as camera-facing circles (billboard via lookAt).
 */

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { deriveDimensions } from '../../utils/cloth/garmentPlacement';
import type { BodyMeasurements } from '../../types/types';

const POINT_COLOR = '#4A90D9';
const POINT_RADIUS = 0.008;

interface AnchorDef {
  bone: string;
  offset: [number, number, number];
}

interface AnchorPointsProps {
  measurements: BodyMeasurements;
  visible: boolean;
}

function computeBoneAnchors(m: BodyMeasurements): AnchorDef[] {
  const d = deriveDimensions(m);
  const cr = d.chestRadius;
  const hr = d.hipRadius;
  const SO = 1.25;
  const armR = 0.035 * SO;

  const anchors: AnchorDef[] = [];
  const a = (bone: string, x: number, y: number, z: number) =>
    anchors.push({ bone, offset: [x, y, z] });

  // ── HEAD ──
  a('Head', 0, 0.12, 0);
  a('Head', 0, 0.10, cr * 0.3);
  a('Head', cr * 0.35, 0.10, 0);
  a('Head', -cr * 0.38 * SO, 0.05, 0);
  a('Head', cr * 0.38 * SO, 0.05, 0);
  a('Head', 0, 0.05, cr * 0.35);
  a('Neck', 0, 0.02, -cr * 0.35 * SO);

  // ── SHOULDERS ──
  a('LeftShoulder', -0.06, 0, 0);
  a('RightShoulder', 0.06, 0, 0);

  // ── TORSO — 5 rings ──
  const rFn = (t: number) => (cr + t * (hr - cr)) * SO;

  // Ring 1 (upper chest) → Spine2
  const r1 = rFn(0);
  a('Spine2', 0, 0.04, r1);  a('Spine2', -r1*0.45, 0.04, r1*0.88);  a('Spine2', r1*0.45, 0.04, r1*0.88);
  a('Spine2', 0, 0.04, -r1); a('Spine2', -r1*0.45, 0.04, -r1*0.88); a('Spine2', r1*0.45, 0.04, -r1*0.88);
  a('Spine2', -r1*0.95, 0.04, 0); a('Spine2', r1*0.95, 0.04, 0);

  // Ring 2 (bust) → Spine2 lower
  const r2 = rFn(0.18);
  a('Spine2', 0, -0.06, r2);  a('Spine2', -r2*0.45, -0.06, r2*0.88);  a('Spine2', r2*0.45, -0.06, r2*0.88);
  a('Spine2', 0, -0.06, -r2); a('Spine2', -r2*0.45, -0.06, -r2*0.88); a('Spine2', r2*0.45, -0.06, -r2*0.88);
  a('Spine2', -r2*0.95, -0.06, 0); a('Spine2', r2*0.95, -0.06, 0);

  // Ring 3 (central) → Spine1 — 2 lateral per side
  const r3 = rFn(0.4);
  a('Spine1', 0, 0, r3);  a('Spine1', -r3*0.45, 0, r3*0.88);  a('Spine1', r3*0.45, 0, r3*0.88);
  a('Spine1', 0, 0, -r3); a('Spine1', -r3*0.45, 0, -r3*0.88); a('Spine1', r3*0.45, 0, -r3*0.88);
  a('Spine1', -r3*0.95, 0.015, 0); a('Spine1', -r3*0.95, -0.015, 0);
  a('Spine1', r3*0.95, 0.015, 0);  a('Spine1', r3*0.95, -0.015, 0);

  // Ring 4 (below central) → Spine — 1 lateral per side
  const r4 = rFn(0.65);
  a('Spine', 0, 0.02, r4);  a('Spine', -r4*0.45, 0.02, r4*0.88);  a('Spine', r4*0.45, 0.02, r4*0.88);
  a('Spine', 0, 0.02, -r4); a('Spine', -r4*0.45, 0.02, -r4*0.88); a('Spine', r4*0.45, 0.02, -r4*0.88);
  a('Spine', -r4*0.95, 0.02, 0); a('Spine', r4*0.95, 0.02, 0);

  // Ring 5 (low hip) → Hips
  const r5 = rFn(0.9);
  a('Hips', 0, 0.02, r5);  a('Hips', -r5*0.45, 0.02, r5*0.88);  a('Hips', r5*0.45, 0.02, r5*0.88);
  a('Hips', 0, 0.02, -r5); a('Hips', -r5*0.45, 0.02, -r5*0.88); a('Hips', r5*0.45, 0.02, -r5*0.88);
  a('Hips', -r5*0.95, 0.02, 0); a('Hips', r5*0.95, 0.02, 0);

  // ── ARMS — 4 rings × 4 points ──
  for (const bones of [
    ['LeftArm', 'LeftForeArm', 'LeftForeArm', 'LeftHand'],
    ['RightArm', 'RightForeArm', 'RightForeArm', 'RightHand'],
  ]) {
    for (let bi = 0; bi < bones.length; bi++) {
      const yOff = bi === 2 ? -0.1 : 0; // mid-forearm offset
      a(bones[bi], 0, armR + yOff, 0);
      a(bones[bi], 0, -armR + yOff, 0);
      a(bones[bi], 0, yOff, armR);
      a(bones[bi], 0, yOff, -armR);
    }
  }

  // ── CROTCH RING ──
  const crotchR = hr * 0.4 * SO;
  for (const side of ['LeftUpLeg', 'RightUpLeg'] as const) {
    a(side, 0, 0.02, crotchR);
    a(side, -crotchR*0.5, 0.02, crotchR*0.85);
    a(side, crotchR*0.5, 0.02, crotchR*0.85);
    a(side, 0, 0.02, -crotchR);
    a(side, -crotchR*0.5, 0.02, -crotchR*0.85);
    a(side, crotchR*0.5, 0.02, -crotchR*0.85);
    const lSign = side.startsWith('Left') ? -1 : 1;
    a(side, lSign * crotchR, 0.04, 0);
  }

  // ── LEGS — 3 rings × 4 points ──
  const legRings = [
    { boneSuffix: 'UpLeg', r: hr * 0.32 * SO, yOff: -0.15 },
    { boneSuffix: 'Leg', r: hr * 0.22 * SO, yOff: 0.0 },
    { boneSuffix: 'Leg', r: hr * 0.18 * SO, yOff: -0.15 },
  ];
  for (const prefix of ['Left', 'Right']) {
    for (const ring of legRings) {
      const bone = `${prefix}${ring.boneSuffix}`;
      a(bone, 0, ring.yOff, ring.r);
      a(bone, 0, ring.yOff, -ring.r);
      a(bone, ring.r, ring.yOff, 0);
      a(bone, -ring.r, ring.yOff, 0);
    }
  }

  // ── ANKLES ──
  const ankR = hr * 0.14 * SO;
  for (const prefix of ['Left', 'Right']) {
    a(`${prefix}Leg`, 0, -0.2, ankR);
    a(`${prefix}Leg`, 0, -0.2, -ankR);
  }

  return anchors;
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

// Reusable temp objects
const _worldPos = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _quat = new THREE.Quaternion();

export default function AnchorPoints({ measurements, visible }: AnchorPointsProps) {
  const anchorDefs = useMemo(() => computeBoneAnchors(measurements), [measurements]);
  const { scene, camera } = useThree();
  const bonesRef = useRef<Map<string, THREE.Bone>>(new Map());
  const groupRef = useRef<THREE.Group>(null);

  // Each frame: find bones if needed, position all meshes at bone+offset, face camera
  useFrame(() => {
    const group = groupRef.current;
    if (!group || !visible) return;

    // Lazy-find bones (avatar loads async)
    if (bonesRef.current.size === 0) {
      const bones = new Map<string, THREE.Bone>();
      scene.traverse((obj) => {
        if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
          const skeleton = (obj as THREE.SkinnedMesh).skeleton;
          if (skeleton) {
            for (const bone of skeleton.bones) {
              if (!bones.has(bone.name)) bones.set(bone.name, bone);
            }
          }
        }
      });
      if (bones.size > 0) bonesRef.current = bones;
      else return; // avatar not loaded yet
    }

    const bones = bonesRef.current;

    for (let i = 0; i < group.children.length && i < anchorDefs.length; i++) {
      const mesh = group.children[i] as THREE.Mesh;
      const def = anchorDefs[i];
      const bone = bones.get(def.bone);

      if (!bone) {
        mesh.visible = false;
        continue;
      }

      mesh.visible = true;
      bone.getWorldPosition(_worldPos);
      bone.getWorldQuaternion(_quat);
      _offset.set(def.offset[0], def.offset[1], def.offset[2]);
      _offset.applyQuaternion(_quat);
      _worldPos.add(_offset);
      mesh.position.copy(_worldPos);

      // Billboard: face camera
      mesh.lookAt(camera.position);
    }
  });

  if (!visible) return null;

  return (
    <group ref={groupRef}>
      {anchorDefs.map((_, i) => (
        <mesh key={i} geometry={circleGeo} material={circleMat} renderOrder={999} />
      ))}
    </group>
  );
}
