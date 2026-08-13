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
 *
 * {@link reanchorTransformedNotches} covers the other way an outline moves:
 * the transform box, where the whole plane is scaled or rotated at once.
 */
import type { InternalLine, PathCommand, Point2D } from '../types/types';
import { computeNotchAnchor, resolveNotchAnchor, trackMovedCorner } from './notchAnchor';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from './notches';

/**
 * Re-derive notch anchors after the whole piece was transformed as a plane —
 * the 2D transform box, which scales and rotates every coordinate at once.
 *
 * Mapping each internal path through the transform already carries the notch
 * back onto its edge, but it leaves two things wrong: the anchor still
 * describes coordinates the outline no longer has, and the mark itself gets
 * stretched with the piece. Resolving the OLD anchor on the OLD outline gives
 * the notch's exact placement regardless of its shape; mapping that single
 * point through the same transform and re-deriving the anchor there fixes
 * both — the intent survives the transform, and the mark is redrawn at the
 * size `notchOptions` asks for.
 *
 * `internals` are the already-mapped lines (`mapPoint` must be the same
 * transform that produced them). Notches without an anchor, and any whose
 * anchor no longer resolves, keep the mapped path: they still travel with the
 * piece, they just have no parametric intent to preserve.
 */
export function reanchorTransformedNotches(
  internals: InternalLine[],
  prevOutline: PathCommand[],
  outline: PathCommand[],
  mapPoint: (pt: Point2D) => Point2D,
): InternalLine[] {
  let changed = false;
  const next = internals.map(line => {
    if (line.type !== 'notch' || !line.notchAnchor) return line;
    const before = resolveNotchAnchor(prevOutline, line.notchAnchor);
    if (!before) return line;
    const anchor = computeNotchAnchor(
      outline,
      mapPoint(before.point),
      line.notchAnchor.metric ?? 1,
    );
    if (!anchor) return line;
    const resolved = resolveNotchAnchor(outline, anchor);
    if (!resolved) return line;
    changed = true;
    return {
      ...line,
      notchAnchor: anchor,
      path: generateNotchPath(resolved.point, resolved.normal, line.notchOptions ?? DEFAULT_NOTCH_OPTIONS),
    };
  });
  return changed ? next : internals;
}

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
