/**
 * Artwork Compositor — composites artwork images onto a fabric base
 * color/texture using a Canvas element.
 *
 * `compositeArtwork` produces an HTMLCanvasElement suitable for use
 * as a Three.js CanvasTexture source.
 *
 * `computeArtworkTransform` is a pure function that converts artwork
 * placement (mm, piece-relative) to canvas pixel coordinates, making
 * it easy to test without browser APIs.
 *
 * @module artworkCompositor
 */

import type { PieceArtwork } from '../../types/artwork';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompositeOptions {
  /** Hex color string for the fabric base (e.g. '#ffffff') */
  fabricColor: string;
  /** Optional fabric texture image blob */
  fabricTextureBlob?: Blob;
  /** Artwork placements — array order = z-order (first drawn first) */
  artworks: PieceArtwork[];
  /** Map of imageId to Blob for each artwork image */
  artworkBlobs: Map<string, Blob>;
  /** Piece width in mm */
  pieceWidth: number;
  /** Piece height in mm */
  pieceHeight: number;
  /** Output texture resolution in px (default 2048) */
  textureSize?: number;
}

export interface ArtworkTransform {
  /** Center x in canvas pixels */
  cx: number;
  /** Center y in canvas pixels */
  cy: number;
  /** Width in canvas pixels */
  width: number;
  /** Height in canvas pixels */
  height: number;
  /** Rotation in radians */
  rotationRad: number;
}

// ─── Pure coordinate math ───────────────────────────────────────────────────

/**
 * Convert an artwork placement from mm / piece-relative coordinates
 * to canvas pixel coordinates.
 *
 * Artwork positions are relative to piece center (0,0), so we offset
 * by half the piece dimensions to map to canvas top-left origin.
 *
 * @param artwork   - The artwork placement
 * @param pieceWidth  - Piece width in mm
 * @param pieceHeight - Piece height in mm
 * @param textureSize - Canvas size in px
 * @returns Canvas-space transform
 */
export function computeArtworkTransform(
  artwork: PieceArtwork,
  pieceWidth: number,
  pieceHeight: number,
  textureSize: number,
): ArtworkTransform {
  const pxPerMm = textureSize / Math.max(pieceWidth, pieceHeight);
  const cx = (artwork.position.x + pieceWidth / 2) * pxPerMm;
  const cy = (artwork.position.y + pieceHeight / 2) * pxPerMm;
  const width = artwork.width * pxPerMm;
  const height = artwork.height * pxPerMm;
  const rotationRad = (artwork.rotation * Math.PI) / 180;
  return { cx, cy, width, height, rotationRad };
}

// ─── Canvas compositor ──────────────────────────────────────────────────────

/**
 * Composite artwork images onto a fabric base colour / texture,
 * returning an HTMLCanvasElement ready for use as a CanvasTexture.
 *
 * Steps:
 * 1. Create canvas at textureSize x textureSize.
 * 2. Fill with fabricColor.
 * 3. If fabricTextureBlob provided, draw it to fill the canvas.
 * 4. For each artwork (z-order = array order):
 *    - Load blob as ImageBitmap
 *    - Transform, rotate, apply opacity
 *    - Draw onto canvas
 * 5. Return the canvas.
 */
export async function compositeArtwork(
  options: CompositeOptions,
): Promise<HTMLCanvasElement> {
  const {
    fabricColor,
    fabricTextureBlob,
    artworks,
    artworkBlobs,
    pieceWidth,
    pieceHeight,
    textureSize = 2048,
  } = options;

  // 1. Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = textureSize;
  canvas.height = textureSize;
  const ctx = canvas.getContext('2d')!;

  // 2. Fill with fabric base color
  ctx.fillStyle = fabricColor;
  ctx.fillRect(0, 0, textureSize, textureSize);

  // 3. Draw optional fabric texture
  if (fabricTextureBlob) {
    const textureBitmap = await createImageBitmap(fabricTextureBlob);
    ctx.drawImage(textureBitmap, 0, 0, textureSize, textureSize);
    textureBitmap.close();
  }

  // 4. Draw each artwork in z-order
  for (const artwork of artworks) {
    const blob = artworkBlobs.get(artwork.imageId);
    if (!blob) continue;

    const { cx, cy, width, height, rotationRad } = computeArtworkTransform(
      artwork,
      pieceWidth,
      pieceHeight,
      textureSize,
    );

    // Force bitmap dimensions — fixes SVG blobs that lack explicit width/height
    // attributes (which produce 0x0 or 300x150 bitmaps in some browsers).
    const bitmapW = Math.max(1, Math.round(width));
    const bitmapH = Math.max(1, Math.round(height));
    const bitmap = await createImageBitmap(blob, { resizeWidth: bitmapW, resizeHeight: bitmapH });

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotationRad);
    ctx.globalAlpha = artwork.opacity;
    ctx.drawImage(bitmap, -width / 2, -height / 2, width, height);
    ctx.restore();

    bitmap.close();
  }

  // 5. Reset alpha and return
  ctx.globalAlpha = 1;
  return canvas;
}
