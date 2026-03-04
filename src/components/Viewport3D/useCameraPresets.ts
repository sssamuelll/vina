import { useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import * as THREE from 'three';
import type { RootState } from '../../store';
import { clearCameraRequest, type ViewPreset } from '../../store/cameraSlice';

// ─── Constants ───

const ANIMATION_DURATION_MS = 250;

export const DEFAULT_TARGET: [number, number, number] = [0, 0.75, 0];
const DEFAULT_DISTANCE = 2.8;

export const VIEW_PRESETS: Record<ViewPreset, { position: [number, number, number]; target: [number, number, number] }> = {
  front:             { position: [0, 0.75, DEFAULT_DISTANCE],  target: DEFAULT_TARGET },
  back:              { position: [0, 0.75, -DEFAULT_DISTANCE], target: DEFAULT_TARGET },
  right:             { position: [DEFAULT_DISTANCE, 0.75, 0],  target: DEFAULT_TARGET },
  left:              { position: [-DEFAULT_DISTANCE, 0.75, 0], target: DEFAULT_TARGET },
  top:               { position: [0, DEFAULT_TARGET[1] + DEFAULT_DISTANCE, 0.001], target: DEFAULT_TARGET },
  bottom:            { position: [0, DEFAULT_TARGET[1] - DEFAULT_DISTANCE, 0.001], target: DEFAULT_TARGET },
  threeQuarterRight: { position: [2.0, 0.75, 2.0],  target: DEFAULT_TARGET },
  threeQuarterLeft:  { position: [-2.0, 0.75, 2.0], target: DEFAULT_TARGET },
};

// ─── Types ───

interface OrbitControlsRef {
  object: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  target: THREE.Vector3;
  update: () => void;
}

// ─── Hook ───

export function useCameraPresets(
  orbitRef: React.RefObject<OrbitControlsRef | null>,
) {
  const dispatch = useDispatch();
  const pendingPreset = useSelector((s: RootState) => s.camera.pendingPreset);
  const pendingFocusPieceId = useSelector((s: RootState) => s.camera.pendingFocusPieceId);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const animRef = useRef<number | null>(null);

  // ─── Animate camera to target position/target ───

  const animateTo = useCallback((
    toPos: [number, number, number],
    toTarget: [number, number, number],
  ) => {
    const controls = orbitRef.current;
    if (!controls) return;

    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    const camera = controls.object;
    const fromPos = camera.position.clone();
    const fromTarget = controls.target.clone();
    const destPos = new THREE.Vector3(...toPos);
    const destTarget = new THREE.Vector3(...toTarget);
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3);

      camera.position.lerpVectors(fromPos, destPos, eased);
      controls.target.lerpVectors(fromTarget, destTarget, eased);
      controls.update();

      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        animRef.current = null;
      }
    };

    animRef.current = requestAnimationFrame(step);
  }, [orbitRef]);

  // ─── Set camera to a named preset ───

  const setCameraView = useCallback((preset: ViewPreset) => {
    const view = VIEW_PRESETS[preset];
    if (!view) return;
    animateTo(view.position, view.target);
  }, [animateTo]);

  // ─── Focus on a selected piece ───

  const focusOnSelection = useCallback((pieceId: string) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;

    const controls = orbitRef.current;
    if (!controls) return;

    const outline = piece.outline;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const cmd of outline) {
      if (cmd.type === 'Z') continue;
      const vals = cmd.values;
      if (cmd.type === 'M' || cmd.type === 'L') {
        minX = Math.min(minX, vals[0]); maxX = Math.max(maxX, vals[0]);
        minY = Math.min(minY, vals[1]); maxY = Math.max(maxY, vals[1]);
      } else if (cmd.type === 'C') {
        for (let i = 0; i < 6; i += 2) {
          minX = Math.min(minX, vals[i]); maxX = Math.max(maxX, vals[i]);
        }
        for (let i = 1; i < 6; i += 2) {
          minY = Math.min(minY, vals[i]); maxY = Math.max(maxY, vals[i]);
        }
      } else if (cmd.type === 'Q') {
        for (let i = 0; i < 4; i += 2) {
          minX = Math.min(minX, vals[i]); maxX = Math.max(maxX, vals[i]);
        }
        for (let i = 1; i < 4; i += 2) {
          minY = Math.min(minY, vals[i]); maxY = Math.max(maxY, vals[i]);
        }
      }
    }

    const scale = 0.001;
    const cx = ((minX + maxX) / 2) * scale;
    const cy = ((minY + maxY) / 2) * scale;
    const width = (maxX - minX) * scale;
    const height = (maxY - minY) * scale;

    const targetY = 0.75 + cy;
    const target: [number, number, number] = [cx, targetY, 0];

    const radius = Math.max(width, height) / 2;
    const camera = controls.object as THREE.PerspectiveCamera;
    const fov = camera.fov * (Math.PI / 180);
    const dist = Math.max(radius / Math.tan(fov / 2), 0.8);

    const position: [number, number, number] = [cx, targetY, dist];
    animateTo(position, target);
  }, [pieces, orbitRef, animateTo]);

  // ─── Watch Redux for copilot-dispatched requests ───

  useEffect(() => {
    if (pendingPreset) {
      setCameraView(pendingPreset);
      dispatch(clearCameraRequest());
    }
  }, [pendingPreset, setCameraView, dispatch]);

  useEffect(() => {
    if (pendingFocusPieceId) {
      focusOnSelection(pendingFocusPieceId);
      dispatch(clearCameraRequest());
    }
  }, [pendingFocusPieceId, focusOnSelection, dispatch]);

  useEffect(() => {
    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, []);

  return { setCameraView, focusOnSelection };
}
