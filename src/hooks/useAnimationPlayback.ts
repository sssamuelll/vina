// src/hooks/useAnimationPlayback.ts
import { useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { RootState } from '../store';
import type { AnimationTrack } from '../utils/animation/types';
import { setCurrentFrame, setPlaybackState } from '../store/animationSlice';
import { interpolate } from '../utils/animation/interpolation';

/**
 * Drives animation playback: advances the timeline frame counter
 * and applies interpolated keyframe values to scene objects.
 *
 * All Redux state consumed inside the R3F useFrame callback is kept in refs
 * so the callback always sees the latest values (Immer proxies from selectors
 * can be revoked between renders, causing "not iterable" errors).
 */
export function useAnimationPlayback() {
  const dispatch = useDispatch();
  const { camera } = useThree();
  const { playbackState, currentFrame, fps, duration, loop, tracks } = useSelector(
    (s: RootState) => s.animation,
  );

  // Keep refs up-to-date so useFrame callback is never stale
  const stateRef = useRef({ playbackState, currentFrame, fps, duration, loop });
  stateRef.current = { playbackState, currentFrame, fps, duration, loop };

  const frameRef = useRef(currentFrame);
  frameRef.current = currentFrame;

  const accumulatorRef = useRef(0);

  // Snapshot of original camera state for restoration
  const snapshotRef = useRef<{
    cameraPos: [number, number, number];
    cameraFov: number;
  } | null>(null);

  // Deep-copy tracks for safe iteration inside useFrame (avoids Immer proxy issues)
  const tracksRef = useRef<AnimationTrack[]>([]);
  tracksRef.current = JSON.parse(JSON.stringify(tracks));

  useFrame((_, delta) => {
    const { playbackState: ps, fps: f, duration: d, loop: lp } = stateRef.current;
    if (ps !== 'playing') return;

    const totalFrames = Math.floor(d * f);

    // Take snapshot on first playing frame
    if (!snapshotRef.current) {
      const cam = camera as THREE.PerspectiveCamera;
      snapshotRef.current = {
        cameraPos: [cam.position.x, cam.position.y, cam.position.z],
        cameraFov: cam.fov,
      };
    }

    // Advance frame based on delta time
    accumulatorRef.current += delta;
    const frameDuration = 1 / f;
    if (accumulatorRef.current >= frameDuration) {
      const framesToAdvance = Math.floor(accumulatorRef.current / frameDuration);
      accumulatorRef.current -= framesToAdvance * frameDuration;
      let nextFrame = frameRef.current + framesToAdvance;

      if (nextFrame >= totalFrames) {
        if (lp) {
          nextFrame = nextFrame % totalFrames;
        } else {
          dispatch(setPlaybackState('stopped'));
          if (snapshotRef.current) {
            const cam = camera as THREE.PerspectiveCamera;
            cam.position.set(...snapshotRef.current.cameraPos);
            cam.fov = snapshotRef.current.cameraFov;
            cam.updateProjectionMatrix();
            snapshotRef.current = null;
          }
          accumulatorRef.current = 0;
          return;
        }
      }

      frameRef.current = nextFrame;
      dispatch(setCurrentFrame(nextFrame));
    }

    // Apply interpolated values from tracks (use plain-object copy)
    for (const track of tracksRef.current) {
      if (!track.properties) continue;
      for (const prop of track.properties) {
        if (!prop.keyframes || prop.keyframes.length === 0) continue;
        const val = interpolate(prop.keyframes, frameRef.current);
        if (val === undefined) continue;

        applyAnimatedValue(track.objectType, prop.path, val, camera);
      }
    }
  });
}

function applyAnimatedValue(
  objectType: string,
  path: string,
  value: number,
  camera: THREE.Camera,
) {
  const cam = camera as THREE.PerspectiveCamera;

  if (objectType === 'camera') {
    switch (path) {
      case 'position.x': cam.position.x = value; break;
      case 'position.y': cam.position.y = value; break;
      case 'position.z': cam.position.z = value; break;
      case 'fov':
        cam.fov = value;
        cam.updateProjectionMatrix();
        break;
    }
  }
}
