import * as THREE from 'three';
import type { AnyRenderer } from '../../types/renderer';
import { sobreElPapel } from './sobreElPapel';

export interface StillExportConfig {
  width: number;
  height: number;
  transparent?: boolean;
  filename?: string;
  format?: 'png' | 'jpeg' | 'webp' | 'exr';
  jpegQuality?: number;   // 0.1-1.0
  samplesPerPixel?: number;
  denoiserEnabled?: boolean;
}

function timestampedFilename(ext: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const HH = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `vina-render-${yyyy}-${mm}-${dd}-${HH}${min}${ss}.${ext}`;
}

export async function exportStill(
  renderer: AnyRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  config: StillExportConfig,
): Promise<void> {
  const {
    width,
    height,
    transparent = false,
    filename,
    format = 'png',
    jpegQuality = 0.92,
  } = config;

  // Save state
  const originalBackground = scene.background;
  const originalSize = new THREE.Vector2();
  renderer.getSize(originalSize);
  const originalClearAlpha = renderer.getClearAlpha();
  const originalAspect = camera.aspect;

  // Create render target
  const renderTarget = new THREE.RenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });

  if (transparent) {
    scene.background = null;
    renderer.setClearAlpha(0);
  }

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  // Render
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  // Read pixels (async for WebGPU, sync fallback for WebGL)
  const pixels = new Uint8Array(width * height * 4);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = renderer as any;
  if (typeof r.readRenderTargetPixelsAsync === 'function') {
    const result = await r.readRenderTargetPixelsAsync(renderTarget, 0, 0, width, height);
    pixels.set(new Uint8Array(result.buffer));
  } else {
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);
  }

  // Restore
  renderer.setRenderTarget(null);
  scene.background = originalBackground;
  renderer.setClearAlpha(originalClearAlpha);
  camera.aspect = originalAspect;
  camera.updateProjectionMatrix();

  // Flip vertically (WebGL bottom-up) and put into canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = y * width * 4;
    imageData.data.set(pixels.subarray(srcRow, srcRow + width * 4), dstRow);
  }
  ctx.putImageData(imageData, 0, 0);

  // Con el fondo «Papel» el visor es transparente: salvo que se pida así, la
  // imagen sale sobre el papel (en JPEG, lo transparente saldría negro).
  const imagen = transparent ? canvas : sobreElPapel(canvas);

  // Encode and download based on format
  if (format === 'exr') {
    try {
      const { EXRExporter } = await import('three/examples/jsm/exporters/EXRExporter.js');
      const exporter = new EXRExporter();
      // EXRExporter expects a DataTexture or similar — fall back to PNG if it fails
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exrData = await (exporter.parse as any)(renderer, renderTarget);
      renderTarget.dispose();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = new Blob([exrData as any], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = filename || timestampedFilename('exr');
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      return;
    } catch {
      console.warn('[stillExporter] EXRExporter unavailable, falling back to PNG');
      // Fall through to PNG below
    }
  }

  renderTarget.dispose();

  const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  const ext = format === 'jpeg' ? 'jpg' : format === 'webp' ? 'webp' : 'png';
  const quality = format === 'jpeg' ? jpegQuality : undefined;

  const blob = await new Promise<Blob>((resolve, reject) =>
    imagen.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      mimeType,
      quality,
    ),
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename || timestampedFilename(ext);
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export type ViewAngle = 'front' | 'back' | 'left' | 'right';

const VIEW_POSITIONS: Record<ViewAngle, [number, number, number]> = {
  front: [0, 0.8, 2.8],
  back: [0, 0.8, -2.8],
  left: [-2.8, 0.8, 0],
  right: [2.8, 0.8, 0],
};

export async function exportAllViews(
  renderer: AnyRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  config: Omit<StillExportConfig, 'filename'>,
): Promise<void> {
  const target = new THREE.Vector3(0, 0.75, 0);
  const originalPos = camera.position.clone();
  const ext = config.format === 'jpeg' ? 'jpg' : config.format === 'webp' ? 'webp' : (config.format ?? 'png');

  for (const [view, pos] of Object.entries(VIEW_POSITIONS) as [ViewAngle, [number, number, number]][]) {
    camera.position.set(...pos);
    camera.lookAt(target);
    await exportStill(renderer, scene, camera, {
      ...config,
      filename: `vina-${view}-${config.width}x${config.height}.${ext}`,
    });
  }

  camera.position.copy(originalPos);
  camera.lookAt(target);
}
