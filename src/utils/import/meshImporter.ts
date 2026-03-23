/**
 * Unified 3D mesh importer — OBJ, FBX, GLTF/GLB, VRM.
 *
 * Handles format detection, auto-scaling (mm/cm/m/inches → mm),
 * normal validation, and skeleton extraction.
 *
 * @module meshImporter
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadVRM } from '../avatar/vrmLoader';

// ─── Types ──────────────────────────────────────────────────────────────────

export type MeshFormat = 'obj' | 'fbx' | 'glb' | 'gltf' | 'vrm' | 'unknown';

export type ScaleUnit = 'mm' | 'cm' | 'm' | 'inches';

export interface ImportResult {
  scene: THREE.Group;
  format: MeshFormat;
  detectedUnit: ScaleUnit;
  appliedScale: number;
  boundingBox: THREE.Box3;
  /** Height in mm after scaling */
  heightMm: number;
  hasSkeleton: boolean;
  boneCount: number;
  meshCount: number;
  vertexCount: number;
  warnings: string[];
}

export interface ImportLimits {
  /** Maximum file size in bytes before parsing (default: 50MB) */
  maxFileSizeBytes: number;
  /** Maximum vertex count after parsing (default: 500_000) */
  maxVertexCount: number;
  /** Maximum triangle count after parsing (default: 1_000_000) */
  maxTriangleCount: number;
}

export const DEFAULT_IMPORT_LIMITS: ImportLimits = {
  maxFileSizeBytes: 50 * 1024 * 1024, // 50 MB
  maxVertexCount: 500_000,
  maxTriangleCount: 1_000_000,
};

export type ImportLimitViolation =
  | { kind: 'fileSize'; actualBytes: number; limitBytes: number }
  | { kind: 'vertexCount'; actual: number; limit: number }
  | { kind: 'triangleCount'; actual: number; limit: number };

export class MeshImportLimitError extends Error {
  public readonly violation: ImportLimitViolation;

  constructor(violation: ImportLimitViolation) {
    const msg = MeshImportLimitError.formatMessage(violation);
    super(msg);
    this.name = 'MeshImportLimitError';
    this.violation = violation;
  }

  private static formatMessage(v: ImportLimitViolation): string {
    switch (v.kind) {
      case 'fileSize': {
        const actualMB = (v.actualBytes / (1024 * 1024)).toFixed(1);
        const limitMB = (v.limitBytes / (1024 * 1024)).toFixed(1);
        return `File size ${actualMB} MB exceeds limit of ${limitMB} MB`;
      }
      case 'vertexCount':
        return `Vertex count ${v.actual.toLocaleString()} exceeds limit of ${v.limit.toLocaleString()}`;
      case 'triangleCount':
        return `Triangle count ${v.actual.toLocaleString()} exceeds limit of ${v.limit.toLocaleString()}`;
    }
  }
}

export interface ImportOptions {
  /** Target height in mm (default: 1800 = 180cm). Set to 0 to skip auto-scale. */
  targetHeightMm?: number;
  /** Force a specific unit instead of auto-detecting */
  forceUnit?: ScaleUnit;
  /** Auto-fix flipped normals */
  fixNormals?: boolean;
  /** Mesh size/complexity limits. Pass `false` to disable all checks. */
  limits?: Partial<ImportLimits> | false;
  /** Skip limit checks (e.g. user chose to proceed after warning). */
  skipLimits?: boolean;
}

// ─── Format Detection ───────────────────────────────────────────────────────

export function detectFormat(filename: string): MeshFormat {
  const ext = filename.toLowerCase().split('.').pop() || '';
  switch (ext) {
    case 'obj': return 'obj';
    case 'fbx': return 'fbx';
    case 'glb': return 'glb';
    case 'gltf': return 'gltf';
    case 'vrm': return 'vrm';
    default: return 'unknown';
  }
}

// ─── Unit Detection ─────────────────────────────────────────────────────────

const UNIT_SCALE_TO_MM: Record<ScaleUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  inches: 25.4,
};

/**
 * Heuristic: detect the unit based on bounding box height.
 * Assumes the model is a human-ish figure (1.5m–2.1m).
 */
export function detectUnit(bbox: THREE.Box3): ScaleUnit {
  const height = bbox.max.y - bbox.min.y;

  // If height is 1.5–2.5, it's meters
  if (height >= 1.2 && height <= 2.5) return 'm';
  // If height is 150–250, it's centimeters
  if (height >= 120 && height <= 250) return 'cm';
  // If height is 1500–2500, it's millimeters
  if (height >= 1200 && height <= 2500) return 'mm';
  // If height is 60–100, likely inches
  if (height >= 50 && height <= 100) return 'inches';

  // FBX files from Maya/Mixamo are often in cm
  if (height >= 50 && height <= 300) return 'cm';
  // Default: if very small, assume meters; if very large, assume mm
  if (height < 10) return 'm';
  return 'mm';
}

// ─── Normal Validation ──────────────────────────────────────────────────────

function fixNormals(scene: THREE.Group): number {
  let fixed = 0;
  scene.traverse(obj => {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      const geo = obj.geometry;
      if (!geo.attributes.normal) {
        geo.computeVertexNormals();
        fixed++;
      }
    }
  });
  return fixed;
}

// ─── Mesh Stats ─────────────────────────────────────────────────────────────

function collectStats(scene: THREE.Group): { meshCount: number; vertexCount: number; hasSkeleton: boolean; boneCount: number } {
  let meshCount = 0;
  let vertexCount = 0;
  let hasSkeleton = false;
  let boneCount = 0;

  scene.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      meshCount++;
      vertexCount += obj.geometry.attributes.position?.count || 0;
    }
    if (obj instanceof THREE.SkinnedMesh) {
      hasSkeleton = true;
    }
    if (obj instanceof THREE.Bone) {
      boneCount++;
    }
  });

  return { meshCount, vertexCount, hasSkeleton, boneCount };
}

// ─── Loaders ────────────────────────────────────────────────────────────────

async function loadOBJ(url: string): Promise<THREE.Group> {
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
  const loader = new OBJLoader();
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

async function loadFBX(url: string): Promise<THREE.Group> {
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  const loader = new FBXLoader();
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

async function loadGLTF(url: string): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene as THREE.Group),
      undefined,
      reject,
    );
  });
}

// ─── Limit Helpers ─────────────────────────────────────────────────────────

function resolveLimits(options: ImportOptions): ImportLimits | null {
  if (options.skipLimits || options.limits === false) return null;
  if (!options.limits) return DEFAULT_IMPORT_LIMITS;
  return { ...DEFAULT_IMPORT_LIMITS, ...options.limits };
}

async function checkFileSize(url: string, limits: ImportLimits): Promise<void> {
  let sizeBytes: number | null = null;

  if (url.startsWith('blob:')) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      sizeBytes = blob.size;
    } catch {
      // Can't determine size — skip check
      return;
    }
  } else if (url.startsWith('data:')) {
    // data URLs: estimate from base64 length
    const commaIdx = url.indexOf(',');
    if (commaIdx !== -1) {
      const b64 = url.slice(commaIdx + 1);
      sizeBytes = Math.ceil(b64.length * 0.75);
    }
  } else {
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      const cl = resp.headers.get('Content-Length');
      if (cl) sizeBytes = parseInt(cl, 10);
    } catch {
      // Network issue on HEAD — skip check, let loader handle it
      return;
    }
  }

  if (sizeBytes != null && sizeBytes > limits.maxFileSizeBytes) {
    throw new MeshImportLimitError({
      kind: 'fileSize',
      actualBytes: sizeBytes,
      limitBytes: limits.maxFileSizeBytes,
    });
  }
}

function checkGeometryLimits(
  scene: THREE.Group,
  limits: ImportLimits,
): void {
  let vertexCount = 0;
  let triangleCount = 0;

  scene.traverse(obj => {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      vertexCount += obj.geometry.attributes.position?.count || 0;
      const idx = obj.geometry.index;
      if (idx) {
        triangleCount += idx.count / 3;
      } else {
        triangleCount += (obj.geometry.attributes.position?.count || 0) / 3;
      }
    }
  });

  if (vertexCount > limits.maxVertexCount) {
    throw new MeshImportLimitError({
      kind: 'vertexCount',
      actual: vertexCount,
      limit: limits.maxVertexCount,
    });
  }

  if (triangleCount > limits.maxTriangleCount) {
    throw new MeshImportLimitError({
      kind: 'triangleCount',
      actual: triangleCount,
      limit: limits.maxTriangleCount,
    });
  }
}

// ─── Main Import Function ───────────────────────────────────────────────────

/**
 * Import a 3D mesh from any supported format.
 * Returns a normalized THREE.Group ready for use as an avatar/collision body.
 *
 * Enforces configurable size/complexity limits by default.
 * Throws `MeshImportLimitError` when a limit is exceeded — callers can
 * catch it, present a warning, and retry with `{ skipLimits: true }`.
 */
export async function importMesh(
  url: string,
  filename: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const {
    targetHeightMm = 1800,
    forceUnit,
    fixNormals: doFixNormals = true,
  } = options;

  const limits = resolveLimits(options);
  const format = detectFormat(filename);
  const warnings: string[] = [];

  if (format === 'unknown') {
    throw new Error(`Unsupported format: ${filename}. Supported: .obj, .fbx, .glb, .gltf, .vrm`);
  }

  // Pre-parse: check file size
  if (limits) {
    await checkFileSize(url, limits);
  }

  // Load based on format
  let scene: THREE.Group;

  switch (format) {
    case 'vrm': {
      // VRM uses its own loader
      const vrm = await loadVRM(url);
      scene = vrm.scene as THREE.Group;
      break;
    }
    case 'obj':
      scene = await loadOBJ(url);
      break;
    case 'fbx':
      scene = await loadFBX(url);
      break;
    case 'glb':
    case 'gltf':
      scene = await loadGLTF(url);
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  // Post-parse: check vertex/triangle counts
  if (limits) {
    checkGeometryLimits(scene, limits);
  }

  // Compute bounding box
  const bbox = new THREE.Box3().setFromObject(scene);
  const rawHeight = bbox.max.y - bbox.min.y;

  // Detect unit
  const detectedUnit = forceUnit || detectUnit(bbox);
  const unitScale = UNIT_SCALE_TO_MM[detectedUnit];

  // Convert to mm
  if (unitScale !== 1) {
    scene.scale.multiplyScalar(unitScale);
    scene.updateMatrixWorld(true);
    bbox.setFromObject(scene);
  }

  // Auto-scale to target height
  let appliedScale = unitScale;
  const currentHeightMm = bbox.max.y - bbox.min.y;

  if (targetHeightMm > 0 && currentHeightMm > 0) {
    const heightScale = targetHeightMm / currentHeightMm;
    // Only auto-scale if the ratio is unreasonable (>2x or <0.5x off)
    if (heightScale > 2 || heightScale < 0.5) {
      scene.scale.multiplyScalar(heightScale);
      scene.updateMatrixWorld(true);
      bbox.setFromObject(scene);
      appliedScale *= heightScale;
      warnings.push(
        `Auto-scaled by ${heightScale.toFixed(2)}x (detected ${detectedUnit}, raw height ${rawHeight.toFixed(0)}${detectedUnit})`
      );
    }
  }

  // Center at origin (feet on ground)
  const finalBbox = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  finalBbox.getCenter(center);
  scene.position.set(-center.x, -finalBbox.min.y, -center.z);

  // Fix normals
  if (doFixNormals) {
    const fixedCount = fixNormals(scene);
    if (fixedCount > 0) {
      warnings.push(`Computed normals for ${fixedCount} mesh(es) missing normals`);
    }
  }

  // Collect stats
  const stats = collectStats(scene);
  const heightMm = finalBbox.max.y - finalBbox.min.y;

  return {
    scene,
    format,
    detectedUnit,
    appliedScale,
    boundingBox: finalBbox,
    heightMm,
    ...stats,
    warnings,
  };
}

/**
 * Supported file extensions for the file picker.
 */
export const SUPPORTED_EXTENSIONS = '.obj,.fbx,.glb,.gltf,.vrm';

/**
 * Check if a filename is a supported 3D format.
 */
export function isSupportedFormat(filename: string): boolean {
  return detectFormat(filename) !== 'unknown';
}
