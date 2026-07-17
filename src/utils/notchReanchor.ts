/**
 * Re-anchor notches after the outline they sit on is edited (nota de María
 * #171). Each notch that carries a parametric {@link NotchAnchor} (arc distance
 * from a reference corner, per the notch-precision package) has its render path
 * recomputed so the notch tracks the reshaped edge instead of floating where it
 * was dropped.
 *
 * D-2 "path manda" is preserved: a notch with no anchor, or one whose reference
 * corner no longer lies on the outline (the corner itself was moved), keeps its
 * frozen path — there is nothing unambiguous to re-anchor to. Re-identifying a
 * moved corner is the larger, deliberately deferred half of the design.
 */
import type { InternalLine, PathCommand } from '../types/types';
import { resolveNotchAnchor } from './notchAnchor';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from './notches';

export function reanchorNotches(
  internals: InternalLine[],
  outline: PathCommand[],
): InternalLine[] {
  let changed = false;
  const next = internals.map(line => {
    if (line.type !== 'notch' || !line.notchAnchor) return line;
    const resolved = resolveNotchAnchor(outline, line.notchAnchor);
    if (!resolved) return line; // ref corner gone/moved → keep the frozen path
    const opts = line.notchOptions ?? DEFAULT_NOTCH_OPTIONS;
    changed = true;
    return { ...line, path: generateNotchPath(resolved.point, resolved.normal, opts) };
  });
  return changed ? next : internals;
}
