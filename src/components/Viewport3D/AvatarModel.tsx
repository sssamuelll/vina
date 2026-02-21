import { useEffect, useRef } from "react";
import { useLoader, useFrame } from "@react-three/fiber";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { computeMorphWeights, MORPH_BONE_MAP, type MorphConfig } from '../../utils/avatar/morphTargets';

interface AvatarModelProps {
  url: string;
  autoScale?: boolean;
  /** Target height in meters (default: 1.80) */
  height?: number;
}

const DEG2RAD = Math.PI / 180;

export default function AvatarModel({ url, autoScale = true, height = 1.80 }: AvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, url);
  const boneMap = useRef<Map<string, THREE.Bone>>(new Map());
  const bindPoses = useRef<Map<string, THREE.Quaternion>>(new Map());

  const joints = useSelector((s: RootState) => s.avatar.pose.joints);
  const measurements = useSelector((s: RootState) => s.project.avatar.measurements);

  useEffect(() => {
    if (!gltf?.scene || !groupRef.current) return;

    const scene = gltf.scene;
    boneMap.current.clear();
    bindPoses.current.clear();

    // Collect bones from skeleton (not traverse) to ensure we modify the actual rendered bones
    let skeleton: THREE.Skeleton | null = null;
    scene.traverse((obj) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh && !skeleton) {
        skeleton = (obj as THREE.SkinnedMesh).skeleton;
      }
    });

    if (skeleton) {
      for (const bone of (skeleton as THREE.Skeleton).bones) {
        boneMap.current.set(bone.name, bone);
        bindPoses.current.set(bone.name, bone.quaternion.clone());
      }
      // Apply initial pose
      boneMap.current.forEach((bone, name) => {
        const jointRot = joints[name];
        if (jointRot) {
          const bindQ = bindPoses.current.get(name)!;
          const rotQ = new THREE.Quaternion();
          if (jointRot.x !== 0) rotQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), jointRot.x * DEG2RAD));
          if (jointRot.y !== 0) rotQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), jointRot.y * DEG2RAD));
          if (jointRot.z !== 0) rotQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), jointRot.z * DEG2RAD));
          bone.quaternion.copy(rotQ).multiply(bindQ);
          console.log(`[AvatarModel] Applied ${name} z:${jointRot.z}°`);
        }
      });
    } else {
      // Fallback: traverse for bones
      scene.traverse((obj) => {
        if (!(obj as THREE.Bone).isBone) return;
        const bone = obj as THREE.Bone;
        boneMap.current.set(bone.name, bone);
        bindPoses.current.set(bone.name, bone.quaternion.clone());
      });
    }

    // Compute bounding box for auto-scaling
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);

    if (autoScale && size.y > 0) {
      const scale = height / size.y;
      scene.scale.setScalar(scale);

      const scaledBox = new THREE.Box3().setFromObject(scene);
      const scaledCenter = new THREE.Vector3();
      scaledBox.getCenter(scaledCenter);

      scene.position.y = -scaledBox.min.y;
      scene.position.x = -scaledCenter.x;
      scene.position.z = -scaledCenter.z;
    }

    // Material defaults
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat.isMeshStandardMaterial) {
            mat.roughness = Math.max(mat.roughness, 0.4);
            mat.metalness = Math.min(mat.metalness, 0.3);
            mat.envMapIntensity = 0.5;
          }
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    // Clear and add
    while (groupRef.current.children.length) {
      groupRef.current.remove(groupRef.current.children[0]);
    }
    groupRef.current.add(scene);

    // Apply initial pose immediately after loading
    requestAnimationFrame(() => applyPose.current());
  }, [gltf, autoScale, height]);

  // Helper to apply pose + morphs to all bones
  const applyPose = useRef(() => {});
  applyPose.current = () => {
    const morphCfg: MorphConfig = {
      chest: measurements.chest,
      waist: measurements.waist,
      hip: measurements.hips,
      shoulderWidth: measurements.shoulder,
      height: measurements.height,
      armLength: measurements.armLength,
      inseam: measurements.inseam,
    };
    const weights = computeMorphWeights(morphCfg);

    boneMap.current.forEach((bone, name) => {
      const bindPose = bindPoses.current.get(name);
      if (!bindPose) return;

      const jointRot = joints[name];
      if (jointRot) {
        const rotQ = new THREE.Quaternion();
        if (jointRot.x !== 0) rotQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), jointRot.x * DEG2RAD));
        if (jointRot.y !== 0) rotQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), jointRot.y * DEG2RAD));
        if (jointRot.z !== 0) rotQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), jointRot.z * DEG2RAD));
        bone.quaternion.copy(rotQ).multiply(bindPose);
      } else {
        bone.quaternion.copy(bindPose);
      }

      // Morph bone scaling
      if (MORPH_BONE_MAP.chest.includes(name as 'Spine1' | 'Spine2')) {
        bone.scale.set(weights.chestScale, 1, weights.chestScale);
      } else if (MORPH_BONE_MAP.waist.includes(name as 'Spine')) {
        bone.scale.set(weights.waistScale, 1, weights.waistScale);
      } else if (MORPH_BONE_MAP.hip.includes(name as 'Hips')) {
        bone.scale.set(weights.hipScale, 1, weights.hipScale);
      } else if (name === MORPH_BONE_MAP.shoulderLeft || name === MORPH_BONE_MAP.shoulderRight) {
        bone.scale.set(weights.shoulderScale, 1, 1);
      } else if (name === MORPH_BONE_MAP.armLeft || name === MORPH_BONE_MAP.armRight) {
        bone.scale.set(1, weights.armLength, 1);
      } else if (name === MORPH_BONE_MAP.legLeft || name === MORPH_BONE_MAP.legRight) {
        bone.scale.set(1, weights.legLength, 1);
      } else {
        bone.scale.set(1, 1, 1);
      }
    });
  };

  // Apply pose reactively when joints or measurements change
  useEffect(() => {
    if (boneMap.current.size > 0) {
      applyPose.current();
    }
  }, [joints, measurements]);

  // Also apply every frame for smooth animation
  useFrame(() => { applyPose.current(); });

  return <group ref={groupRef} />;
}
