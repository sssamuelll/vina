import { MousePointer2, PenTool, Minus, Square, Scissors, Ruler, Spline, type LucideIcon } from 'lucide-react';

export interface DockToolDef {
  /** Tool2D id passed to activate2DTool. */
  id: string;
  icon: LucideIcon;
  label: string;
  /** Display shortcut (real CLO3D binding from src/shortcuts/defaults.ts). */
  shortcut: string;
}

export const DOCK_2D_TOOLS: DockToolDef[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', shortcut: 'Z' },
  { id: 'pen', icon: PenTool, label: 'Pen', shortcut: 'H' },
  { id: 'line', icon: Minus, label: 'Line', shortcut: '⇧L' },
  { id: 'rectangle', icon: Square, label: 'Rectangle', shortcut: 'S' },
  { id: 'scissors', icon: Scissors, label: 'Scissors', shortcut: 'X' },
  { id: 'measure', icon: Ruler, label: 'Measure', shortcut: 'M' },
  { id: 'seam', icon: Spline, label: 'Sew', shortcut: 'B' },
];
