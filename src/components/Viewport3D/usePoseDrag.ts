import { useCallback, useRef } from 'react';
import { useDispatch, useStore } from 'react-redux';
import type { RootState } from '../../store';
import {
  setJointRotation,
  clampJointRotation,
  selectJoint,
  mirrorJoint,
  JOINT_CONSTRAINTS,
} from '../../store/avatarSlice';

type AxisMapping = { horizontal?: 'x' | 'y' | 'z'; vertical?: 'x' | 'y' | 'z' };

// Axis mapping verified via axis discovery on Avaturn GLB:
// Arms: +X = lower (adduction), -X = raise. Z = forward/backward
// Legs: +X = flex (kick forward), -X = extend back
// Spine: Y = twist, X = flex/extend
const AXIS_MAP: Record<string, AxisMapping> = {
  LeftArm: { vertical: 'x', horizontal: 'z' },    // drag up→raise(-X), drag right→forward(+Z)
  RightArm: { vertical: 'x', horizontal: 'z' },    // drag up→raise(-X), drag right→forward(-Z)
  LeftForeArm: { vertical: 'x' },                   // hinge: drag up→flex(+X)
  RightForeArm: { vertical: 'x' },
  LeftUpLeg: { vertical: 'x', horizontal: 'z' },
  RightUpLeg: { vertical: 'x', horizontal: 'z' },
  LeftLeg: { vertical: 'x' },
  RightLeg: { vertical: 'x' },
  Spine: { horizontal: 'y', vertical: 'x' },
  Spine1: { horizontal: 'y', vertical: 'x' },
  Spine2: { horizontal: 'y', vertical: 'x' },
  Neck: { horizontal: 'y', vertical: 'x' },
  Head: { horizontal: 'y', vertical: 'x' },
  LeftShoulder: { horizontal: 'z', vertical: 'x' },
  RightShoulder: { horizontal: 'z', vertical: 'x' },
};

const SENSITIVITY = 0.5; // degrees per pixel

export interface PoseDragState {
  isDragging: boolean;
  isDraggingRef: React.RefObject<boolean>;
  onGizmoPointerDown: (jointName: string, e: { stopPropagation: () => void; nativeEvent?: Event }) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
}

export function usePoseDrag(
  setOrbitEnabled: (enabled: boolean) => void,
): PoseDragState {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const isDraggingRef = useRef(false);
  const activeJointRef = useRef<string | null>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const onGizmoPointerDown = useCallback((jointName: string, e: { stopPropagation: () => void; nativeEvent?: Event }) => {
    e.stopPropagation();
    // Also stop the native DOM event from reaching OrbitControls
    if (e.nativeEvent) {
      e.nativeEvent.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
    }
    if (!JOINT_CONSTRAINTS[jointName]) return;

    isDraggingRef.current = true;
    activeJointRef.current = jointName;
    dispatch(selectJoint(jointName));
    setOrbitEnabled(false);

    // We'll capture the pointer position from the first move event
    lastPosRef.current = { x: -9999, y: -9999 };
  }, [dispatch, setOrbitEnabled]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!isDraggingRef.current || !activeJointRef.current) return;

    const joint = activeJointRef.current;

    if (lastPosRef.current.x === -9999) {
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    lastPosRef.current = { x: e.clientX, y: e.clientY };

    const mapping = AXIS_MAP[joint];
    if (!mapping) return;

    // Read current rotation from store (avoid stale closure)
    const currentRot = store.getState().avatar.pose.joints[joint] ?? { x: 0, y: 0, z: 0 };
    const newRot = { ...currentRot };

    if (mapping.horizontal && dx !== 0) {
      newRot[mapping.horizontal] += dx * SENSITIVITY;
    }
    if (mapping.vertical && dy !== 0) {
      newRot[mapping.vertical] -= dy * SENSITIVITY; // invert Y for natural feel
    }

    const clamped = clampJointRotation(joint, newRot);
    dispatch(setJointRotation({ joint, rotation: clamped }));

    if (e.shiftKey) {
      dispatch(mirrorJoint(joint));
    }
  }, [dispatch, store]);

  const onPointerUp = useCallback((_e: PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    activeJointRef.current = null;
    setOrbitEnabled(true);
    document.body.style.cursor = '';
  }, [setOrbitEnabled]);

  return {
    isDragging: isDraggingRef.current,
    isDraggingRef,
    onGizmoPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
