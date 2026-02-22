import { useCallback, useRef } from 'react';
import { useDispatch, useStore } from 'react-redux';
import type { RootState } from '../../store';
import {
  setJointRotation,
  clampJointRotation,
  selectJoint,
  mirrorJoint,
} from '../../store/avatarSlice';
import { DRAG_MAPPINGS, HUMAN_JOINTS } from '../../utils/avatar/jointConstraints';

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
    if (!HUMAN_JOINTS[jointName]) return;

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

    const mapping = DRAG_MAPPINGS[joint];
    if (!mapping) return;

    // Read current rotation from store (avoid stale closure)
    const currentRot = store.getState().avatar.pose.joints[joint] ?? { x: 0, y: 0, z: 0 };
    const newRot = { ...currentRot };

    if (mapping.horizontal && dx !== 0) {
      const sign = mapping.horizontalSign ?? 1;
      newRot[mapping.horizontal] += dx * SENSITIVITY * sign;
    }
    if (mapping.vertical && dy !== 0) {
      const sign = mapping.verticalSign ?? -1; // default: invert Y for natural feel
      newRot[mapping.vertical] += dy * SENSITIVITY * sign;
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
