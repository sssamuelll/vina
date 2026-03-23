import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectFormat,
  detectUnit,
  isSupportedFormat,
  SUPPORTED_EXTENSIONS,
  DEFAULT_IMPORT_LIMITS,
  MeshImportLimitError,
  importMesh,
} from '../meshImporter';
import * as THREE from 'three';

describe('detectFormat', () => {
  it('detects OBJ', () => expect(detectFormat('model.obj')).toBe('obj'));
  it('detects FBX', () => expect(detectFormat('avatar.fbx')).toBe('fbx'));
  it('detects GLB', () => expect(detectFormat('scene.glb')).toBe('glb'));
  it('detects GLTF', () => expect(detectFormat('scene.gltf')).toBe('gltf'));
  it('detects VRM', () => expect(detectFormat('vtuber.vrm')).toBe('vrm'));
  it('returns unknown for unsupported', () => expect(detectFormat('file.stl')).toBe('unknown'));
  it('handles uppercase', () => expect(detectFormat('MODEL.OBJ')).toBe('obj'));
  it('handles paths', () => expect(detectFormat('/path/to/model.fbx')).toBe('fbx'));
});

describe('detectUnit', () => {
  function bbox(minY: number, maxY: number) {
    return new THREE.Box3(new THREE.Vector3(0, minY, 0), new THREE.Vector3(1, maxY, 0));
  }

  it('detects meters (height ~1.8)', () => expect(detectUnit(bbox(0, 1.8))).toBe('m'));
  it('detects cm (height ~170)', () => expect(detectUnit(bbox(0, 170))).toBe('cm'));
  it('detects mm (height ~1700)', () => expect(detectUnit(bbox(0, 1700))).toBe('mm'));
  it('detects inches (height ~70)', () => expect(detectUnit(bbox(0, 70))).toBe('inches'));
  it('very small defaults to meters', () => expect(detectUnit(bbox(0, 0.5))).toBe('m'));
  it('very large defaults to mm', () => expect(detectUnit(bbox(0, 5000))).toBe('mm'));
});

describe('isSupportedFormat', () => {
  it('accepts .obj', () => expect(isSupportedFormat('test.obj')).toBe(true));
  it('accepts .fbx', () => expect(isSupportedFormat('test.fbx')).toBe(true));
  it('accepts .glb', () => expect(isSupportedFormat('test.glb')).toBe(true));
  it('accepts .vrm', () => expect(isSupportedFormat('test.vrm')).toBe(true));
  it('rejects .stl', () => expect(isSupportedFormat('test.stl')).toBe(false));
  it('rejects .png', () => expect(isSupportedFormat('test.png')).toBe(false));
});

describe('SUPPORTED_EXTENSIONS', () => {
  it('includes all 5 formats', () => {
    expect(SUPPORTED_EXTENSIONS).toContain('.obj');
    expect(SUPPORTED_EXTENSIONS).toContain('.fbx');
    expect(SUPPORTED_EXTENSIONS).toContain('.glb');
    expect(SUPPORTED_EXTENSIONS).toContain('.gltf');
    expect(SUPPORTED_EXTENSIONS).toContain('.vrm');
  });
});

// ─── Import Limits ─────────────────────────────────────────────────────────

describe('DEFAULT_IMPORT_LIMITS', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_IMPORT_LIMITS.maxFileSizeBytes).toBe(50 * 1024 * 1024);
    expect(DEFAULT_IMPORT_LIMITS.maxVertexCount).toBe(500_000);
    expect(DEFAULT_IMPORT_LIMITS.maxTriangleCount).toBe(1_000_000);
  });
});

describe('MeshImportLimitError', () => {
  it('formats file size violation', () => {
    const err = new MeshImportLimitError({
      kind: 'fileSize',
      actualBytes: 100 * 1024 * 1024,
      limitBytes: 50 * 1024 * 1024,
    });
    expect(err.name).toBe('MeshImportLimitError');
    expect(err.message).toContain('100.0 MB');
    expect(err.message).toContain('50.0 MB');
    expect(err.violation.kind).toBe('fileSize');
  });

  it('formats vertex count violation', () => {
    const err = new MeshImportLimitError({
      kind: 'vertexCount',
      actual: 600_000,
      limit: 500_000,
    });
    expect(err.message).toContain('600,000');
    expect(err.message).toContain('500,000');
    expect(err.violation.kind).toBe('vertexCount');
  });

  it('formats triangle count violation', () => {
    const err = new MeshImportLimitError({
      kind: 'triangleCount',
      actual: 2_000_000,
      limit: 1_000_000,
    });
    expect(err.message).toContain('2,000,000');
    expect(err.message).toContain('1,000,000');
    expect(err.violation.kind).toBe('triangleCount');
  });

  it('is instanceof Error', () => {
    const err = new MeshImportLimitError({ kind: 'vertexCount', actual: 1, limit: 0 });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MeshImportLimitError);
  });
});

describe('importMesh — file size limit', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('rejects files exceeding size limit via HEAD Content-Length', async () => {
    // Mock fetch HEAD returning large Content-Length
    globalThis.fetch = vi.fn().mockResolvedValue({
      headers: new Headers({ 'Content-Length': String(100 * 1024 * 1024) }),
    }) as typeof fetch;

    await expect(
      importMesh('https://example.com/huge.obj', 'huge.obj', {
        limits: { maxFileSizeBytes: 10 * 1024 * 1024 },
      }),
    ).rejects.toThrow(MeshImportLimitError);

    // Verify HEAD request was made
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/huge.obj',
      { method: 'HEAD' },
    );
  });

  it('rejects data URL exceeding size limit', async () => {
    // Create a data URL with known base64 size (75% decode ratio)
    // 40 base64 chars → 30 bytes
    const data = 'data:application/octet-stream;base64,' + 'A'.repeat(40);

    await expect(
      importMesh(data, 'tiny.obj', {
        limits: { maxFileSizeBytes: 10 }, // 10 bytes limit, file is ~30 bytes
      }),
    ).rejects.toThrow(MeshImportLimitError);
  });

  it('skips size check when skipLimits is true', async () => {
    // This will fail on the loader (no real OBJ), but should NOT throw MeshImportLimitError
    globalThis.fetch = vi.fn().mockResolvedValue({
      headers: new Headers({ 'Content-Length': String(100 * 1024 * 1024) }),
    }) as typeof fetch;

    await expect(
      importMesh('https://example.com/huge.obj', 'huge.obj', { skipLimits: true }),
    ).rejects.not.toThrow(MeshImportLimitError);
  });

  it('skips size check when limits is false', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      headers: new Headers({ 'Content-Length': String(100 * 1024 * 1024) }),
    }) as typeof fetch;

    await expect(
      importMesh('https://example.com/huge.obj', 'huge.obj', { limits: false }),
    ).rejects.not.toThrow(MeshImportLimitError);
  });

  it('passes when file is within limits', async () => {
    // File is 1MB, limit is 50MB — size check passes but loader will fail (no real file)
    globalThis.fetch = vi.fn().mockResolvedValue({
      headers: new Headers({ 'Content-Length': String(1 * 1024 * 1024) }),
    }) as typeof fetch;

    // Should not throw MeshImportLimitError — will fail on loader instead
    try {
      await importMesh('https://example.com/small.obj', 'small.obj');
    } catch (err) {
      expect(err).not.toBeInstanceOf(MeshImportLimitError);
    }
  });

  it('skips size check when HEAD request fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error')) as typeof fetch;

    // Should not throw MeshImportLimitError — will fail on loader instead
    try {
      await importMesh('https://example.com/model.obj', 'model.obj');
    } catch (err) {
      expect(err).not.toBeInstanceOf(MeshImportLimitError);
    }
  });
});
