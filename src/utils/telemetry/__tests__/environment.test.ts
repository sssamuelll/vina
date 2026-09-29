/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEnvironment } from '../environment';

const ORIGINAL_USER_AGENT = navigator.userAgent;

describe('getEnvironment', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.querySelectorAll('script').forEach((s) => s.remove());
  });

  it('sin scripts de assets, build es undefined', () => {
    expect(getEnvironment().build).toBeUndefined();
  });

  it('con un <script src="/assets/app-abc.js"> presente, build es ese src', () => {
    const script = document.createElement('script');
    script.setAttribute('src', '/assets/app-abc.js');
    document.head.appendChild(script);

    expect(getEnvironment().build).toBe('/assets/app-abc.js');
  });

  it('flags incluye vina-use-webgpu y excluye blobs y claves ajenas', () => {
    localStorage.setItem('vina-use-webgpu', 'false');
    localStorage.setItem('vina-blob', 'x'.repeat(100));
    localStorage.setItem('otra-cosa', 'valor');

    expect(getEnvironment().flags).toEqual({ 'vina-use-webgpu': 'false' });
  });

  it('viewport y dpr son numéricos', () => {
    const env = getEnvironment();
    expect(typeof env.dpr).toBe('number');
    expect(typeof env.viewport?.w).toBe('number');
    expect(typeof env.viewport?.h).toBe('number');
  });

  describe('navigator.userAgent lanza', () => {
    afterEach(() => {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value: ORIGINAL_USER_AGENT,
      });
    });

    it('devuelve {} en vez de propagar', () => {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        get(): string {
          throw new Error('nope');
        },
      });

      expect(getEnvironment()).toEqual({});
    });
  });
});
