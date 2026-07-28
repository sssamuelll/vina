/**
 * Re-anchor notches after the outline they sit on is edited (nota de María
 * #171). Each notch that carries a parametric {@link NotchAnchor} (arc distance
 * from a reference corner, per the notch-precision package) has its render path
 * recomputed so the notch tracks the reshaped edge instead of floating where it
 * was dropped.
 *
 * When the edit moved the reference corner ITSELF, the anchor stops resolving
 * by coordinates; pass `prevOutline` and the corner is re-identified across the
 * edit, keeping the notch its stored distance from that corner. Callers that
 * cannot supply the previous outline, and edits where no corner can be followed
 * unambiguously (it was deleted, or stopped being a corner), keep the frozen
 * path — D-2 "path manda". A notch with no anchor is never touched.
 */
import type { InternalLine, PathCommand } from '../types/types';
import { resolveNotchAnchor, trackMovedCorner } from './notchAnchor';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from './notches';

export function reanchorNotches(
  internals: InternalLine[],
  outline: PathCommand[],
  prevOutline?: PathCommand[],
): InternalLine[] {
  let changed = false;
  const next = internals.map(line => {
    if (line.type !== 'notch' || !line.notchAnchor) return line;
    let anchor = line.notchAnchor;
    let resolved = resolveNotchAnchor(outline, anchor);
    if (!resolved && prevOutline) {
      const moved = trackMovedCorner(prevOutline, outline, anchor.refPoint);
      if (moved) {
        anchor = { ...anchor, refPoint: moved };
        resolved = resolveNotchAnchor(outline, anchor);
      }
    }
    if (!resolved) return line; // nothing unambiguous to follow → frozen path
    const opts = line.notchOptions ?? DEFAULT_NOTCH_OPTIONS;
    changed = true;
    return {
      ...line,
      notchAnchor: anchor,
      path: generateNotchPath(resolved.point, resolved.normal, opts),
    };
  });
  return changed ? next : internals;
}
