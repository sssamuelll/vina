/**
 * Reference image importer — validation and resize.
 *
 * Validates MIME type and file size, loads the image to read natural
 * dimensions, and downscales to MAX_DIMENSION if needed using
 * OffscreenCanvas (with HTMLCanvasElement fallback).
 *
 * @module imageImporter
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_DIMENSION = 4096;
const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImageImportResult {
  /** URL.createObjectURL(blob) — caller is responsible for revoking when done */
  objectUrl: string;
  /** Raw blob suitable for IndexedDB storage */
  imageBlob: Blob;
  /** Natural pixel width (after resize if applied) */
  width: number;
  /** Natural pixel height (after resize if applied) */
  height: number;
  filename: string;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Load an image element from a URL and resolve with natural dimensions. */
function loadImageDimensions(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = (e) => reject(new Error(`Failed to load image: ${String(e)}`));
    img.src = url;
  });
}

/**
 * Draw a blob onto a canvas at (targetW × targetH) and export as a new blob.
 * Tries OffscreenCanvas first, falls back to HTMLCanvasElement.
 */
async function resizeBlob(
  sourceBlob: Blob,
  targetW: number,
  targetH: number,
  sourceMimeType: string,
): Promise<Blob> {
  // Determine output format — preserve original if supported by canvas, else PNG
  const outputType =
    sourceMimeType === 'image/jpeg' || sourceMimeType === 'image/webp'
      ? sourceMimeType
      : 'image/png';

  const bitmap = await createImageBitmap(sourceBlob);

  // Prefer OffscreenCanvas (available in workers and modern browsers)
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context from OffscreenCanvas');
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();
    return canvas.convertToBlob({ type: outputType });
  }

  // Fallback: HTMLCanvasElement
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context from HTMLCanvasElement');
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob produced null'));
      },
      outputType,
    );
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate a user-supplied image File, optionally resize it to fit within
 * MAX_DIMENSION × MAX_DIMENSION, and return metadata and blobs needed for
 * storing the reference image.
 *
 * @throws {Error} when the file type is not accepted
 * @throws {Error} when the file exceeds MAX_FILE_SIZE
 */
export async function importReferenceImage(
  file: File,
): Promise<ImageImportResult> {
  // 1. Validate MIME type
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    throw new Error(
      `Unsupported file type: "${file.type}". Accepted types are: ${ACCEPTED_TYPES.join(', ')}.`,
    );
  }

  // 2. Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File size ${file.size} bytes exceeds the maximum allowed ${MAX_FILE_SIZE} bytes (20 MB).`,
    );
  }

  // 3. Create initial object URL and load natural dimensions
  let objectUrl = URL.createObjectURL(file);
  let imageBlob: Blob = file;

  const { width: naturalW, height: naturalH } = await loadImageDimensions(objectUrl);

  // 4. Resize if needed
  if (naturalW > MAX_DIMENSION || naturalH > MAX_DIMENSION) {
    const scale = Math.min(MAX_DIMENSION / naturalW, MAX_DIMENSION / naturalH);
    const targetW = Math.round(naturalW * scale);
    const targetH = Math.round(naturalH * scale);

    const resized = await resizeBlob(file, targetW, targetH, file.type);

    // Release the old URL now that we have the resized blob
    URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(resized);
    imageBlob = resized;

    return {
      objectUrl,
      imageBlob,
      width: targetW,
      height: targetH,
      filename: file.name,
    };
  }

  // 5. No resize needed
  return {
    objectUrl,
    imageBlob,
    width: naturalW,
    height: naturalH,
    filename: file.name,
  };
}
