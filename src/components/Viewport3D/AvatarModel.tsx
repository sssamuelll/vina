import { useEffect, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

interface AvatarModelProps {
  url: string;
  autoScale?: boolean;
  /** Target height in meters (default: 1.80) */
  height?: number;
}

/**
 * Set A-pose on an Avaturn/Mixamo rig.
 * 
 * In these rigs, LeftShoulder rotates ~90° to point the arm chain outward.
 * LeftArm's local Y axis points along the arm.
 * To bring the arm down 45° from T-pose → A-pose, we need to find
 * the correct axis by trying the world-space approach:
 * rotate the arm bone so it points 45° down from horizontal.
 */
function setAPose(root: THREE.Object3D) {
  const DEG45 = Math.PI / 4;

  root.traverse((obj) => {
    if (!(obj as THREE.Bone).isBone) return;
    const bone = obj as THREE.Bone;

    switch (bone.name) {
      case 'LeftArm':
      case 'LeftUpperArm': {
        // In Avaturn rigs with LeftShoulder doing the 90° orient,
        // LeftArm local space: Y = along arm, X = forward/back
        // To rotate arm downward in parent space, we rotate around
        // the parent's local X axis (which maps to world forward after shoulder rotation)
        // Actually: since shoulder already rotated the frame, we need to rotate
        // LeftArm around its local Z to swing it toward the body
        // Let's try all axes and pick the right one:
        // After shoulder rotation, the arm's local frame is:
        //   Y → along arm (outward), Z → roughly forward, X → roughly down
        // So rotating around Z (forward) swings the arm down
        // BUT if that didn't work, it's because clone() doesn't propagate
        // skeleton bindings. Let's try X axis (down in local frame)
        bone.quaternion.multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), DEG45)
        );
        break;
      }
      case 'RightArm':
      case 'RightUpperArm': {
        // Right arm mirrors: same positive X rotation
        bone.quaternion.multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), DEG45)
        );
        break;
      }
    }
  });
}

export default function AvatarModel({ url, autoScale = true, height = 1.80 }: AvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, url);

  useEffect(() => {
    if (!gltf?.scene || !groupRef.current) return;

    // Use the scene directly — clone(true) breaks SkinnedMesh skeleton bindings
    const scene = gltf.scene;

    // Reset any previous pose modifications first
    scene.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) {
        // We'll only touch arm bones, leave others as-is
      }
    });

    // Apply A-pose
    setAPose(scene);

    // Force update all skinned meshes
    scene.traverse((obj) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = obj as THREE.SkinnedMesh;
        sm.skeleton.update();
        // Force bind matrix update
        sm.skeleton.calculateInverses();
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

    // Clear previous children and add scene
    while (groupRef.current.children.length) {
      groupRef.current.remove(groupRef.current.children[0]);
    }
    groupRef.current.add(scene);
  }, [gltf, autoScale, height]);

  return <group ref={groupRef} />;
}
