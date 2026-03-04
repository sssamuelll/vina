import type { PathCommand, InternalLine } from '../types/types';

/**
 * Compute bounding box center X from an outline.
 */
export function outlineCenterX(outline: PathCommand[]): number {
  let minX = Infinity, maxX = -Infinity;
  for (const cmd of outline) {
    const v = cmd.values;
    for (let i = 0; i < v.length; i += 2) {
      if (v[i] < minX) minX = v[i];
      if (v[i] > maxX) maxX = v[i];
    }
  }
  return (minX + maxX) / 2;
}

/**
 * Mirror an outline by reflecting all X coordinates around the bounding box center.
 */
export function mirrorOutlineX(outline: PathCommand[]): PathCommand[] {
  const cx = outlineCenterX(outline);
  return mirrorPathX(outline, cx);
}

/**
 * Mirror a path's X coordinates around a given center X.
 */
function mirrorPathX(path: PathCommand[], cx: number): PathCommand[] {
  return path.map(cmd => {
    if (cmd.type === 'Z') return { type: 'Z' as const, values: [] };
    const values = [...cmd.values];
    if (cmd.type === 'M' || cmd.type === 'L') {
      values[0] = 2 * cx - values[0];
    } else if (cmd.type === 'H') {
      values[0] = 2 * cx - values[0];
    } else if (cmd.type === 'C') {
      values[0] = 2 * cx - values[0];
      values[2] = 2 * cx - values[2];
      values[4] = 2 * cx - values[4];
    } else if (cmd.type === 'Q') {
      values[0] = 2 * cx - values[0];
      values[2] = 2 * cx - values[2];
    }
    return { type: cmd.type, values };
  });
}

/**
 * Mirror internal lines by reflecting X coordinates around a center.
 */
export function mirrorInternalsX(internals: InternalLine[], centerX: number): InternalLine[] {
  return internals.map(line => ({
    ...line,
    id: crypto.randomUUID(),
    path: mirrorPathX(line.path, centerX),
  }));
}
