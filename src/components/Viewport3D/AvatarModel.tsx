import { useEffect, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

interface AvatarModelProps {
  url: string;
  /** Scale to fit target height */
  autoScale?: boolean;
  /** Target height in meters (default: 1.80) */
  height?: number;
}

/**
 * Set A-pose: rotate arms down ~45° from T-pose.
 * CLO3D standard pose — arms at 45° for natural garment draping.
 * 
 * Avaturn/Mixamo rigs: LeftShoulder has complex quaternion that orients the arm chain.
 * LeftArm/RightArm are nearly identity in T-pose.
 * To go from T-pose → A-pose, we rotate LeftArm/RightArm around their
 * local forward axis (which points along the arm).
 * 
 * The shoulder quaternions orient the arm so that:
 *   - Local Y points along the arm (outward)
 *   - Local Z points forward
 *   - Rotating around local Z in parent space brings the arm down
 */
function setAPose(scene: THREE.Object3D) {
  const DEG45 = Math.PI / 4;

  scene.traverse((child) => {
    if (!(child as THREE.Bone).isBone) return;
    const bone = child as THREE.Bone;
    const name = bone.name;

    if (name === 'LeftArm' || name === 'LeftUpperArm') {
      // For left arm: rotate to bring arm down toward body
      // In Mixamo/Avaturn rigs, the shoulder orients the chain so
      // we need to apply rotation in the bone's local space
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1), DEG45
      );
      bone.quaternion.multiply(q);
    } else if (name === 'RightArm' || name === 'RightUpperArm') {
      // Mirror for right arm
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, -1), DEG45
      );
      bone.quaternion.multiply(q);
    }
  });
}

export default function AvatarModel({ url, autoScale = true, height = 1.80 }: AvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, url);

  useEffect(() => {
    if (!gltf?.scene || !groupRef.current) return;

    const scene = gltf.scene.clone(true);

    // Apply A-pose (arms at 45° like CLO3D)
    setAPose(scene);

    // Force skeleton update after bone manipulation
    scene.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        const skinned = child as THREE.SkinnedMesh;
        skinned.skeleton.update();
      }
    });

    // Compute bounding box for auto-scaling
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);

    if (autoScale && size.y > 0) {
      const targetHeight = height;
      const scale = targetHeight / size.y;
      scene.scale.setScalar(scale);

      // Recalculate after scale
      const scaledBox = new THREE.Box3().setFromObject(scene);
      const scaledCenter = new THREE.Vector3();
      scaledBox.getCenter(scaledCenter);

      // Place feet on ground
      scene.position.y = -scaledBox.min.y;
      scene.position.x = -scaledCenter.x;
      scene.position.z = -scaledCenter.z;
    }

    // Apply material defaults
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

    // Clear previous and add new
    while (groupRef.current.children.length) {
      groupRef.current.remove(groupRef.current.children[0]);
    }
    groupRef.current.add(scene);
  }, [gltf, autoScale, height]);

  return <group ref={groupRef} />;
}
