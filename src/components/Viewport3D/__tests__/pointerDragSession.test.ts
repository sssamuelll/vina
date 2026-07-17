/**
 * @vitest-environment jsdom
 *
 * #935: a gizmo drag registers window/canvas pointer listeners imperatively.
 * If the gizmo unmounts mid-drag (Escape deselects the piece), those listeners
 * must be torn down WITHOUT committing — otherwise the eventual pointerup fires
 * a phantom placement write. bindPointerDrag owns that single-terminal-outcome
 * invariant so it can be tested without mounting the R3F tree.
 */
import { describe, it, expect, vi } from 'vitest';
import { bindPointerDrag } from '../pointerDragSession';

function makeTargets() {
  return { move: new EventTarget(), up: new EventTarget() };
}

describe('bindPointerDrag', () => {
  it('forwards pointermove while active and commits on pointerup', () => {
    const { move, up } = makeTargets();
    const onMove = vi.fn();
    const onCommit = vi.fn();
    bindPointerDrag(move, up, onMove, onCommit);

    const mv = new Event('pointermove');
    move.dispatchEvent(mv);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(mv);

    up.dispatchEvent(new Event('pointerup'));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('commits at most once and stops listening after pointerup', () => {
    const { move, up } = makeTargets();
    const onMove = vi.fn();
    const onCommit = vi.fn();
    bindPointerDrag(move, up, onMove, onCommit);

    up.dispatchEvent(new Event('pointerup'));
    up.dispatchEvent(new Event('pointerup')); // stray second release
    expect(onCommit).toHaveBeenCalledTimes(1);

    move.dispatchEvent(new Event('pointermove')); // after terminal outcome
    expect(onMove).not.toHaveBeenCalled();
  });

  it('cancel() removes listeners WITHOUT committing (phantom-write guard, #935)', () => {
    const { move, up } = makeTargets();
    const onMove = vi.fn();
    const onCommit = vi.fn();
    const session = bindPointerDrag(move, up, onMove, onCommit);

    session.cancel(); // gizmo unmounted mid-drag

    up.dispatchEvent(new Event('pointerup')); // the stray release afterwards
    move.dispatchEvent(new Event('pointermove'));
    expect(onCommit).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('cancel() after commit is an idempotent no-op', () => {
    const { move, up } = makeTargets();
    const onCommit = vi.fn();
    const session = bindPointerDrag(move, up, vi.fn(), onCommit);

    up.dispatchEvent(new Event('pointerup'));
    expect(() => session.cancel()).not.toThrow();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
