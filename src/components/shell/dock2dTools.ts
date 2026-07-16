import {
  MousePointer2, PenTool, Minus, Square, Scissors, Ruler, Spline,
  PenLine, Shapes, Triangle, MoveVertical, Scaling, Type, SquarePlus,
  SquareDashed,
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
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'Z' },
  { id: 'pen', icon: PenTool, label: 'Pluma', shortcut: 'H' },
  { id: 'line', icon: Minus, label: 'Línea', shortcut: '⇧L' },
  { id: 'rectangle', icon: Square, label: 'Rectángulo', shortcut: 'S' },
  { id: 'scissors', icon: Scissors, label: 'Tijeras', shortcut: 'X' },
  { id: 'measure', icon: Ruler, label: 'Medir', shortcut: 'M' },
  { id: 'seam', icon: Spline, label: 'Coser', shortcut: 'B' },
  { id: 'editPattern', icon: PenLine, label: 'Editar patrón', shortcut: 'Q' },
  { id: 'internalShape', icon: Shapes, label: 'Forma interna', shortcut: 'G' },
  { id: 'notch', icon: Triangle, label: 'Piquete' },
  { id: 'seamAllowance', icon: SquareDashed, label: 'Margen de costura', shortcut: 'O' },
  { id: 'grainline', icon: MoveVertical, label: 'Hilo' },
  { id: 'grading', icon: Scaling, label: 'Escalado' },
  { id: 'textAnnotation', icon: Type, label: 'Texto' },
  { id: 'addPiece', icon: SquarePlus, label: 'Añadir pieza' },
];

export function getDockToolById(id: string): DockToolDef | undefined {
  return DOCK_2D_CATALOG.find((t) => t.id === id);
}
