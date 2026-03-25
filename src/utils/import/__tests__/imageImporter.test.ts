import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { importReferenceImage } from '../imageImporter';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeFile = (name: string, type: string, size: number): File =>
  new File([new ArrayBuffer(size)], name, { type });

// ─── Mocks ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Mock URL.createObjectURL / revokeObjectURL
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => `blob:mock/fake-url`),
    revokeObjectURL: vi.fn(),
  });

  // Mock Image: setting .src triggers onload asynchronously with small dims
  class MockImage {
    naturalWidth = 100;
    naturalHeight = 100;
    onload: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    private _src = '';

    get src() {
      return this._src;
    }
    set src(value: string) {
      this._src = value;
      // Trigger onload on next microtask
      Promise.resolve().then(() => {
        if (this.onload) this.onload();
      });
    }
  }

  vi.stubGlobal('Image', MockImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('importReferenceImage', () => {
  it('accepts valid PNG and returns dimensions', async () => {
    const file = makeFile('photo.png', 'image/png', 1024);
    const result = await importReferenceImage(file);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('accepts valid JPEG', async () => {
    const file = makeFile('photo.jpg', 'image/jpeg', 1024);
    const result = await importReferenceImage(file);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('accepts valid WebP', async () => {
    const file = makeFile('photo.webp', 'image/webp', 1024);
    const result = await importReferenceImage(file);
    expect(result.width).toBeGreaterThan(0);
  });

  it('accepts valid SVG', async () => {
    const file = makeFile('icon.svg', 'image/svg+xml', 1024);
    const result = await importReferenceImage(file);
    expect(result.width).toBeGreaterThan(0);
  });

  it('rejects non-image file (application/pdf)', async () => {
    const file = makeFile('document.pdf', 'application/pdf', 1024);
    await expect(importReferenceImage(file)).rejects.toThrow(
      /unsupported file type/i,
    );
  });

  it('rejects file > 20MB', async () => {
    const TWENTY_ONE_MB = 21 * 1024 * 1024;
    const file = makeFile('huge.png', 'image/png', TWENTY_ONE_MB);
    await expect(importReferenceImage(file)).rejects.toThrow(/file size/i);
  });

  it('accepts exactly 20MB (boundary)', async () => {
    const TWENTY_MB = 20 * 1024 * 1024;
    const file = makeFile('edge.png', 'image/png', TWENTY_MB);
    const result = await importReferenceImage(file);
    expect(result).toBeDefined();
  });

  it('rejects one byte over 20MB', async () => {
    const OVER = 20 * 1024 * 1024 + 1;
    const file = makeFile('over.png', 'image/png', OVER);
    await expect(importReferenceImage(file)).rejects.toThrow(/file size/i);
  });

  it('returns objectUrl string', async () => {
    const file = makeFile('photo.png', 'image/png', 512);
    const result = await importReferenceImage(file);
    expect(typeof result.objectUrl).toBe('string');
    expect(result.objectUrl.length).toBeGreaterThan(0);
  });

  it('returns imageBlob', async () => {
    const file = makeFile('photo.png', 'image/png', 512);
    const result = await importReferenceImage(file);
    expect(result.imageBlob).toBeInstanceOf(Blob);
  });

  it('returns filename from File object', async () => {
    const file = makeFile('my-reference.jpg', 'image/jpeg', 512);
    const result = await importReferenceImage(file);
    expect(result.filename).toBe('my-reference.jpg');
  });

  it('rejects empty-string type', async () => {
    const file = makeFile('no-type', '', 512);
    await expect(importReferenceImage(file)).rejects.toThrow(
      /unsupported file type/i,
    );
  });

  it('rejects video/mp4', async () => {
    const file = makeFile('clip.mp4', 'video/mp4', 1024);
    await expect(importReferenceImage(file)).rejects.toThrow(
      /unsupported file type/i,
    );
  });
});
