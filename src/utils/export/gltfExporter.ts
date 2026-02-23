/**
 * glTF/GLB Exporter — export 3D scene as glTF 2.0.
 *
 * Uses three.js built-in GLTFExporter. Supports materials, textures, skeleton.
 * Universal format: Blender, Maya, Unreal, Unity, web viewers.
 *
 * @module gltfExporter
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export interface GLTFExportOptions {
  /** Export as binary .glb (default true) */
  binary?: boolean;
  /** Include animations (default false) */
  animations?: boolean;
  /** Scale factor: mm → target unit (default 0.001 = mm→m for glTF standard) */
  scale?: number;
  /** Filename without extension */
  filename?: string;
}

/**
 * Export a THREE.js scene as glTF/GLB.
 * Returns a promise that resolves to the exported data.
 */
export async function exportToGLTF(
  object: THREE.Object3D,
  options: GLTFExportOptions = {},
): Promise<ArrayBuffer | object> {
  const { binary = true, scale = 0.001 } = options;

  // Clone and scale to meters (glTF standard)
  const clone = object.clone(true);
  if (scale !== 1) {
    clone.scale.multiplyScalar(scale);
    clone.updateMatrixWorld(true);
  }

  const exporter = new GLTFExporter();

  return new Promise((resolve, reject) => {
    exporter.parse(
      clone,
      (result) => resolve(result),
      (error) => reject(error),
      { binary },
    );
  });
}

/**
 * Download a glTF/GLB file.
 */
export async function downloadGLTF(
  object: THREE.Object3D,
  options: GLTFExportOptions = {},
): Promise<void> {
  const { binary = true, filename = 'openclo-export' } = options;
  const data = await exportToGLTF(object, options);

  let blob: Blob;
  let ext: string;

  if (binary && data instanceof ArrayBuffer) {
    blob = new Blob([data], { type: 'application/octet-stream' });
    ext = 'glb';
  } else {
    blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    ext = 'gltf';
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
