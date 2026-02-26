/**
 * useAvatarTape — Handles avatar surface click interactions for tape tools.
 *
 * Circumference: click on avatar → ring at that Y height
 * Linear: click first point, click second point → distance measurement
 */

import { useCallback } from 'react';
import * as THREE from 'three';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { addTape, setPendingTape } from '../../store/avatarTapeSlice';
import { deriveDimensions } from '../../utils/cloth/garmentPlacement';

// Tape colors cycling
const TAPE_COLORS = ['#ff6b6b', '#4ecdc4', '#ffd93d', '#a29bfe', '#fd79a8', '#00b894'];
let colorIndex = 0;
const nextColor = () => TAPE_COLORS[colorIndex++ % TAPE_COLORS.length];

// Body circumference at a given Y height (from measurements)
function getCircumferenceAtHeight(
  y: number,
  d: ReturnType<typeof deriveDimensions>
): { circumferenceMm: number; label: string } {
  const sh = d.shoulderHeight;
  const wh = d.waistHeight;
  const h = d.heightM;

  // Determine body region and interpolate radius
  let radius: number;
  let label: string;

  if (y > sh - 0.05) {
    // Neck/shoulder area
    radius = d.chestRadius * 0.4;
    label = 'Neck';
  } else if (y > sh - 0.15) {
    // Chest area
    const t = (sh - 0.05 - y) / 0.1;
    radius = d.chestRadius * (0.6 + t * 0.4);
    label = 'Chest';
  } else if (y > wh + 0.05) {
    // Chest to waist
    const t = (sh - 0.15 - y) / (sh - 0.15 - wh - 0.05);
    radius = d.chestRadius - t * (d.chestRadius - d.hipRadius * 0.88);
    label = t < 0.5 ? 'Bust' : 'Waist';
  } else if (y > wh - 0.15) {
    // Waist to hip
    const t = (wh + 0.05 - y) / 0.2;
    radius = d.hipRadius * 0.88 + t * (d.hipRadius - d.hipRadius * 0.88);
    label = t < 0.5 ? 'Underbust' : 'Upper Hip';
  } else if (y > h * 0.3) {
    // Hip
    label = 'Hip';
    radius = d.hipRadius;
  } else if (y > h * 0.2) {
    // Thigh
    label = 'Thigh';
    radius = d.hipRadius * 0.5;
  } else if (y > h * 0.1) {
    // Calf/knee
    label = 'Knee/Calf';
    radius = d.hipRadius * 0.3;
  } else {
    // Ankle
    label = 'Ankle';
    radius = d.hipRadius * 0.18;
  }

  // Circumference = 2πr, radius in meters → mm
  const circumferenceMm = 2 * Math.PI * radius * 1000;
  return { circumferenceMm, label };
}

export function useAvatarTape(activeTool3D: string) {
  const dispatch = useDispatch();
  const pendingTape = useSelector((s: RootState) => s.avatarTape.pendingTape);
  const measurements = useSelector((s: RootState) => s.project.avatar.measurements);

  const isTapeTool = activeTool3D === 'tape-circumference' || activeTool3D === 'tape-linear';

  const handleAvatarClick = useCallback((e: any) => {
    if (!isTapeTool) return;
    e.stopPropagation();

    const point = e.point as THREE.Vector3;
    const id = `tape-${Date.now()}`;

    if (activeTool3D === 'tape-circumference') {
      const d = deriveDimensions(measurements);
      const { circumferenceMm, label } = getCircumferenceAtHeight(point.y, d);

      dispatch(addTape({
        id,
        type: 'circumference',
        height: point.y,
        measurement: circumferenceMm,
        label,
        color: nextColor(),
        visible: true,
      }));
    } else if (activeTool3D === 'tape-linear') {
      if (!pendingTape?.pointA) {
        // First click — store point A
        dispatch(setPendingTape({
          id,
          type: 'linear',
          pointA: [point.x, point.y, point.z],
          color: nextColor(),
        }));
      } else {
        // Second click — create linear tape
        const pA = pendingTape.pointA as [number, number, number];
        const pB: [number, number, number] = [point.x, point.y, point.z];
        const dx = pB[0] - pA[0], dy = pB[1] - pA[1], dz = pB[2] - pA[2];
        const distMm = Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000;

        dispatch(addTape({
          id: pendingTape.id ?? id,
          type: 'linear',
          pointA: pA,
          pointB: pB,
          measurement: distMm,
          label: 'Distance',
          color: pendingTape.color ?? nextColor(),
          visible: true,
        }));
      }
    }
  }, [dispatch, activeTool3D, isTapeTool, pendingTape, measurements]);

  return { handleAvatarClick, isTapeTool };
}
