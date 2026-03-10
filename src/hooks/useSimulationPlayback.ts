// src/hooks/useSimulationPlayback.ts
import { useSelector } from 'react-redux';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RootState } from '../store';
import type { SimRecorderHandle } from './useSimulationRecorder';

interface SimPlaybackOptions {
  meshRef: React.MutableRefObject<THREE.Mesh | null>;
  recorder: SimRecorderHandle;
}

/**
 * During animation playback, reads recorded sim frames and applies
 * them to the cloth mesh geometry. Returns true if playback is active
 * (caller should skip live solver updates).
 */
export function useSimulationPlayback({ meshRef, recorder }: SimPlaybackOptions): { isPlayingBack: boolean } {
  const { playbackState, currentFrame, recordedFrameCount } = useSelector((s: RootState) => s.animation);
  const isPlayingBack = (playbackState === 'playing' || playbackState === 'paused') && recordedFrameCount > 0;

  useFrame(() => {
    if (!isPlayingBack) return;
    if (!meshRef.current) return;

    const clampedFrame = Math.min(currentFrame, recorder.frameCount - 1);
    const frameData = recorder.getFrame(clampedFrame);
    if (!frameData) return;

    const geometry = meshRef.current.geometry;
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr && posAttr.array.length === frameData.length) {
      (posAttr.array as Float32Array).set(frameData);
      posAttr.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    }
  });

  return { isPlayingBack };
}
