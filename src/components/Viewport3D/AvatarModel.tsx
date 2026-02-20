import { useEffect, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';

interface AvatarModelProps {
  url: string;
  autoScale?: boolean;
  /** Target height in meters (default: 1.80) */
  height?: number;
}

/**
 * Set A-pose: rotate arms 45° down from T-pose.
 * Uses SkeletonUtils.clone for proper skeleton cloning,
 * then rotates arm bones in local space.
 */
function applyAPose(scene: THREE.Object3D) {
  const DEG45 = Math.PI / 4;
  const rotDown = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0), DEG45
  );

  scene.traverse((obj) => {
    if (!(obj as THREE.Bone).isBone) return;
    const bone = obj as THREE.Bone;

    if (bone.name === 'LeftArm' || bone.name === 'LeftUpperArm') {
      bone.quaternion.multiply(rotDown);
    } else if (bone.name === 'RightArm' || bone.name === 'RightUpperArm') {
      bone.quaternion.multiply(rotDown);
    }
  });
}

export default function AvatarModel({ url, autoScale = true, height = 1.80 }: AvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, url);

  useEffect(() => {
    if (!gltf?.scene || !groupRef.current) return;

    // SkeletonUtils.clone properly clones SkinnedMesh + skeleton bindings
    const scene = SkeletonUtils.clone(gltf.scene);

    // Apply A-pose
    applyAPose(scene);

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
  }, [gltf, autoScale, height]);

  return <group ref={groupRef} />;
}
