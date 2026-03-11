/**
 * USDZ Exporter — export 3D scene as Apple USDZ for AR Quick Look.
 *
 * Uses three.js built-in USDZExporter. Maps PBR materials (MeshPhysicalMaterial)
 * to USD Preview Surface automatically.
 *
 * @module usdzExporter
 */

import * as THREE from 'three';

export interface USDZExportOptions {
  /** Filename without extension (default 'openclo-export') */
  filename?: string;
}

/**
 * Export a THREE.js object as USDZ.
 * Returns the USDZ as a Uint8Array.
 */
export async function exportToUSDZ(
  object: THREE.Object3D,
): Promise<Uint8Array> {
  const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js');
  const exporter = new USDZExporter();
  return await exporter.parseAsync(object);
}

/**
 * Download a USDZ file.
 */
export async function downloadUSDZ(
  object: THREE.Object3D,
  options: USDZExportOptions = {},
): Promise<void> {
  const { filename = 'openclo-export' } = options;
  const data = await exportToUSDZ(object);
  const blob = new Blob([data], { type: 'model/vnd.usdz+zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.usdz`;
  a.click();
  URL.revokeObjectURL(url);
}
