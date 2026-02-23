/**
 * OBJ Exporter — export 3D mesh data as Wavefront OBJ.
 *
 * Supports vertices, faces, normals, UVs, and multi-material groups.
 * Simple format that works everywhere (Blender, Maya, Rhino, ZBrush).
 *
 * @module objExporter
 */

import * as THREE from 'three';

export interface OBJExportOptions {
  /** Scale factor: mm → target unit (default 0.1 = mm→cm) */
  scale?: number;
  /** Include normals (default true) */
  normals?: boolean;
  /** Include UVs (default true) */
  uvs?: boolean;
  /** Filename without extension */
  filename?: string;
}

/**
 * Export a THREE.js scene/group as OBJ string.
 */
export function exportToOBJ(
  object: THREE.Object3D,
  options: OBJExportOptions = {},
): string {
  const { scale = 0.1, normals = true, uvs = true } = options;

  const lines: string[] = [];
  lines.push('# OpenClo OBJ Export');
  lines.push(`# Scale: ${scale} (1 unit = ${(1 / scale).toFixed(0)}mm)`);
  lines.push('');

  let vertexOffset = 0;
  let normalOffset = 0;
  let uvOffset = 0;

  object.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geo = obj.geometry;
    if (!geo) return;

    const positions = geo.attributes.position;
    const normalAttr = geo.attributes.normal;
    const uvAttr = geo.attributes.uv;
    const index = geo.index;

    if (!positions) return;

    // Object name
    const name = obj.name || `mesh_${vertexOffset}`;
    lines.push(`o ${name}`);

    // Apply world matrix to positions
    const worldMatrix = obj.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);

    // Vertices
    for (let i = 0; i < positions.count; i++) {
      const v = new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i));
      v.applyMatrix4(worldMatrix);
      v.multiplyScalar(scale);
      lines.push(`v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}`);
    }

    // Normals
    if (normals && normalAttr) {
      for (let i = 0; i < normalAttr.count; i++) {
        const n = new THREE.Vector3(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i));
        n.applyMatrix3(normalMatrix).normalize();
        lines.push(`vn ${n.x.toFixed(6)} ${n.y.toFixed(6)} ${n.z.toFixed(6)}`);
      }
    }

    // UVs
    if (uvs && uvAttr) {
      for (let i = 0; i < uvAttr.count; i++) {
        lines.push(`vt ${uvAttr.getX(i).toFixed(6)} ${uvAttr.getY(i).toFixed(6)}`);
      }
    }

    // Faces
    const hasNormals = normals && normalAttr;
    const hasUVs = uvs && uvAttr;

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i) + 1 + vertexOffset;
        const b = index.getX(i + 1) + 1 + vertexOffset;
        const c = index.getX(i + 2) + 1 + vertexOffset;

        if (hasNormals && hasUVs) {
          const na = index.getX(i) + 1 + normalOffset;
          const nb = index.getX(i + 1) + 1 + normalOffset;
          const nc = index.getX(i + 2) + 1 + normalOffset;
          const ua = index.getX(i) + 1 + uvOffset;
          const ub = index.getX(i + 1) + 1 + uvOffset;
          const uc = index.getX(i + 2) + 1 + uvOffset;
          lines.push(`f ${a}/${ua}/${na} ${b}/${ub}/${nb} ${c}/${uc}/${nc}`);
        } else if (hasNormals) {
          const na = index.getX(i) + 1 + normalOffset;
          const nb = index.getX(i + 1) + 1 + normalOffset;
          const nc = index.getX(i + 2) + 1 + normalOffset;
          lines.push(`f ${a}//${na} ${b}//${nb} ${c}//${nc}`);
        } else {
          lines.push(`f ${a} ${b} ${c}`);
        }
      }
    } else {
      for (let i = 0; i < positions.count; i += 3) {
        const a = i + 1 + vertexOffset;
        const b = i + 2 + vertexOffset;
        const c = i + 3 + vertexOffset;
        lines.push(`f ${a} ${b} ${c}`);
      }
    }

    vertexOffset += positions.count;
    if (normalAttr) normalOffset += normalAttr.count;
    if (uvAttr) uvOffset += uvAttr.count;
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Download an OBJ file.
 */
export function downloadOBJ(
  object: THREE.Object3D,
  options: OBJExportOptions = {},
): void {
  const obj = exportToOBJ(object, options);
  const blob = new Blob([obj], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${options.filename || 'openclo-export'}.obj`;
  a.click();
  URL.revokeObjectURL(url);
}
