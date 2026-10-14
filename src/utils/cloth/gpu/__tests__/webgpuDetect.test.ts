/**
 * @vitest-environment jsdom
 *
 * BUG-11 (#614) regression test for the legacy → canonical localStorage
 * key migration of the WebGPU feature flag.
 *
 * The migration only handles the single `webclo-use-webgpu` →
 * `vina-use-webgpu` rename. Future key renames should NOT extend this
 * function — that would shade into a "migration helper pattern" which
 * pre-empts B6-state (Persistence). One key, one function, idempotent.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WEBGPU_FEATURE_FLAG_KEY,
  hayAdaptadorWebGPU,
  migrateLegacyWebGpuFlag,
} from '../webgpuDetect';

const LEGACY_KEY = 'webclo-use-webgpu';

beforeEach(() => {
  localStorage.clear();
});

describe('migrateLegacyWebGpuFlag (BUG-11 / #614)', () => {
  it('moves a value from the legacy key to the canonical key and removes the legacy', () => {
    localStorage.setItem(LEGACY_KEY, 'true');

    migrateLegacyWebGpuFlag();

    expect(localStorage.getItem(WEBGPU_FEATURE_FLAG_KEY)).toBe('true');
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('preserves the user-set value (false vs true) verbatim during migration', () => {
    localStorage.setItem(LEGACY_KEY, 'false');

    migrateLegacyWebGpuFlag();

    expect(localStorage.getItem(WEBGPU_FEATURE_FLAG_KEY)).toBe('false');
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('is a no-op when the legacy key is absent', () => {
    // No legacy key set, no canonical key set.
    migrateLegacyWebGpuFlag();

    expect(localStorage.getItem(WEBGPU_FEATURE_FLAG_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('does not clobber an existing canonical value with the legacy value', () => {
    // User opened a newer build first (writes canonical), then went back to an
    // older build that wrote the legacy key. The canonical wins.
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'true');
    localStorage.setItem(LEGACY_KEY, 'false');

    migrateLegacyWebGpuFlag();

    expect(localStorage.getItem(WEBGPU_FEATURE_FLAG_KEY)).toBe('true');
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('is idempotent — second call is a no-op after the first', () => {
    localStorage.setItem(LEGACY_KEY, 'true');

    migrateLegacyWebGpuFlag();
    const afterFirst = {
      canonical: localStorage.getItem(WEBGPU_FEATURE_FLAG_KEY),
      legacy: localStorage.getItem(LEGACY_KEY),
    };
    migrateLegacyWebGpuFlag();
    const afterSecond = {
      canonical: localStorage.getItem(WEBGPU_FEATURE_FLAG_KEY),
      legacy: localStorage.getItem(LEGACY_KEY),
    };

    expect(afterSecond).toEqual(afterFirst);
  });
});

// El preparador solo arma la tela de WebGPU si la cascada va a tener ese tier:
// `navigator.gpu` puede existir sin dar adaptador (GPU vetada por el navegador,
// o el Chromium sin GPU de los e2e), y entonces la cascada cae a WASM.
describe('hayAdaptadorWebGPU', () => {
  const ponerGpu = (requestAdapter: () => unknown) => { (navigator as { gpu?: unknown }).gpu = { requestAdapter }; };
  afterEach(() => { delete (navigator as { gpu?: unknown }).gpu; });

  it('sin navigator.gpu responde false, sin lanzar', async () => {
    expect((navigator as { gpu?: unknown }).gpu, 'jsdom no trae WebGPU').toBeUndefined();
    await expect(hayAdaptadorWebGPU()).resolves.toBe(false);
  });

  it.each<[string, () => unknown]>([
    ['da null', async () => null],
    ['rechaza', async () => { throw new Error('GPU vetada'); }],
    ['lanza al llamarla', () => { throw new Error('GPU vetada'); }],
  ])('si requestAdapter %s responde false', async (_, requestAdapter) => {
    ponerGpu(requestAdapter);
    await expect(hayAdaptadorWebGPU()).resolves.toBe(false);
  });

  it('con un adaptador responde true, y no vuelve a preguntar', async () => {
    const requestAdapter = vi.fn(async () => ({}));
    ponerGpu(requestAdapter);
    await expect(hayAdaptadorWebGPU()).resolves.toBe(true);
    await expect(hayAdaptadorWebGPU()).resolves.toBe(true);
    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });
});
