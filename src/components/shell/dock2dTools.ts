import {
  MousePointer2, PenTool, Minus, Square, Scissors, Ruler, Spline,
  PenLine, Shapes, Triangle, MoveVertical,
  SquareDashed, GitCommitHorizontal, Waypoints,
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
 *  first 10 are the default set (DEFAULT_DOCK_2D_IDS in dockSlice). Every id is
 *  a real Tool2D union member with a canvas handler in useEditorInteractions —
 *  except internalShape, whose handler is not built yet (kept because María
 *  wants "Forma interna"; the other unwired tools were removed per #529). */
export const DOCK_2D_CATALOG: DockToolDef[] = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'Z' },
  { id: 'editPattern', icon: PenLine, label: 'Editar patrón', shortcut: 'Q' },
  // Sin shortcut a propósito: CLO no le da atajo a su Add Point, y las 26
  // letras del contexto 2d están tomadas — inventarle uno enseñaría un hábito
  // que CLO rompe (maria-203).
  { id: 'point', icon: GitCommitHorizontal, label: 'Punto' },
  { id: 'pen', icon: PenTool, label: 'Pluma', shortcut: 'H' },
  { id: 'line', icon: Minus, label: 'Línea', shortcut: '⇧L' },
  { id: 'rectangle', icon: Square, label: 'Rectángulo', shortcut: 'S' },
  { id: 'scissors', icon: Scissors, label: 'Tijeras', shortcut: 'X' },
  { id: 'measure', icon: Ruler, label: 'Medir', shortcut: 'M' },
  { id: 'seam', icon: Spline, label: 'Coser', shortcut: 'N' },
  { id: 'seamEdit', icon: Waypoints, label: 'Editar costuras', shortcut: 'B' },
  { id: 'internalShape', icon: Shapes, label: 'Forma interna', shortcut: 'G' },
  { id: 'notch', icon: Triangle, label: 'Piquete' },
  { id: 'seamAllowance', icon: SquareDashed, label: 'Margen de costura', shortcut: 'O' },
  { id: 'grainline', icon: MoveVertical, label: 'Hilo' },
];

export function getDockToolById(id: string): DockToolDef | undefined {
  return DOCK_2D_CATALOG.find((t) => t.id === id);
}
