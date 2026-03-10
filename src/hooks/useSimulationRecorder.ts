// src/hooks/useSimulationRecorder.ts
import { useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useFrame } from '@react-three/fiber';
import type { RootState } from '../store';
import { setRecording, setRecordedFrameCount, setRecordedVertexCount } from '../store/animationSlice';

interface SimRecorderOptions {
  positionsRef: React.MutableRefObject<Float32Array | null>;
}

export interface SimRecorderHandle {
  getFrame: (frameIndex: number) => Float32Array | null;
  frameCount: number;
  vertexCount: number;
}

export function useSimulationRecorder({ positionsRef }: SimRecorderOptions): SimRecorderHandle {
  const dispatch = useDispatch();
  const { recording, fps, duration } = useSelector((s: RootState) => s.animation);
  const bufferRef = useRef<ArrayBuffer | null>(null);
  const frameCountRef = useRef(0);
  const vertexCountRef = useRef(0);

  const totalFrames = Math.floor(duration * fps);

  useFrame(() => {
    if (!recording) return;
    const positions = positionsRef.current;
    if (!positions) return;

    const vertexCount = positions.length / 3;

    // First frame: allocate buffer
    if (frameCountRef.current === 0) {
      vertexCountRef.current = vertexCount;
      bufferRef.current = new ArrayBuffer(totalFrames * vertexCount * 3 * 4); // Float32
      dispatch(setRecordedVertexCount(vertexCount));
    }

    if (frameCountRef.current >= totalFrames) {
      dispatch(setRecording(false));
      return;
    }

    // Copy current positions into buffer
    const offset = frameCountRef.current * vertexCount * 3;
    const view = new Float32Array(bufferRef.current!, offset, vertexCount * 3);
    view.set(positions);

    frameCountRef.current++;
    dispatch(setRecordedFrameCount(frameCountRef.current));
  });

  const getFrame = useCallback((frameIndex: number): Float32Array | null => {
    if (!bufferRef.current || frameIndex >= frameCountRef.current) return null;
    const vc = vertexCountRef.current;
    const offset = frameIndex * vc * 3;
    return new Float32Array(bufferRef.current, offset * 4, vc * 3);
  }, []);

  return {
    getFrame,
    get frameCount() { return frameCountRef.current; },
    get vertexCount() { return vertexCountRef.current; },
  };
}
