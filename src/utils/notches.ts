import { Point2D, PathCommand, NotchOptions } from '../types/types';

export const DEFAULT_NOTCH_OPTIONS: NotchOptions = {
  shape: 'slit',
  subType: 'straightforward',
  length: 8,
  width: 3,
  angle: 0,
  count: 1,
};

/**
 * Generate notch geometry as PathCommand[] for a given notch type.
 * @param point - point on the outline (local coordinates)
 * @param normal - unit normal pointing inward
 * @param options - notch configuration
 */
export function generateNotchPath(
  point: Point2D,
  normal: Point2D,
  options: NotchOptions,
): PathCommand[] {
  // Edge direction (perpendicular to normal)
  const edge: Point2D = { x: -normal.y, y: normal.x };

  const generateSingle = (center: Point2D): PathCommand[] => {
    const { shape, length, width } = options;
    const nx = normal.x, ny = normal.y;
    const ex = edge.x, ey = edge.y;

    switch (shape) {
      case 'slit': {
        return [
          { type: 'M', values: [center.x, center.y] },
          { type: 'L', values: [center.x + nx * length, center.y + ny * length] },
        ];
      }

      case 't-notch': {
        const endX = center.x + nx * length;
        const endY = center.y + ny * length;
        const barHalf = width * 0.75 / 2;
        return [
          { type: 'M', values: [center.x, center.y] },
          { type: 'L', values: [endX, endY] },
          { type: 'M', values: [endX - ex * barHalf, endY - ey * barHalf] },
          { type: 'L', values: [endX + ex * barHalf, endY + ey * barHalf] },
        ];
      }

      case 'v-internal': {
        const halfW = width / 2;
        const tipX = center.x + nx * length;
        const tipY = center.y + ny * length;
        return [
          { type: 'M', values: [center.x - ex * halfW, center.y - ey * halfW] },
          { type: 'L', values: [tipX, tipY] },
          { type: 'L', values: [center.x + ex * halfW, center.y + ey * halfW] },
        ];
      }

      case 'v-external': {
        const halfW = width / 2;
        const tipX = center.x - nx * length;
        const tipY = center.y - ny * length;
        return [
          { type: 'M', values: [center.x - ex * halfW, center.y - ey * halfW] },
          { type: 'L', values: [tipX, tipY] },
          { type: 'L', values: [center.x + ex * halfW, center.y + ey * halfW] },
        ];
      }

      case 'u-notch': {
        const halfW = width / 2;
        const depth = length / 2;
        // Left side going inward
        const lx = center.x - ex * halfW;
        const ly = center.y - ey * halfW;
        const rx = center.x + ex * halfW;
        const ry = center.y + ey * halfW;
        // Bottom points
        const blx = lx + nx * depth;
        const bly = ly + ny * depth;
        const brx = rx + nx * depth;
        const bry = ry + ny * depth;
        // Semicircle via 2 cubic beziers (approximation: k ≈ 0.5523)
        const k = 0.5523;
        const cpLen = halfW * k;
        // midpoint of bottom arc
        const midX = (blx + brx) / 2 + nx * halfW;
        const midY = (bly + bry) / 2 + ny * halfW;
        return [
          { type: 'M', values: [lx, ly] },
          { type: 'L', values: [blx, bly] },
          { type: 'C', values: [
            blx + nx * cpLen, bly + ny * cpLen,
            midX - ex * halfW * (1 - k), midY - ey * halfW * (1 - k),
            midX, midY,
          ]},
          { type: 'C', values: [
            midX + ex * halfW * (1 - k), midY + ey * halfW * (1 - k),
            brx + nx * cpLen, bry + ny * cpLen,
            brx, bry,
          ]},
          { type: 'L', values: [rx, ry] },
        ];
      }

      case 'castle': {
        const halfW = width / 2;
        const lx = center.x - ex * halfW;
        const ly = center.y - ey * halfW;
        const rx = center.x + ex * halfW;
        const ry = center.y + ey * halfW;
        return [
          { type: 'M', values: [lx, ly] },
          { type: 'L', values: [lx + nx * length, ly + ny * length] },
          { type: 'L', values: [rx + nx * length, ry + ny * length] },
          { type: 'L', values: [rx, ry] },
        ];
      }

      case 'diamond': {
        const halfW = width / 2;
        return [
          { type: 'M', values: [center.x - ex * halfW, center.y - ey * halfW] },
          { type: 'L', values: [center.x - nx * length, center.y - ny * length] },
          { type: 'L', values: [center.x + ex * halfW, center.y + ey * halfW] },
          { type: 'L', values: [center.x + nx * length, center.y + ny * length] },
          { type: 'Z', values: [] },
        ];
      }

      default:
        return [
          { type: 'M', values: [center.x, center.y] },
          { type: 'L', values: [center.x + nx * length, center.y + ny * length] },
        ];
    }
  };

  const { count, width } = options;

  if (count === 1) {
    return generateSingle(point);
  }

  const paths: PathCommand[] = [];

  if (count === 2) {
    const offset = width * 0.625;
    paths.push(...generateSingle({ x: point.x - edge.x * offset, y: point.y - edge.y * offset }));
    paths.push(...generateSingle({ x: point.x + edge.x * offset, y: point.y + edge.y * offset }));
  } else if (count === 3) {
    const offset = width * 1.25;
    paths.push(...generateSingle({ x: point.x - edge.x * offset, y: point.y - edge.y * offset }));
    paths.push(...generateSingle(point));
    paths.push(...generateSingle({ x: point.x + edge.x * offset, y: point.y + edge.y * offset }));
  }

  return paths;
}
