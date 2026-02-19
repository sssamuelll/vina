import { PathCommand } from '../../types/types';

/** Convert PathCommand array to SVG path string */
export function pathToSVG(commands: PathCommand[]): string {
  return commands.map(c => `${c.type}${c.values.join(',')}`).join(' ');
}

/** Handle radius in screen pixels (unscaled) */
export const HANDLE_RADIUS = 4;
export const ANCHOR_RADIUS = 4;
