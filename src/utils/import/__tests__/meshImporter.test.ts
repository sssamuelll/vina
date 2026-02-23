import { describe, it, expect } from 'vitest';
import { detectFormat, detectUnit, isSupportedFormat, SUPPORTED_EXTENSIONS } from '../meshImporter';
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
