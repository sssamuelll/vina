import { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { EDITABLE_JOINTS } from '../../store/avatarSlice';
import type { PoseDragState } from './usePoseDrag';

interface JointGizmosProps {
  poseDrag: PoseDragState;
}

const COLOR_IDLE = new THREE.Color('#4488ff');
const COLOR_HOVER = new THREE.Color('#ffcc00');
const COLOR_SELECTED = new THREE.Color('#44ff44');

function JointSphere({
  boneName,
  poseDrag,
}: {
  boneName: string;
  poseDrag: PoseDragState;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const selectedJoint = useSelector((s: RootState) => s.avatar.selectedJoint);
  const isSelected = selectedJoint === boneName;
  const { scene } = useThree();

  // Find the bone in the scene's skeleton
  const boneRef = useRef<THREE.Bone | null>(null);

  useEffect(() => {
    // Find skeleton from SkinnedMesh
    let skeleton: THREE.Skeleton | null = null;
    scene.traverse((obj) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh && !skeleton) {
        skeleton = (obj as THREE.SkinnedMesh).skeleton;
      }
    });
    if (skeleton) {
      const bone = (skeleton as THREE.Skeleton).bones.find((b) => b.name === boneName);
      boneRef.current = bone ?? null;
    }
  }, [scene, boneName]);

  useFrame(() => {
    if (!meshRef.current || !boneRef.current) return;
    // Get world position of bone
    const pos = new THREE.Vector3();
    boneRef.current.getWorldPosition(pos);
    meshRef.current.position.copy(pos);
  });

  const color = isSelected ? COLOR_SELECTED : hovered ? COLOR_HOVER : COLOR_IDLE;
  const scale = hovered || isSelected ? 1.6 : 1;

  return (
    <mesh
      ref={meshRef}
      scale={[scale, scale, scale]}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'grab'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = ''; }}
      onPointerDown={(e) => {
        poseDrag.onGizmoPointerDown(boneName, e);
        document.body.style.cursor = 'grabbing';
      }}
    >
      <sphereGeometry args={[0.015, 12, 12]} />
      <meshBasicMaterial color={color} transparent opacity={0.7} depthTest={false} />
    </mesh>
  );
}

export default function JointGizmos({ poseDrag }: JointGizmosProps) {
  const poseEditorOpen = useSelector((s: RootState) => s.avatar.poseEditorOpen);

  // Attach window-level pointer events for drag
  useEffect(() => {
    window.addEventListener('pointermove', poseDrag.onPointerMove);
    window.addEventListener('pointerup', poseDrag.onPointerUp);
    return () => {
      window.removeEventListener('pointermove', poseDrag.onPointerMove);
      window.removeEventListener('pointerup', poseDrag.onPointerUp);
    };
  }, [poseDrag.onPointerMove, poseDrag.onPointerUp]);

  if (!poseEditorOpen) return null;

  return (
    <>
      {EDITABLE_JOINTS.map((name) => (
        <JointSphere key={name} boneName={name} poseDrag={poseDrag} />
      ))}
    </>
  );
}
