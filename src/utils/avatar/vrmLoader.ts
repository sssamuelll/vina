/**
 * VRM avatar loader — loads .vrm files using @pixiv/three-vrm.
 * VRM is GLTF-based, so the resulting scene contains standard THREE.SkinnedMesh objects.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';

export interface VRMLoadResult {
  scene: THREE.Group;
  vrm: VRM;
  isVRM: true;
}

/**
 * Check if a filename/URL is a VRM file.
 */
export function isVRMFile(filename: string): boolean {
  return /\.vrm(\?.*)?$/i.test(filename);
}

/**
 * Load a VRM file and return the scene + VRM instance.
 */
export async function loadVRM(url: string): Promise<VRMLoadResult> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm as VRM;

  if (!vrm) {
    throw new Error('Failed to load VRM data from file');
  }

  return {
    scene: gltf.scene as THREE.Group,
    vrm,
    isVRM: true,
  };
}

/**
 * Mapping from VRM humanoid bone names to the bone names used in AvatarModel.tsx (Mixamo-style).
 * Key = VRM humanoid bone name, Value = existing bone name in GLB models.
 */
export const VRM_TO_MIXAMO_BONE_MAP: Record<string, string> = {
  hips: 'Hips',
  spine: 'Spine',
  chest: 'Spine1',
  upperChest: 'Spine2',
  neck: 'Neck',
  head: 'Head',
  leftShoulder: 'LeftShoulder',
  leftUpperArm: 'LeftArm',
  leftLowerArm: 'LeftForeArm',
  leftHand: 'LeftHand',
  rightShoulder: 'RightShoulder',
  rightUpperArm: 'RightArm',
  rightLowerArm: 'RightForeArm',
  rightHand: 'RightHand',
  leftUpperLeg: 'LeftUpLeg',
  leftLowerLeg: 'LeftLeg',
  leftFoot: 'LeftFoot',
  leftToes: 'LeftToeBase',
  rightUpperLeg: 'RightUpLeg',
  rightLowerLeg: 'RightLeg',
  rightFoot: 'RightFoot',
  rightToes: 'RightToeBase',
};

/**
 * Reverse mapping: Mixamo bone name → VRM humanoid bone name.
 */
export const MIXAMO_TO_VRM_BONE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(VRM_TO_MIXAMO_BONE_MAP).map(([vrm, mixamo]) => [mixamo, vrm])
);
