import * as THREE from 'three';
import type { AnyRenderer } from '../../types/renderer';

export interface TurntableConfig {
  frameCount: number;       // 12, 24, 36, 72
  direction: 'cw' | 'ccw';
  width?: number;           // render width (default: canvas width)
  height?: number;          // render height (default: canvas height)
  fps?: number;             // default 30
  videoFormat?: 'webm' | 'mp4';
  target?: THREE.Vector3;   // orbit target (default: [0, 0.75, 0])
  radius?: number;          // orbit radius (default: current camera distance)
  cameraY?: number;         // camera Y (default: current)
}

export async function renderTurntable(
  renderer: AnyRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  config: TurntableConfig,
  onProgress?: (frame: number, total: number) => void,
): Promise<Blob> {
  // Steps:
  // 1. Calculate orbit radius from current camera position relative to target
  // 2. Save original camera position
  // 3. Create offscreen canvas, set up MediaRecorder
  // 4. For each frame: position camera at angle, render, copy to offscreen canvas
  // 5. Stop MediaRecorder, restore camera, return video blob

  const {
    frameCount, direction, fps = 30,
    videoFormat,
    target = new THREE.Vector3(0, 0.75, 0),
  } = config;

  const currentPos = camera.position.clone();
  const offset = currentPos.clone().sub(target);
  const radius = config.radius ?? Math.sqrt(offset.x ** 2 + offset.z ** 2);
  const cameraY = config.cameraY ?? currentPos.y;
  const originalPos = camera.position.clone();

  const canvas = renderer.domElement;
  const width = config.width ?? canvas.width;
  const height = config.height ?? canvas.height;

  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;

  const stream = offscreen.captureStream(fps);

  let mimeType: string;
  if (videoFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4; codecs=avc1')) {
    mimeType = 'video/mp4; codecs=avc1';
  } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
    mimeType = 'video/webm;codecs=vp9';
  } else {
    mimeType = 'video/webm';
  }

  const mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const blobType = mimeType.split(';')[0].trim();

  const chunks: BlobPart[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<Blob>((resolve) => {
    mediaRecorder.onstop = () => {
      resolve(new Blob(chunks, { type: blobType }));
    };
  });

  mediaRecorder.start();

  const angleStep = ((direction === 'ccw' ? -1 : 1) * 2 * Math.PI) / frameCount;
  const startAngle = Math.atan2(offset.x, offset.z);

  try {
    for (let i = 0; i < frameCount; i++) {
      const angle = startAngle + angleStep * i;
      camera.position.set(
        target.x + radius * Math.sin(angle),
        cameraY,
        target.z + radius * Math.cos(angle),
      );
      camera.lookAt(target);
      renderer.render(scene, camera);
      ctx.drawImage(canvas, 0, 0, width, height);
      onProgress?.(i + 1, frameCount);
      await new Promise(r => setTimeout(r, 1000 / fps));
    }

    mediaRecorder.stop();
  } finally {
    camera.position.copy(originalPos);
    camera.lookAt(target);
  }

  return recordingDone;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
