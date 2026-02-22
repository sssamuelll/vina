import { useEffect, useRef } from "react";
import { useLoader, useFrame } from "@react-three/fiber";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CCDIKSolver } from 'three/examples/jsm/animation/CCDIKSolver.js';
import * as THREE from 'three';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { computeMorphWeights, MORPH_BONE_MAP, type MorphConfig } from '../../utils/avatar/morphTargets';
import { setJointRotation, clampJointRotation } from '../../store/avatarSlice';

interface AvatarModelProps {
  url: string;
  autoScale?: boolean;
  /** Target height in meters (default: 1.80) */
  height?: number;
}

const DEG2RAD = Math.PI / 180;

// ===== AXIS DISCOVERY (keep for future GLB models) — enable with ?axisDiscovery in URL =====
function discoverBoneAxes(boneMap: Map<string, THREE.Bone>, bindPoses: Map<string, THREE.Quaternion>, scene: THREE.Object3D) {
  const testBones = ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'RightArm'];
  const handBone = boneMap.get('LeftHand') || boneMap.get('LeftForeArm');
  const rightHandBone = boneMap.get('RightHand') || boneMap.get('RightForeArm');
  if (!handBone) { console.warn('[AxisDiscovery] No hand bone found'); return; }
  
  const axes = ['x', 'y', 'z'] as const;
  const testAngle = 45; // degrees
  
  console.log('===== AXIS DISCOVERY START =====');
  console.log('Bone hierarchy:');
  const hierBones = ['Hips', 'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
                     'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'];
  for (const bn of hierBones) {
    const b = boneMap.get(bn);
    if (b) {
      const wp = new THREE.Vector3();
      b.getWorldPosition(wp);
      const localAxes = {
        x: new THREE.Vector3(1,0,0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())),
        y: new THREE.Vector3(0,1,0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())),
        z: new THREE.Vector3(0,0,1).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())),
      };
      console.log(`  ${bn}: world(${wp.x.toFixed(3)}, ${wp.y.toFixed(3)}, ${wp.z.toFixed(3)}) | localX→world(${localAxes.x.x.toFixed(2)},${localAxes.x.y.toFixed(2)},${localAxes.x.z.toFixed(2)}) localY→(${localAxes.y.x.toFixed(2)},${localAxes.y.y.toFixed(2)},${localAxes.y.z.toFixed(2)}) localZ→(${localAxes.z.x.toFixed(2)},${localAxes.z.y.toFixed(2)},${localAxes.z.z.toFixed(2)})`);
    }
  }
  
  // Get baseline hand position
  scene.updateMatrixWorld(true);
  const baseline = new THREE.Vector3();
  handBone.getWorldPosition(baseline);
  const rightBaseline = new THREE.Vector3();
  if (rightHandBone) rightHandBone.getWorldPosition(rightBaseline);
  
  console.log(`\nBaseline LeftHand world: (${baseline.x.toFixed(3)}, ${baseline.y.toFixed(3)}, ${baseline.z.toFixed(3)})`);
  if (rightHandBone) console.log(`Baseline RightHand world: (${rightBaseline.x.toFixed(3)}, ${rightBaseline.y.toFixed(3)}, ${rightBaseline.z.toFixed(3)})`);
  
  for (const boneName of testBones) {
    const bone = boneMap.get(boneName);
    const bindQ = bindPoses.get(boneName);
    if (!bone || !bindQ) continue;
    
    const refHand = boneName.startsWith('Right') ? rightHandBone : handBone;
    const refBaseline = boneName.startsWith('Right') ? rightBaseline : baseline;
    if (!refHand) continue;
    
    console.log(`\n--- ${boneName} (testing +${testAngle}° each axis) ---`);
    
    for (const axis of axes) {
      // Reset to bind pose
      bone.quaternion.copy(bindQ);
      scene.updateMatrixWorld(true);
      
      // Apply +testAngle on this axis only
      const euler = new THREE.Euler(
        axis === 'x' ? testAngle * DEG2RAD : 0,
        axis === 'y' ? testAngle * DEG2RAD : 0,
        axis === 'z' ? testAngle * DEG2RAD : 0,
        'ZYX'
      );
      const rotQ = new THREE.Quaternion().setFromEuler(euler);
      bone.quaternion.copy(bindQ).multiply(rotQ);
      scene.updateMatrixWorld(true);
      
      const pos = new THREE.Vector3();
      refHand.getWorldPosition(pos);
      const delta = pos.clone().sub(refBaseline);
      
      // Interpret anatomically (world space: Y=up, Z=forward, X=right)
      let interpretation = '';
      if (Math.abs(delta.y) > Math.abs(delta.x) && Math.abs(delta.y) > Math.abs(delta.z)) {
        interpretation = delta.y > 0 ? 'HAND GOES UP ↑' : 'HAND GOES DOWN ↓';
      } else if (Math.abs(delta.x) > Math.abs(delta.z)) {
        interpretation = delta.x > 0 ? 'HAND GOES RIGHT →' : 'HAND GOES LEFT ←';
      } else {
        interpretation = delta.z > 0 ? 'HAND GOES FORWARD ↗' : 'HAND GOES BACKWARD ↙';
      }
      
      console.log(`  +${axis}: hand delta(${delta.x.toFixed(3)}, ${delta.y.toFixed(3)}, ${delta.z.toFixed(3)}) → ${interpretation}`);
      
      // Reset
      bone.quaternion.copy(bindQ);
    }
    
    // Also test negative
    console.log(`  --- ${boneName} (testing -${testAngle}° each axis) ---`);
    for (const axis of axes) {
      bone.quaternion.copy(bindQ);
      scene.updateMatrixWorld(true);
      
      const euler = new THREE.Euler(
        axis === 'x' ? -testAngle * DEG2RAD : 0,
        axis === 'y' ? -testAngle * DEG2RAD : 0,
        axis === 'z' ? -testAngle * DEG2RAD : 0,
        'ZYX'
      );
      const rotQ = new THREE.Quaternion().setFromEuler(euler);
      bone.quaternion.copy(bindQ).multiply(rotQ);
      scene.updateMatrixWorld(true);
      
      const pos = new THREE.Vector3();
      refHand.getWorldPosition(pos);
      const delta = pos.clone().sub(refBaseline);
      
      let interpretation = '';
      if (Math.abs(delta.y) > Math.abs(delta.x) && Math.abs(delta.y) > Math.abs(delta.z)) {
        interpretation = delta.y > 0 ? 'HAND GOES UP ↑' : 'HAND GOES DOWN ↓';
      } else if (Math.abs(delta.x) > Math.abs(delta.z)) {
        interpretation = delta.x > 0 ? 'HAND GOES RIGHT →' : 'HAND GOES LEFT ←';
      } else {
        interpretation = delta.z > 0 ? 'HAND GOES FORWARD ↗' : 'HAND GOES BACKWARD ↙';
      }
      
      console.log(`  -${axis}: hand delta(${delta.x.toFixed(3)}, ${delta.y.toFixed(3)}, ${delta.z.toFixed(3)}) → ${interpretation}`);
      
      bone.quaternion.copy(bindQ);
    }
  }
  
  // Final reset all
  for (const boneName of testBones) {
    const bone = boneMap.get(boneName);
    const bindQ = bindPoses.get(boneName);
    if (bone && bindQ) bone.quaternion.copy(bindQ);
  }
  scene.updateMatrixWorld(true);
  console.log('\n===== AXIS DISCOVERY END =====');
}
// ===== END AXIS DISCOVERY =====

export default function AvatarModel({ url, autoScale = true, height = 1.80 }: AvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, url);
  const boneMap = useRef<Map<string, THREE.Bone>>(new Map());
  const bindPoses = useRef<Map<string, THREE.Quaternion>>(new Map());
  const ikSolver = useRef<CCDIKSolver | null>(null);

  const dispatch = useDispatch();
  const joints = useSelector((s: RootState) => s.avatar.pose.joints);
  const measurements = useSelector((s: RootState) => s.project.avatar.measurements);
  const ikChains = useSelector((s: RootState) => s.avatar.pose.ikChains);
  const ikTargets = useSelector((s: RootState) => s.avatar.pose.ikTargets);
  const ikEnabled = useSelector((s: RootState) => s.avatar.pose.ikEnabled);

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
          // Use Euler with 'ZYX' order for more natural rotations
          const euler = new THREE.Euler(jointRot.x * DEG2RAD, jointRot.y * DEG2RAD, jointRot.z * DEG2RAD, 'ZYX');
          const rotQ = new THREE.Quaternion().setFromEuler(euler);
          // POST-multiply: bindPose first, then local rotation (local space)
          bone.quaternion.copy(bindQ).multiply(rotQ);
          console.log(`[AvatarModel] Applied ${name} z:${jointRot.z}°`);
        }
      });
      // Run axis discovery diagnostic (enable with ?axisDiscovery in URL)
      if (window.location.search.includes('axisDiscovery')) {
        discoverBoneAxes(boneMap.current, bindPoses.current, scene);
      }
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

    // Initialize IK solver
    initializeIK();

    // Apply initial pose immediately after loading
    requestAnimationFrame(() => applyPose.current());
  }, [gltf, autoScale, height]);

  // Initialize IK solver and chains
  const initializeIK = () => {
    if (!gltf?.scene || boneMap.current.size === 0) return;

    try {
      const mesh = gltf.scene.children.find((child) => (child as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh;
      if (!mesh || !mesh.skeleton) return;

      // Create IK chains
      const iks = ikChains.map(chain => {
        const bones = chain.bones.map(boneName => {
          const bone = boneMap.current.get(boneName);
          if (!bone) {
            console.warn(`[AvatarModel] IK bone not found: ${boneName}`);
            return null;
          }
          return { index: mesh.skeleton!.bones.indexOf(bone) };
        }).filter(b => b !== null);

        if (bones.length === 0) return null;

        return {
          target: bones[bones.length - 1]!.index, // End effector
          effector: bones[bones.length - 1]!.index,
          links: bones.slice(0, -1).map(b => ({ index: b!.index })),
        };
      }).filter(ik => ik !== null);

      if (iks.length > 0) {
        ikSolver.current = new CCDIKSolver(mesh, iks);
      }
    } catch (error) {
      console.warn('[AvatarModel] IK initialization failed:', error);
    }
  };

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
        // Use Euler with 'ZYX' order for more natural rotations
        const euler = new THREE.Euler(jointRot.x * DEG2RAD, jointRot.y * DEG2RAD, jointRot.z * DEG2RAD, 'ZYX');
        const rotQ = new THREE.Quaternion().setFromEuler(euler);
        // POST-multiply: bindPose first, then local rotation (local space)
        bone.quaternion.copy(bindPose).multiply(rotQ);
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

    // Apply IK if enabled and solver is available
    if (ikEnabled && ikSolver.current && ikTargets.length > 0) {
      try {
        ikSolver.current.update();
        
        // Extract updated bone rotations and store them back in Redux
        boneMap.current.forEach((bone, name) => {
          const bindPose = bindPoses.current.get(name);
          if (!bindPose) return;
          
          // Calculate rotation difference from bind pose
          const currentRot = bone.quaternion.clone();
          const relativeRot = new THREE.Quaternion().multiplyQuaternions(currentRot, bindPose.clone().invert());
          
          // Convert to Euler angles
          const euler = new THREE.Euler().setFromQuaternion(relativeRot, 'ZYX');
          const rotation = {
            x: euler.x * (180 / Math.PI),
            y: euler.y * (180 / Math.PI),
            z: euler.z * (180 / Math.PI),
          };
          
          // Only update if significantly different from current joint rotation
          const current = joints[name];
          if (!current || 
              Math.abs(rotation.x - current.x) > 1 ||
              Math.abs(rotation.y - current.y) > 1 ||
              Math.abs(rotation.z - current.z) > 1) {
            
            const clamped = clampJointRotation(name, rotation);
            dispatch(setJointRotation({ joint: name, rotation: clamped }));
          }
        });
      } catch (error) {
        console.warn('[AvatarModel] IK solving failed:', error);
      }
    }
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
