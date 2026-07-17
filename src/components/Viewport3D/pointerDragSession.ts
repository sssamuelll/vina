/**
 * Wire a pointer-drag gesture (pointermove + pointerup) with a SINGLE terminal
 * outcome: a normal pointerup commits; an interrupted gesture is torn down via
 * cancel() WITHOUT committing.
 *
 * ArrangeGizmo registers these listeners imperatively when a drag begins. If the
 * gizmo unmounts mid-drag — e.g. Escape deselects the piece — the listeners would
 * otherwise linger and the eventual pointerup would fire a phantom placement
 * commit on the unmounted component. Calling cancel() from the component's
 * unmount cleanup removes the listeners and suppresses that commit (#935).
 */
export interface PointerDragSession {
  /** Remove the listeners without firing onCommit. Idempotent. */
  cancel(): void;
}

export function bindPointerDrag(
  moveTarget: EventTarget,
  upTarget: EventTarget,
  onMove: (ev: PointerEvent) => void,
  onCommit: () => void,
): PointerDragSession {
  let done = false;

  const move = (ev: Event) => {
    if (!done) onMove(ev as PointerEvent);
  };
  const teardown = () => {
    if (done) return;
    done = true;
    moveTarget.removeEventListener('pointermove', move);
    upTarget.removeEventListener('pointerup', up);
  };
  const up = () => {
    if (done) return;
    teardown();
    onCommit();
  };

  moveTarget.addEventListener('pointermove', move);
  upTarget.addEventListener('pointerup', up);

  return { cancel: teardown };
}
