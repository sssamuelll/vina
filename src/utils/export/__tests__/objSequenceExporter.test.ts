import { describe, it, expect, vi } from 'vitest';
import { generateOBJSequence } from '../objSequenceExporter';

describe('generateOBJSequence', () => {
  it('creates a ZIP with correct number of frames', async () => {
    let frame = 0;
    const captureFrame = vi.fn(() => {
      frame++;
      return `# Frame ${frame}\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n`;
    });

    const zip = await generateOBJSequence({ captureFrame, frameCount: 5, fps: 24 });
    expect(zip).toBeInstanceOf(Uint8Array);
    expect(captureFrame).toHaveBeenCalledTimes(5);
  });

  it('includes metadata.json in ZIP', async () => {
    const captureFrame = vi.fn(() => 'v 0 0 0\nf 1\n');
    const zip = await generateOBJSequence({ captureFrame, frameCount: 3, fps: 30 });

    const { unzipSync } = await import('fflate');
    const files = unzipSync(zip);
    const metadataKey = Object.keys(files).find(k => k.includes('metadata.json'));
    expect(metadataKey).toBeDefined();

    const metadata = JSON.parse(new TextDecoder().decode(files[metadataKey!]));
    expect(metadata.fps).toBe(30);
    expect(metadata.frameCount).toBe(3);
  });

  it('respects abort signal', async () => {
    const controller = new AbortController();
    const captureFrame = vi.fn(() => {
      controller.abort();
      return 'v 0 0 0\nf 1\n';
    });

    await expect(
      generateOBJSequence({ captureFrame, frameCount: 100, fps: 24, abortSignal: controller.signal }),
    ).rejects.toThrow(/abort/i);
  });

  it('calls onProgress callback', async () => {
    const captureFrame = vi.fn(() => 'v 0 0 0\nf 1\n');
    const onProgress = vi.fn();

    await generateOBJSequence({ captureFrame, frameCount: 3, fps: 24, onProgress });
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
  });
});
