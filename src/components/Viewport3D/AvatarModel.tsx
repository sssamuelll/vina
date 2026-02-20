import { useEffect, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

interface AvatarModelProps {
  url: string;
  /** Scale to fit roughly 1.7m tall */
  autoScale?: boolean;
}

/**
 * Set A-pose: rotate arms down ~45° from T-pose.
 * CLO3D standard pose — arms at 45° for natural garment draping.
 */
function setAPose(scene: THREE.Object3D) {
  scene.traverse((child) => {
    if (!(child as THREE.Bone).isBone) return;
    const bone = child as THREE.Bone;
    const name = bone.name;

    // Rotate upper arms down 45° (T-pose → A-pose)
    // LeftArm: rotate +45° around Z (positive Z rotates down on left side)
    // RightArm: rotate -45° around Z (negative Z rotates down on right side)
    const angle = Math.PI / 4; // 45 degrees

    if (name === 'LeftArm' || name === 'LeftUpperArm') {
      bone.rotation.z += angle;
    } else if (name === 'RightArm' || name === 'RightUpperArm') {
      bone.rotation.z -= angle;
    }

    // Slightly bend forearms inward for natural look
    if (name === 'LeftForeArm' || name === 'LeftLowerArm') {
      bone.rotation.z += angle * 0.15;
    } else if (name === 'RightForeArm' || name === 'RightLowerArm') {
      bone.rotation.z -= angle * 0.15;
    }
  });
}

export default function AvatarModel({ url, autoScale = true }: AvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, url);

  useEffect(() => {
    if (!gltf?.scene || !groupRef.current) return;

    const scene = gltf.scene.clone(true);

    // Apply A-pose (arms at 45° like CLO3D)
    setAPose(scene);

    // Compute bounding box for auto-scaling
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);

    if (autoScale && size.y > 0) {
      // Target height: ~1.65m (realistic human height)
      const targetHeight = 1.65;
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
  }, [gltf, autoScale]);

  return <group ref={groupRef} />;
}
