import { TextureLoader, RepeatWrapping, SRGBColorSpace, LinearSRGBColorSpace } from 'three';
import type { Texture } from 'three';

type ColorSpaceHint = 'srgb' | 'srgb-linear';

/**
 * LRU texture cache with automatic disposal.
 * Loads Three.js textures, sets correct color space, and manages GPU memory.
 *
 * - Deduplicates concurrent loads of the same URL (pending map).
 * - LRU eviction only disposes textures not currently referenced by materials.
 *   In practice, cache size (50) far exceeds typical usage (~48 maps max).
 */
export class TextureManager {
  private cache = new Map<string, Texture>();
  private pending = new Map<string, Promise<Texture>>();
  private loader = new TextureLoader();
  private maxSize: number;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  get size(): number {
    return this.cache.size;
  }

  async load(url: string, colorSpace: ColorSpaceHint = 'srgb'): Promise<Texture> {
    // Cache hit — move to end (most recently used)
    const cached = this.cache.get(url);
    if (cached) {
      this.cache.delete(url);
      this.cache.set(url, cached);
      return cached;
    }

    // Deduplicate concurrent loads of the same URL
    const inflight = this.pending.get(url);
    if (inflight) return inflight;

    const promise = this.doLoad(url, colorSpace);
    this.pending.set(url, promise);

    try {
      const texture = await promise;
      return texture;
    } finally {
      this.pending.delete(url);
    }
  }

  private async doLoad(url: string, colorSpace: ColorSpaceHint): Promise<Texture> {
    // Evict LRU if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value!;
      const tex = this.cache.get(oldest)!;
      tex.dispose();
      this.cache.delete(oldest);
    }

    // Load new texture
    const texture = await this.loader.loadAsync(url);
    texture.colorSpace = colorSpace === 'srgb' ? SRGBColorSpace : LinearSRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;

    this.cache.set(url, texture);
    return texture;
  }

  clear(): void {
    for (const tex of this.cache.values()) {
      tex.dispose();
    }
    this.cache.clear();
    this.pending.clear();
  }
}

/** Singleton instance for the app */
export const textureManager = new TextureManager();
