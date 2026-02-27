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
  const SO = 1.3; // Offset multiplier from surface
  const armR = 0.04 * SO;

  const anchors: AnchorDef[] = [];
  const a = (bone: string, x: number, y: number, z: number) =>
    anchors.push({ bone, offset: [x, y, z] });

  // ── HEAD & NECK ──
  a('Head', 0, 0.12, 0);
  a('Head', 0, 0.08, cr * 0.35);
  a('Head', 0, 0.08, -cr * 0.35);
  a('Head', cr * 0.4, 0.06, 0);
  a('Head', -cr * 0.4, 0.06, 0);
  a('Neck', 0, 0.04, cr * 0.3);
  a('Neck', 0, 0.04, -cr * 0.3);

  // ── SHOULDERS ──
  a('LeftShoulder', -0.05, 0.02, 0);
  a('RightShoulder', 0.05, 0.02, 0);

  // ── TORSO — 5 Rings ──
  const rFn = (t: number) => (cr + t * (hr - cr)) * SO;

  // Ring 1: Upper Chest (Spine2 Top)
  const r1 = rFn(0);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    a('Spine2', Math.sin(ang) * r1, 0.08, Math.cos(ang) * r1);
  }

  // Ring 2: Mid Chest (Spine2 Mid)
  const r2 = rFn(0.2);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    a('Spine2', Math.sin(ang) * r2, -0.02, Math.cos(ang) * r2);
  }

  // Ring 3: Waist (Spine1)
  const r3 = rFn(0.45);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    a('Spine1', Math.sin(ang) * r3, 0, Math.cos(ang) * r3);
  }

  // Ring 4: Upper Hip (Spine)
  const r4 = rFn(0.7);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    a('Spine', Math.sin(ang) * r4, 0, Math.cos(ang) * r4);
  }

  // Ring 5: Low Hip (Hips)
  const r5 = rFn(0.95);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    a('Hips', Math.sin(ang) * r5, 0, Math.cos(ang) * r5);
  }

  // ── ARMS ──
  // 4 rings along the arm: Upper, Mid-Upper, Mid-Forearm, Wrist
  for (const side of ['Left', 'Right']) {
    const s = side === 'Left' ? -1 : 1;
    const armBones = [`${side}Arm`, `${side}Arm`, `${side}ForeArm`, `${side}Hand`];
    const armYOffs = [0, -0.12, -0.1, 0];
    
    for (let bi = 0; bi < armBones.length; bi++) {
      const bone = armBones[bi];
      const y = armYOffs[bi];
      a(bone, 0, y, armR);
      a(bone, 0, y, -armR);
      a(bone, s * armR, y, 0);
      a(bone, -s * armR, y, 0);
    }
  }

  // ── LEGS ──
  // Each leg segment (Upper and Lower) gets 3 rings of 4 points
  const upLegR = hr * 0.35 * SO;
  const lowLegR = hr * 0.22 * SO;
  
  for (const side of ['Left', 'Right']) {
    const s = side === 'Left' ? -1 : 1;
    
    // UpLeg (Thigh) - 3 rings
    const upBone = `${side}UpLeg`;
    for (const y of [-0.05, -0.2, -0.35]) {
      a(upBone, 0, y, upLegR);
      a(upBone, 0, y, -upLegR);
      a(upBone, s * upLegR, y, 0);
      a(upBone, -s * upLegR, y, 0);
    }

    // Leg (Calf) - 3 rings
    const lowBone = `${side}Leg`;
    for (const y of [-0.05, -0.2, -0.35]) {
      a(lowBone, 0, y, lowLegR);
      a(lowBone, 0, y, -lowLegR);
      a(lowBone, s * lowLegR, y, 0);
      a(lowBone, -s * lowLegR, y, 0);
    }

    // Foot/Ankle
    a(`${side}Foot`, 0, 0, lowLegR * 0.7);
    a(`${side}Foot`, 0, 0, -lowLegR * 0.7);
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
