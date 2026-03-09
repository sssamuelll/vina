import { useRef, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { setIKTarget, IK_CHAINS, IK_END_EFFECTOR_BONES } from '../../store/avatarSlice';

interface EndEffectorGizmoProps {
  chainName: string;
  endEffectorBoneName: string;
  setOrbitEnabled: (enabled: boolean) => void;
}

function EndEffectorGizmo({ chainName, endEffectorBoneName, setOrbitEnabled }: EndEffectorGizmoProps) {
  const dispatch = useDispatch();
  const helperRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const transformRef = useRef<React.ComponentRef<typeof TransformControls>>(null);
  const { scene } = useThree();
  const boneRef = useRef<THREE.Bone | null>(null);
  const initialized = useRef(false);

  // Find the end-effector bone
  useEffect(() => {
    let skeleton: THREE.Skeleton | null = null;
    scene.traverse((obj) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh && !skeleton) {
        skeleton = (obj as THREE.SkinnedMesh).skeleton;
      }
    });
    if (skeleton) {
      const bone = (skeleton as THREE.Skeleton).bones.find(b => b.name === endEffectorBoneName);
      boneRef.current = bone ?? null;
    }
  }, [scene, endEffectorBoneName]);

  // Initialize helper position at bone's world position
  useFrame(() => {
    if (!boneRef.current) return;
    if (!initialized.current) {
      const worldPos = new THREE.Vector3();
      boneRef.current.getWorldPosition(worldPos);
      helperRef.current.position.copy(worldPos);
      initialized.current = true;
    }
  });

  // Handle drag events
  const handleObjectChange = useCallback(() => {
    const pos = helperRef.current.position;
    dispatch(setIKTarget({
      name: chainName,
      position: { x: pos.x, y: pos.y, z: pos.z },
    }));
  }, [dispatch, chainName]);

  // Toggle orbit controls during drag
  useEffect(() => {
    const controls = transformRef.current;
    if (!controls) return;

    const onDraggingChanged = (event: { value: boolean }) => {
      setOrbitEnabled(!event.value);
    };

    // TransformControls emits 'dragging-changed' event — cast needed because
    // Three.js Object3DEventMap doesn't include TransformControls-specific events.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctrl = controls as any;
    ctrl.addEventListener('dragging-changed', onDraggingChanged);
    return () => {
      ctrl.removeEventListener('dragging-changed', onDraggingChanged);
    };
  }, [setOrbitEnabled]);

  return (
    <>
      <primitive object={helperRef.current} />
      <TransformControls
        ref={transformRef}
        object={helperRef.current}
        mode="translate"
        size={0.5}
        onObjectChange={handleObjectChange}
      />
    </>
  );
}

export default function IKEndEffectorGizmos({
  setOrbitEnabled,
}: {
  setOrbitEnabled: (enabled: boolean) => void;
}) {
  const poseEditorOpen = useSelector((s: RootState) => s.avatar.poseEditorOpen);
  const ikEnabled = useSelector((s: RootState) => s.avatar.pose.ikEnabled);

  if (!poseEditorOpen || !ikEnabled) return null;

  return (
    <>
      {IK_CHAINS.map(chain => {
        const endEffectorBone = IK_END_EFFECTOR_BONES[chain.name];
        if (!endEffectorBone) return null;
        return (
          <EndEffectorGizmo
            key={chain.name}
            chainName={chain.name}
            endEffectorBoneName={endEffectorBone}
            setOrbitEnabled={setOrbitEnabled}
          />
        );
      })}
    </>
  );
}
