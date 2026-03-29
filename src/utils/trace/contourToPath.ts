import type { PathCommand, Point2D } from '../../types/types';

export interface ContourToPathOptions {
  pixelsPerMm: number | null;
  imagePosition: Point2D;
  imageScale: number;
}

export function contourToPathCommands(
  points: { x: number; y: number }[],
  options: ContourToPathOptions,
): PathCommand[] {
  if (points.length === 0) return [];
  const pxPerMm = options.pixelsPerMm ?? 1;
  const commands: PathCommand[] = [];

  for (let i = 0; i < points.length; i++) {
    const mmX = (points[i].x / pxPerMm) * options.imageScale + options.imagePosition.x;
    const mmY = (points[i].y / pxPerMm) * options.imageScale + options.imagePosition.y;
    commands.push({ type: i === 0 ? 'M' : 'L', values: [mmX, mmY] });
  }
  commands.push({ type: 'Z', values: [] });
  return commands;
}
