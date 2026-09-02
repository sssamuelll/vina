import type { ComponentType } from 'react';
import {
  MousePointer2, PenTool, Square, Scissors, Ruler,
  PenLine, MoveVertical,
  SquareDashed, GitCommitHorizontal, Waypoints,
} from 'lucide-react';
import { InternalLineIcon, SeamIcon, NotchIcon } from './dockIcons';

/** Un icono del dock: un glifo de Lucide, o uno propio de `dockIcons.tsx`
 *  cuando el vocabulario de patronaje no existe en ningún set genérico
 *  (#1101). Dock.tsx los pinta igual, con `<Icon size={16} />`. */
export type DockIcon = ComponentType<{ size?: number | string }>;

export interface DockToolDef {
  /** Tool2D id passed to activate2DTool. */
  id: string;
  icon: DockIcon;
  label: string;
  /** Display shortcut (real CLO3D binding). Optional — some tools have none. */
  shortcut?: string;
}

/** Curated catalog of dock-eligible 2D tools. Render order = this order; the
 *  first 12 are the default set (DEFAULT_DOCK_2D_IDS in dockSlice). Every id is
 *  a real Tool2D union member with a canvas handler in useEditorInteractions. */
export const DOCK_2D_CATALOG: DockToolDef[] = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'Z' },
  { id: 'editPattern', icon: PenLine, label: 'Editar patrón', shortcut: 'Q' },
  // Sin shortcut a propósito: CLO no le da atajo a su Add Point, y las 26
  // letras del contexto 2d están tomadas — inventarle uno enseñaría un hábito
  // que CLO rompe (maria-203).
  { id: 'point', icon: GitCommitHorizontal, label: 'Punto' },
  { id: 'pen', icon: PenTool, label: 'Pluma', shortcut: 'H' },
  // 'line' murió en la unificación de líneas internas (spec 2026-08-29):
  // internalShape hereda su ranura y su atajo de dock, con G.
  // Icono propio (#1101): `Shapes` prometía «crear formas geométricas» —
  // justo la herramienta que ella creyó que era, y que además pidió aparte.
  { id: 'internalShape', icon: InternalLineIcon, label: 'Línea interna', shortcut: 'G' },
  { id: 'rectangle', icon: Square, label: 'Rectángulo', shortcut: 'S' },
  { id: 'scissors', icon: Scissors, label: 'Tijeras', shortcut: 'X' },
  { id: 'measure', icon: Ruler, label: 'Medir', shortcut: 'M' },
  // Icono propio (#1101): `Spline` era una curva bézier con sus dos nodos, y
  // ella lo leyó literalmente como «el icono de crear curvas».
  { id: 'seam', icon: SeamIcon, label: 'Coser', shortcut: 'N' },
  { id: 'seamEdit', icon: Waypoints, label: 'Editar costuras', shortcut: 'B' },
  // Margen y piquete cierran el grupo de costura, detrás de seam/seamEdit:
  // son las herramientas de #1027 y #1029 y ahora entran en el default, así
  // que van ANTES que las que quedan fuera (el catálogo abre con el default,
  // en orden — lo fija dock2dTools.test.ts).
  { id: 'seamAllowance', icon: SquareDashed, label: 'Margen de costura', shortcut: 'O' },
  // Icono propio (#1101): `Triangle` prometía un triángulo, y eso es
  // exactamente lo que ella esperaba que dibujara la herramienta.
  { id: 'notch', icon: NotchIcon, label: 'Piquete', shortcut: '⇧N' },
  // Fuera del default:
  { id: 'grainline', icon: MoveVertical, label: 'Hilo', shortcut: '⇧G' },
];

export function getDockToolById(id: string): DockToolDef | undefined {
  return DOCK_2D_CATALOG.find((t) => t.id === id);
}
