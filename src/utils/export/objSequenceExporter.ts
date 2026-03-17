/**
 * OBJ Sequence Exporter — frame-by-frame mesh export for VFX pipelines.
 *
 * Outputs a ZIP containing:
 * - sequence/frame_0001.obj, frame_0002.obj, ...
 * - metadata.json with fps, frameCount, duration
 */
import { zipSync, strToU8 } from 'fflate';

export interface OBJSequenceOptions {
  /** Function that captures the current frame as OBJ string */
  captureFrame: () => string;
  /** Total number of frames to capture */
  frameCount: number;
  /** Frames per second (for metadata) */
  fps: number;
  /** Progress callback (currentFrame, totalFrames) */
  onProgress?: (current: number, total: number) => void;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Generate a ZIP containing an OBJ sequence + metadata.
 */
export async function generateOBJSequence(
  opts: OBJSequenceOptions,
): Promise<Uint8Array> {
  const { captureFrame, frameCount, fps, onProgress, abortSignal } = opts;

  const files: Record<string, Uint8Array> = {};

  for (let i = 0; i < frameCount; i++) {
    if (abortSignal?.aborted) {
      throw new Error('Export aborted');
    }

    const objString = captureFrame();
    const frameName = `sequence/frame_${String(i + 1).padStart(4, '0')}.obj`;
    files[frameName] = strToU8(objString);

    onProgress?.(i + 1, frameCount);

    // Yield to event loop for responsiveness
    await new Promise(r => setTimeout(r, 0));
  }

  // Metadata
  const metadata = {
    fps,
    frameCount,
    duration: frameCount / fps,
    exportedAt: new Date().toISOString(),
    format: 'OBJ Sequence',
  };
  files['metadata.json'] = strToU8(JSON.stringify(metadata, null, 2));

  return zipSync(files);
}

/** Trigger browser download of OBJ sequence ZIP. */
export function downloadOBJSequence(
  zip: Uint8Array,
  filename = 'simulation-sequence.zip',
) {
  const blob = new Blob([zip], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
