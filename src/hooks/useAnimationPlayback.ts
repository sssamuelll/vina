// src/hooks/useAnimationPlayback.ts
import { useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { RootState } from '../store';
import { setCurrentFrame, setPlaybackState } from '../store/animationSlice';
import { interpolate } from '../utils/animation/interpolation';

/**
 * Drives animation playback: advances the timeline frame counter
 * and applies interpolated keyframe values to scene objects.
 */
export function useAnimationPlayback() {
  const dispatch = useDispatch();
  const { camera } = useThree();
  const { playbackState, currentFrame, fps, duration, loop, tracks } = useSelector(
    (s: RootState) => s.animation,
  );
  const totalFrames = Math.floor(duration * fps);
  const accumulatorRef = useRef(0);

  // Snapshot of original camera state for restoration
  const snapshotRef = useRef<{
    cameraPos: [number, number, number];
    cameraFov: number;
  } | null>(null);

  useFrame((_, delta) => {
    if (playbackState !== 'playing') return;

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
    const frameDuration = 1 / fps;
    if (accumulatorRef.current >= frameDuration) {
      const framesToAdvance = Math.floor(accumulatorRef.current / frameDuration);
      accumulatorRef.current -= framesToAdvance * frameDuration;
      let nextFrame = currentFrame + framesToAdvance;

      if (nextFrame >= totalFrames) {
        if (loop) {
          nextFrame = nextFrame % totalFrames;
        } else {
          dispatch(setPlaybackState('stopped'));
          // Restore camera
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

      dispatch(setCurrentFrame(nextFrame));
    }

    // Apply interpolated values from tracks
    for (const track of tracks) {
      for (const prop of track.properties) {
        if (prop.keyframes.length === 0) continue;
        const val = interpolate(prop.keyframes, currentFrame);
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
  // Avatar joints and wind are applied via Redux dispatches
  // in the GarmentSimulation integration (Task 12)
}
