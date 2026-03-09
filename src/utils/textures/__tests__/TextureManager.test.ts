import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextureManager } from '../TextureManager';

// Mock Three.js TextureLoader
function createMockTexture() {
  return {
    dispose: vi.fn(),
    colorSpace: '',
    repeat: { set: vi.fn() },
    rotation: 0,
    offset: { set: vi.fn() },
    wrapS: 0,
    wrapT: 0,
    needsUpdate: false,
  };
}

vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  return {
    ...actual as object,
    TextureLoader: class MockTextureLoader {
      loadAsync = vi.fn(async () => createMockTexture());
    },
    RepeatWrapping: 1000,
    SRGBColorSpace: 'srgb',
    LinearSRGBColorSpace: 'srgb-linear',
  };
});

describe('TextureManager', () => {
  let manager: TextureManager;

  beforeEach(() => {
    manager = new TextureManager(3); // small cache for testing
  });

  it('loads a texture and returns it', async () => {
    const tex = await manager.load('/textures/fabrics/cotton/diffuse.jpg', 'srgb');
    expect(tex).toBeDefined();
    expect(tex.dispose).toBeDefined();
  });

  it('returns cached texture on second load', async () => {
    const tex1 = await manager.load('/test.jpg', 'srgb');
    const tex2 = await manager.load('/test.jpg', 'srgb');
    expect(tex1).toBe(tex2);
  });

  it('evicts LRU entry when cache is full', async () => {
    const t1 = await manager.load('/a.jpg', 'srgb');
    await manager.load('/b.jpg', 'srgb');
    await manager.load('/c.jpg', 'srgb');
    // Cache full (3). Loading 4th should evict /a.jpg
    await manager.load('/d.jpg', 'srgb');
    expect(t1.dispose).toHaveBeenCalled();
    expect(manager.size).toBe(3);
  });

  it('disposes all textures on clear', async () => {
    const t1 = await manager.load('/a.jpg', 'srgb');
    const t2 = await manager.load('/b.jpg', 'srgb');
    manager.clear();
    expect(t1.dispose).toHaveBeenCalled();
    expect(t2.dispose).toHaveBeenCalled();
    expect(manager.size).toBe(0);
  });
});
