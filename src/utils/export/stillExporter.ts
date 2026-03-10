import * as THREE from 'three';
import type { AnyRenderer } from '../../types/renderer';

export interface StillExportConfig {
  width: number;
  height: number;
  transparent?: boolean;
  filename?: string;
}

export async function exportStill(
  renderer: AnyRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  config: StillExportConfig,
): Promise<void> {
  const { width, height, transparent = false, filename } = config;

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
  renderTarget.dispose();

  // Flip vertically (WebGL bottom-up) and encode PNG
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

  const link = document.createElement('a');
  link.download = filename || `openclo-render-${width}x${height}-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
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

  for (const [view, pos] of Object.entries(VIEW_POSITIONS) as [ViewAngle, [number, number, number]][]) {
    camera.position.set(...pos);
    camera.lookAt(target);
    await exportStill(renderer, scene, camera, {
      ...config,
      filename: `openclo-${view}-${config.width}x${config.height}.png`,
    });
  }

  camera.position.copy(originalPos);
  camera.lookAt(target);
}
