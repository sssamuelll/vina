// src/utils/export/animationExporter.ts
import type { AnimationTrack } from '../animation/types';
import { interpolate } from '../animation/interpolation';
import type { SimRecorderHandle } from '../../hooks/useSimulationRecorder';
import * as THREE from 'three';
import type { AnyRenderer } from '../../types/renderer';

export interface AnimationExportOptions {
  renderer: AnyRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  tracks: AnimationTrack[];
  fps: number;
  duration: number;
  width: number;
  height: number;
  transparent: boolean;
  recorder: SimRecorderHandle | null;
  clothMesh: THREE.Mesh | null;
  onProgress?: (frame: number, total: number) => void;
  abortSignal?: AbortSignal;
}

export async function exportAnimation(opts: AnimationExportOptions): Promise<Blob> {
  const {
    renderer, scene, camera, tracks, fps, duration,
    width, height, transparent, recorder, clothMesh,
    onProgress, abortSignal,
  } = opts;

  const totalFrames = Math.floor(duration * fps);

  // Save original state
  const originalSize = renderer.getSize(new THREE.Vector2());
  const originalCamPos = camera.position.clone();
  const originalCamFov = camera.fov;
  const originalBg = scene.background;

  // Setup offscreen canvas for MediaRecorder
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;

  // Setup render target at export resolution
  const renderTarget = new THREE.RenderTarget(width, height, {
    format: transparent ? THREE.RGBAFormat : THREE.RGBFormat,
  });

  if (transparent) {
    scene.background = null;
  }

  // MediaRecorder setup
  const stream = offscreen.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks: BlobPart[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const recordingDone = new Promise<Blob>((resolve) => {
    mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });
  mediaRecorder.start();

  // Render each frame
  for (let frame = 0; frame < totalFrames; frame++) {
    if (abortSignal?.aborted) {
      mediaRecorder.stop();
      break;
    }

    // Apply recorded cloth positions
    if (recorder && clothMesh && frame < recorder.frameCount) {
      const frameData = recorder.getFrame(frame);
      if (frameData) {
        const posAttr = clothMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        if (posAttr && posAttr.array.length === frameData.length) {
          (posAttr.array as Float32Array).set(frameData);
          posAttr.needsUpdate = true;
          clothMesh.geometry.computeVertexNormals();
        }
      }
    }

    // Apply interpolated keyframe values
    for (const track of tracks) {
      for (const prop of track.properties) {
        if (prop.keyframes.length === 0) continue;
        const val = interpolate(prop.keyframes, frame);
        if (val === undefined) continue;

        if (track.objectType === 'camera') {
          switch (prop.path) {
            case 'position.x': camera.position.x = val; break;
            case 'position.y': camera.position.y = val; break;
            case 'position.z': camera.position.z = val; break;
            case 'fov':
              camera.fov = val;
              camera.updateProjectionMatrix();
              break;
          }
        }
      }
    }

    // Render
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // Read pixels to offscreen canvas
    const buffer = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer);

    const imageData = ctx.createImageData(width, height);
    // Flip Y (WebGL is bottom-up)
    for (let y = 0; y < height; y++) {
      const srcRow = (height - y - 1) * width * 4;
      const dstRow = y * width * 4;
      imageData.data.set(buffer.subarray(srcRow, srcRow + width * 4), dstRow);
    }
    ctx.putImageData(imageData, 0, 0);

    onProgress?.(frame + 1, totalFrames);
    await new Promise(r => setTimeout(r, 1000 / fps));
  }

  if (!abortSignal?.aborted) {
    mediaRecorder.stop();
  }

  // Restore state
  camera.position.copy(originalCamPos);
  camera.fov = originalCamFov;
  camera.updateProjectionMatrix();
  scene.background = originalBg;
  renderer.setSize(originalSize.x, originalSize.y);
  renderTarget.dispose();

  return recordingDone;
}
