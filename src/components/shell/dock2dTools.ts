import {
  MousePointer2, PenTool, Minus, Square, Scissors, Ruler, Spline,
  PenLine, Shapes, Triangle, MoveVertical, Scaling, Type, SquarePlus,
  type LucideIcon,
} from 'lucide-react';

export interface DockToolDef {
  /** Tool2D id passed to activate2DTool. */
  id: string;
  icon: LucideIcon;
  label: string;
  /** Display shortcut (real CLO3D binding). Optional — some tools have none. */
  shortcut?: string;
}

/** Curated catalog of dock-eligible 2D tools. Render order = this order; the
 *  first 7 are the default set (DEFAULT_DOCK_2D_IDS in dockSlice). Every id is a
 *  real Tool2D union member, activatable via activate2DTool. */
export const DOCK_2D_CATALOG: DockToolDef[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', shortcut: 'Z' },
  { id: 'pen', icon: PenTool, label: 'Pen', shortcut: 'H' },
  { id: 'line', icon: Minus, label: 'Line', shortcut: '⇧L' },
  { id: 'rectangle', icon: Square, label: 'Rectangle', shortcut: 'S' },
  { id: 'scissors', icon: Scissors, label: 'Scissors', shortcut: 'X' },
  { id: 'measure', icon: Ruler, label: 'Measure', shortcut: 'M' },
  { id: 'seam', icon: Spline, label: 'Sew', shortcut: 'B' },
  { id: 'editPattern', icon: PenLine, label: 'Edit Pattern', shortcut: 'Q' },
  { id: 'internalShape', icon: Shapes, label: 'Internal Shape', shortcut: 'G' },
  { id: 'notch', icon: Triangle, label: 'Notch' },
  { id: 'grainline', icon: MoveVertical, label: 'Grainline' },
  { id: 'grading', icon: Scaling, label: 'Grading' },
  { id: 'textAnnotation', icon: Type, label: 'Text' },
  { id: 'addPiece', icon: SquarePlus, label: 'Add Piece' },
];

export function getDockToolById(id: string): DockToolDef | undefined {
  return DOCK_2D_CATALOG.find((t) => t.id === id);
}

/** @deprecated Task-3 transitional: LeftDock switches to DOCK_2D_CATALOG + store membership. */
export const DOCK_2D_TOOLS: DockToolDef[] = DOCK_2D_CATALOG.slice(0, 7);
