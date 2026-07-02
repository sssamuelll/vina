import { useEffect, useRef, useState } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";

import * as THREE from 'three';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { computeMorphWeights, MORPH_BONE_MAP, type MorphConfig } from '../../utils/avatar/morphTargets';
import { IK_END_EFFECTOR_BONES, JOINT_CONSTRAINTS, setAvailableMorphTargets, clearMorphTargets } from '../../store/avatarSlice';
import { setArmAxis } from '../../store/simulationSlice';
import { clampSwingTwist, ANATOMICAL_CONSTRAINTS } from '../../utils/avatar/swingTwistConstraint';
import { isVRMFile, VRM_TO_MIXAMO_BONE_MAP } from '../../utils/avatar/vrmLoader';
import { detectFormat, importMesh, type MeshFormat } from '../../utils/import/meshImporter';
import { metresToImporter, importerToMetres } from '../../utils/geometry';
// WebGPURenderer always uses NodeMaterial — legacy MeshDepthMaterial (shadows) unsupported
const nodeMaterialActive = true;
import type { VRM } from '@pixiv/three-vrm';

interface AvatarModelProps {
  url: string;
  autoScale?: boolean;
  /** Target height in meters (default: 1.80) */
  height?: number;
  /** Pointer down handler for tape tools */
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
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

export default function AvatarModel({ url, autoScale = true, height = 1.80, onPointerDown }: AvatarModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const format = detectFormat(url.split('/').pop() || url) as MeshFormat;
  const isVrm = format === 'vrm' || isVRMFile(url);
  const isObjFbx = format === 'obj' || format === 'fbx';
  const [importedScene, setImportedScene] = useState<THREE.Group | null>(null);
  const [vrmInstance, setVrmInstance] = useState<VRM | null>(null);
  const boneMap = useRef<Map<string, THREE.Bone>>(new Map());
  const bindPoses = useRef<Map<string, THREE.Quaternion>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ikSolver = useRef<any>(null);
  const ikTargetHelpers = useRef<Map<string, THREE.Object3D>>(new Map());
  const ikPlaceholderIndices = useRef<number[]>([]);
  const ikSolvedRotations = useRef<Map<string, THREE.Quaternion>>(new Map());
  const morphMeshes = useRef<THREE.SkinnedMesh[]>([]);

  const dispatch = useDispatch();
  const joints = useSelector((s: RootState) => s.avatar.pose.joints);
  const measurements = useSelector((s: RootState) => s.project.avatar.measurements);
  const morphTargets = useSelector((s: RootState) => s.avatar.morphTargets);
  const ikChains = useSelector((s: RootState) => s.avatar.pose.ikChains);
  const ikTargets = useSelector((s: RootState) => s.avatar.pose.ikTargets);
  const ikEnabled = useSelector((s: RootState) => s.avatar.pose.ikEnabled);
  const avatarRenderStyle = useSelector((s: RootState) => s.renderSettings.avatarRenderStyle);

  // Load mesh via importMesh canonical (handles GLTF/GLB/OBJ/FBX/VRM uniformly:
  // unit detection, target-height auto-scale, center-on-ground, safety limits).
  // Replaces 3 prior loading paths (useLoader+phantom-load, separate VRM useEffect,
  // separate OBJ/FBX useEffect with inline scaling) — see C8 Fase 2 doc.
  useEffect(() => {
    let cancelled = false;
    const filename = url.split('/').pop() || url;

    importMesh(url, filename, {
      targetHeightMm: metresToImporter(height),
    }).then((result) => {
      if (cancelled) return;

      importerToMetres(result.scene);
      result.scene.updateMatrixWorld(true);

      setImportedScene(result.scene);
      setVrmInstance(result.vrm ?? null);
    }).catch((err) => {
      console.error('[AvatarModel] Failed to load mesh:', err);
    });

    return () => { cancelled = true; };
  }, [url, height]);

  useEffect(() => {
    const scene = importedScene;
    if (!scene || !groupRef.current) return;
    boneMap.current.clear();
    bindPoses.current.clear();

    if (isVrm && vrmInstance) {
      // For VRM: use humanoid bone mapping so joints are addressed by Mixamo-style names
      const humanoid = vrmInstance.humanoid;
      if (humanoid) {
        for (const [vrmBoneName, mixamoBoneName] of Object.entries(VRM_TO_MIXAMO_BONE_MAP)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const boneNode = humanoid.getNormalizedBoneNode(vrmBoneName as any);
          if (boneNode && (boneNode as THREE.Bone).isBone) {
            const bone = boneNode as THREE.Bone;
            boneMap.current.set(mixamoBoneName, bone);
            bindPoses.current.set(mixamoBoneName, bone.quaternion.clone());
          }
        }
      }
    } else {
      // GLB: Collect bones from skeleton (not traverse) to ensure we modify the actual rendered bones
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

        // Pre-allocate skeleton capacity for IK target bones.
        // WebGPURenderer's SkinningNode captures bones.length at construction
        // time to size the uniform buffer. If bones are pushed later (by IK
        // init), the buffer is too small and the entire render pass is
        // discarded with "Invalid CommandBuffer". Pre-padding here ensures the
        // buffer is sized correctly from the first render frame.
        const ikSlotCount = Object.keys(IK_END_EFFECTOR_BONES).length; // 4
        const sk = skeleton as THREE.Skeleton;
        ikPlaceholderIndices.current = [];
        for (let i = 0; i < ikSlotCount; i++) {
          const placeholder = new THREE.Bone();
          placeholder.name = `__ik_placeholder_${i}`;
          sk.bones.push(placeholder);
          sk.boneInverses.push(new THREE.Matrix4());
          ikPlaceholderIndices.current.push(sk.bones.length - 1);
        }
        // Rebuild boneMatrices with the padded bone count
        sk.init();
      } else {
        // Fallback: traverse for bones
        scene.traverse((obj) => {
          if (!(obj as THREE.Bone).isBone) return;
          const bone = obj as THREE.Bone;
          boneMap.current.set(bone.name, bone);
          bindPoses.current.set(bone.name, bone.quaternion.clone());
        });
      }
    }

    // Apply initial pose
    boneMap.current.forEach((bone, name) => {
      const jointRot = joints[name];
      if (jointRot) {
        const bindQ = bindPoses.current.get(name)!;
        const euler = new THREE.Euler(jointRot.x * DEG2RAD, jointRot.y * DEG2RAD, jointRot.z * DEG2RAD, 'ZYX');
        const rotQ = new THREE.Quaternion().setFromEuler(euler);
        bone.quaternion.copy(bindQ).multiply(rotQ);
        console.log(`[AvatarModel] Applied ${name} z:${jointRot.z}°`);
      }
    });
    // Run axis discovery diagnostic (enable with ?axisDiscovery in URL)
    if (!isVrm && window.location.search.includes('axisDiscovery')) {
      discoverBoneAxes(boneMap.current, bindPoses.current, scene);
    }

    // Auto-scale: skip for OBJ/FBX (already scaled in their loader useEffect)
    if (!isObjFbx) {
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
        mesh.castShadow = !nodeMaterialActive;
        mesh.receiveShadow = !nodeMaterialActive;
      }
    });

    // Clear and add
    while (groupRef.current.children.length) {
      groupRef.current.remove(groupRef.current.children[0]);
    }
    groupRef.current.add(scene);

    // Detect native morph targets (blendshapes)
    morphMeshes.current = [];
    const morphNames = new Set<string>();
    scene.traverse((child) => {
      const mesh = child as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        morphMeshes.current.push(mesh);
        for (const name of Object.keys(mesh.morphTargetDictionary)) {
          morphNames.add(name);
        }
      }
    });
    if (morphNames.size > 0) {
      dispatch(setAvailableMorphTargets(Array.from(morphNames).sort()));
    } else {
      dispatch(clearMorphTargets());
    }

    // Initialize IK solver
    initializeIK(scene);

    // Apply initial pose immediately after loading
    requestAnimationFrame(() => applyPose.current());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importedScene, autoScale, height, vrmInstance, isVrm, isObjFbx]);

  // Initialize IK solver and chains
  const initializeIK = async (activeScene: THREE.Object3D) => {
    if (!activeScene || boneMap.current.size === 0) return;

    // Clean up old target helpers (restore placeholder bones in their slots)
    if (ikTargetHelpers.current.size > 0) {
      let cleanupMesh: THREE.SkinnedMesh | null = null;
      activeScene.traverse((child) => {
        if (!cleanupMesh && (child as THREE.SkinnedMesh).isSkinnedMesh) {
          cleanupMesh = child as THREE.SkinnedMesh;
        }
      });
      const cleanupSkeleton = cleanupMesh ? (cleanupMesh as THREE.SkinnedMesh).skeleton : null;

      ikTargetHelpers.current.forEach(helper => {
        helper.parent?.remove(helper);
        // Restore placeholder bone in the slot instead of splicing.
        // Splicing would change array length and break the pre-allocated
        // uniform buffer size that the WebGPU pipeline compiled against.
        if (cleanupSkeleton) {
          const idx = cleanupSkeleton.bones.indexOf(helper as unknown as THREE.Bone);
          if (idx !== -1) {
            const placeholder = new THREE.Bone();
            placeholder.name = `__ik_placeholder_${idx}`;
            cleanupSkeleton.bones[idx] = placeholder;
            cleanupSkeleton.boneInverses[idx] = new THREE.Matrix4();
          }
        }
      });
    }
    ikTargetHelpers.current.clear();
    ikSolver.current = null;

    try {
      let mesh: THREE.SkinnedMesh | null = null;
      activeScene.traverse((child) => {
        if (!mesh && (child as THREE.SkinnedMesh).isSkinnedMesh) {
          mesh = child as THREE.SkinnedMesh;
        }
      });
      if (!mesh || !(mesh as THREE.SkinnedMesh).skeleton) return;

      const skeleton = (mesh as THREE.SkinnedMesh).skeleton!;
      const iks: Array<{
        target: number;
        effector: number;
        links: Array<{ index: number; rotationMin?: THREE.Vector3; rotationMax?: THREE.Vector3 }>;
      }> = [];

      // Use pre-allocated placeholder slots for IK targets instead of
      // pushing new bones (which would grow the array past the uniform
      // buffer capacity that the WebGPU pipeline compiled against).
      let nextPlaceholderSlot = 0;

      for (const chain of ikChains) {
        const endEffectorBoneName = IK_END_EFFECTOR_BONES[chain.name];
        if (!endEffectorBoneName) continue;

        const endEffectorBone = boneMap.current.get(endEffectorBoneName);
        if (!endEffectorBone) continue;

        // Create invisible target helper
        const target = new THREE.Object3D();
        target.name = `ik-target-${chain.name}`;
        // Position at end-effector's current world position
        const worldPos = new THREE.Vector3();
        endEffectorBone.getWorldPosition(worldPos);
        target.position.copy(worldPos);
        activeScene.add(target);
        ikTargetHelpers.current.set(chain.name, target);

        // Replace a pre-allocated placeholder bone with this IK target.
        // The placeholder slots were created during avatar load to ensure
        // the uniform buffer is sized correctly from the first frame.
        let targetIndex: number;
        if (nextPlaceholderSlot < ikPlaceholderIndices.current.length) {
          targetIndex = ikPlaceholderIndices.current[nextPlaceholderSlot++];
          skeleton.bones[targetIndex] = target as unknown as THREE.Bone;
          skeleton.boneInverses[targetIndex] = new THREE.Matrix4();
        } else {
          // Fallback: push if no placeholder available (shouldn't happen)
          skeleton.bones.push(target as unknown as THREE.Bone);
          skeleton.boneInverses.push(new THREE.Matrix4());
          targetIndex = skeleton.bones.length - 1;
        }

        // The effector is the end-effector bone (hand/foot), not the last link
        const effectorIndex = skeleton.bones.indexOf(endEffectorBone);

        // CCDIKSolver expects links ordered child→parent:
        //   links[0] = direct parent of effector, links[n] = root of chain
        // chain.bones is root→child, so we reverse the entire array for links
        const links = [...chain.bones].reverse().map(boneName => {
          const bone = boneMap.current.get(boneName);
          if (!bone) return null;
          const idx = skeleton.bones.indexOf(bone);

          // Convert JOINT_CONSTRAINTS to radians for CCD link limits
          const constraints = JOINT_CONSTRAINTS[boneName];
          if (constraints) {
            return {
              index: idx,
              rotationMin: new THREE.Vector3(
                constraints.minX * DEG2RAD,
                constraints.minY * DEG2RAD,
                constraints.minZ * DEG2RAD
              ),
              rotationMax: new THREE.Vector3(
                constraints.maxX * DEG2RAD,
                constraints.maxY * DEG2RAD,
                constraints.maxZ * DEG2RAD
              ),
            };
          }
          return { index: idx };
        }).filter((l): l is NonNullable<typeof l> => l !== null);

        if (links.length > 0) {
          iks.push({
            target: targetIndex,
            effector: effectorIndex,
            links,
          });
        }
      }

      if (iks.length > 0) {
        const { CCDIKSolver } = await import('three/examples/jsm/animation/CCDIKSolver.js');
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

    // Apply native morph target influences
    for (const mesh of morphMeshes.current) {
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
      for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
        const value = morphTargets[name];
        if (value !== undefined) {
          mesh.morphTargetInfluences[index] = value;
        }
      }
    }

    // Apply IK if enabled and solver is available
    if (ikEnabled && ikSolver.current && ikTargetHelpers.current.size > 0) {
      try {
        // Update target helper positions from Redux ikTargets
        for (const target of ikTargets) {
          const helper = ikTargetHelpers.current.get(target.name);
          if (helper) {
            helper.position.set(target.position.x, target.position.y, target.position.z);
          }
        }

        // Run CCD solver
        ikSolver.current.update();

        // Post-solve: apply swing-twist constraints directly on bones.
        // We store solved rotations in a ref (not Redux) to avoid infinite
        // useFrame → dispatch → useEffect → applyPose loops.
        for (const chain of ikChains) {
          for (const boneName of chain.bones) {
            const bone = boneMap.current.get(boneName);
            const bindPose = bindPoses.current.get(boneName);
            if (!bone || !bindPose) continue;

            // Extract rotation relative to bind pose
            const relativeRot = bindPose.clone().invert().multiply(bone.quaternion.clone());

            // Apply swing-twist constraint
            const constraint = ANATOMICAL_CONSTRAINTS[boneName];
            if (constraint) {
              const constrainedQ = clampSwingTwist(relativeRot, constraint);
              bone.quaternion.copy(bindPose).multiply(constrainedQ);
              // Cache so FK section doesn't overwrite IK-solved rotations
              ikSolvedRotations.current.set(boneName, bone.quaternion.clone());
            } else {
              ikSolvedRotations.current.set(boneName, bone.quaternion.clone());
            }
          }
        }
      } catch (error) {
        console.warn('[AvatarModel] IK solving failed:', error);
      }
    } else {
      // Clear IK-solved rotations when IK is disabled
      ikSolvedRotations.current.clear();
    }
  };

  // Apply pose reactively when joints or measurements change
  useEffect(() => {
    if (boneMap.current.size > 0) {
      applyPose.current();
      groupRef.current?.updateMatrixWorld(true); // flush bone.quaternion → matrixWorld before reading world dirs
      const armDir = (boneName: string, childName: string): [number, number, number] | null => {
        const bone = boneMap.current.get(boneName);
        const child = boneMap.current.get(childName);
        if (!bone) return null;
        const a = new THREE.Vector3(); bone.getWorldPosition(a);
        if (child) {
          const b = new THREE.Vector3(); child.getWorldPosition(b);
          const d = b.sub(a).normalize();
          if (d.lengthSq() > 1e-8) return [d.x, d.y, d.z];
        }
        const q = new THREE.Quaternion(); bone.getWorldQuaternion(q);
        const d = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize();
        return [d.x, d.y, d.z];
      };
      const left = armDir('LeftArm', 'LeftForeArm');
      const right = armDir('RightArm', 'RightForeArm');
      // ready = "pose applied", not "both arm dirs resolved": armDir may return null on a non-standard rig; buildAxisHints then yields {} → T-pose default (graceful).
      dispatch(setArmAxis({ left, right, ready: true }));
    }
  }, [joints, measurements, morphTargets, dispatch]);

  // Also apply every frame for smooth animation + VRM spring bones
  useFrame((_, delta) => {
    applyPose.current();
    if (vrmInstance) {
      vrmInstance.update(delta);
    }
  });

  // Apply avatar render style whenever the scene or style changes
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    // Use the active scene (first child of group)
    const scene = group.children[0] as THREE.Object3D | undefined;
    if (!scene) return;

    scene.visible = avatarRenderStyle !== 'hidden';
    if (avatarRenderStyle === 'hidden') return;

    scene.renderOrder = avatarRenderStyle === 'xray' ? 1 : 0;
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat?.isMeshStandardMaterial) return;
      switch (avatarRenderStyle) {
        case 'visible':
          mat.opacity = 1.0; mat.transparent = false; mat.depthWrite = true;
          mat.color?.setHex(0xffffff); mat.emissive?.setHex(0x000000); mat.emissiveIntensity = 0; break;
        case 'xray':
          mat.opacity = 0.3; mat.transparent = true; mat.depthWrite = false;
          mat.emissive?.setHex(0x000000); mat.emissiveIntensity = 0; break;
        case 'wireframe':
          mat.opacity = 0.8; mat.transparent = true; mat.depthWrite = true;
          mat.color?.setHex(0x000000); mat.emissive?.setHex(0x111111);
          mat.emissiveIntensity = 1; mat.roughness = 1; break;
      }
      mat.needsUpdate = true;
    });
  }, [importedScene, avatarRenderStyle]);

  return <group ref={groupRef} onPointerDown={onPointerDown} userData={{ opencloRole: 'avatar' }} />;
}
