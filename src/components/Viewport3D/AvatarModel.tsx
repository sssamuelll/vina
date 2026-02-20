import { useEffect, useRef } from "react";
import { useLoader, useFrame } from "@react-three/fiber";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

interface AvatarModelProps {
  url: string;
  autoScale?: boolean;
  /** Target height in meters (default: 1.80) */
  height?: number;
}

export default function AvatarModel({ url, autoScale = true, height = 1.80 }: AvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, url);
  const poseApplied = useRef(false);

  // Store reference to bones we need to rotate
  const armBones = useRef<{ left?: THREE.Bone; right?: THREE.Bone }>({});

  useEffect(() => {
    if (!gltf?.scene || !groupRef.current) return;
    poseApplied.current = false;

    const scene = gltf.scene;

    // Find arm bones
    scene.traverse((obj) => {
      if (!(obj as THREE.Bone).isBone) return;
      const bone = obj as THREE.Bone;
      if (bone.name === 'LeftArm' || bone.name === 'LeftUpperArm') {
        armBones.current.left = bone;
      } else if (bone.name === 'RightArm' || bone.name === 'RightUpperArm') {
        armBones.current.right = bone;
      }
    });

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

  // Apply A-pose on first frame (after Three.js has processed the skeleton)
  useFrame(() => {
    if (poseApplied.current) return;
    const { left, right } = armBones.current;
    if (!left && !right) return;

    const DEG45 = Math.PI / 4;
    const rot = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), DEG45
    );

    if (left) left.quaternion.multiply(rot);
    if (right) right.quaternion.multiply(rot.clone());

    poseApplied.current = true;
  });

  return <group ref={groupRef} />;
}
