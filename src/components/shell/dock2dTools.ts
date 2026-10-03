import type { ComponentType } from 'react';
import {
  MousePointer2, PenTool, Square, Circle, Scissors, Ruler,
  PenLine, MoveVertical,
  SquareDashed, GitCommitHorizontal, Waypoints, Hand,
} from 'lucide-react';
import {
  InternalLineIcon, SeamIcon, NotchIcon,
  MedirBordeIcon, CompararLargosIcon, AbrirPiezaIcon, PonerAvioIcon,
  ElasticoIcon, PliegueIcon, TrianguloIcon,
} from './dockIcons';

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
  /** Su grupo en el margen (spec 2026-10-02 § 4.3): seleccionar y editar,
   *  dibujar, coser. Entre dos grupos hay aire. */
  grupo: 'editar' | 'dibujar' | 'coser';
}

/** Curated catalog of dock-eligible 2D tools. Render order = this order; the
 *  first 12 are the default set (DEFAULT_DOCK_2D_IDS in dockSlice). Every id is
 *  a real Tool2D union member with a canvas handler in useEditorInteractions. */
export const DOCK_2D_CATALOG: DockToolDef[] = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'Z', grupo: 'editar' },
  { id: 'editPattern', icon: PenLine, label: 'Editar patrón', shortcut: 'Q', grupo: 'editar' },
  // Sin shortcut a propósito: CLO no le da atajo a su Add Point, y las 26
  // letras del contexto 2d están tomadas — inventarle uno enseñaría un hábito
  // que CLO rompe (maria-203).
  { id: 'point', icon: GitCommitHorizontal, label: 'Punto', grupo: 'editar' },
  { id: 'pen', icon: PenTool, label: 'Pluma', shortcut: 'H', grupo: 'dibujar' },
  // 'line' murió en la unificación de líneas internas (spec 2026-08-29):
  // internalShape hereda su ranura y su atajo de dock, con G.
  // Icono propio (#1101): `Shapes` prometía «crear formas geométricas» —
  // justo la herramienta que ella creyó que era, y que además pidió aparte.
  { id: 'internalShape', icon: InternalLineIcon, label: 'Línea interna', shortcut: 'G', grupo: 'dibujar' },
  { id: 'rectangle', icon: Square, label: 'Rectángulo', shortcut: 'S', grupo: 'dibujar' },
  { id: 'scissors', icon: Scissors, label: 'Tijeras', shortcut: 'X', grupo: 'dibujar' },
  { id: 'measure', icon: Ruler, label: 'Medir', shortcut: 'M', grupo: 'dibujar' },
  // Icono propio (#1101): `Spline` era una curva bézier con sus dos nodos, y
  // ella lo leyó literalmente como «el icono de crear curvas».
  { id: 'seam', icon: SeamIcon, label: 'Coser', shortcut: 'N', grupo: 'coser' },
  { id: 'seamEdit', icon: Waypoints, label: 'Editar costuras', shortcut: 'B', grupo: 'coser' },
  // Margen y piquete cierran el grupo de costura, detrás de seam/seamEdit:
  // son las herramientas de #1027 y #1029 y ahora entran en el default, así
  // que van ANTES que las que quedan fuera (el catálogo abre con el default,
  // en orden — lo fija dock2dTools.test.ts).
  { id: 'seamAllowance', icon: SquareDashed, label: 'Margen de costura', shortcut: 'O', grupo: 'coser' },
  // Icono propio (#1101): `Triangle` prometía un triángulo, y eso es
  // exactamente lo que ella esperaba que dibujara la herramienta.
  { id: 'notch', icon: NotchIcon, label: 'Piquete', shortcut: '⇧N', grupo: 'coser' },
  // Fuera del default:
  // El círculo (#1111) entra al catálogo, no al default: las doce de fábrica
  // están medidas contra el trabajo diario de María y sacar una para meterlo
  // sería cambiarle el dock sin haberlo pedido. Con su tecla E y el
  // personalizador ya tiene puerta.
  { id: 'circle', icon: Circle, label: 'Elipse (círculo)', shortcut: 'E', grupo: 'dibujar' },
  // El triángulo (#1111, tanda 8) entra al catálogo por la misma razón que el
  // círculo: al default no, sin cambiarle el dock a María sin que lo pidiera.
  // Sin shortcut a propósito, igual que las cinco de la tanda 6: repartir
  // mnemónicos inventados enseñaría un hábito que CLO rompe.
  { id: 'triangle', icon: TrianguloIcon, label: 'Triángulo', grupo: 'dibujar' },
  { id: 'grainline', icon: MoveVertical, label: 'Hilo', shortcut: '⇧G', grupo: 'dibujar' },
  // Las cinco del censo del 2026-09-05: tenían el gesto entero y ninguna
  // puerta, así que solo se alcanzaban si el copiloto las activaba por su
  // cuenta. Se ejercitaron una a una en Chrome antes de abrirles esta.
  //
  // Al catálogo y NO al default, mismo criterio que el círculo: a 1366×643 el
  // dock con doce mide 596 px de 643 y cada herramienta cuesta 43 px, o sea que
  // el techo real son trece. Meterlas de fábrica sería sacarle a María una de
  // las doce que ya tiene medidas contra su trabajo diario.
  //
  // Y sin `shortcut`, igual que `point` unas líneas más arriba: de las 26
  // letras del contexto 2d solo queda libre la `y`, y repartir mnemónicos
  // inventados entre cinco enseñaría un hábito que CLO rompe. La puerta es el
  // botón del catálogo más el personalizador ＋, que sí escala porque scrollea.
  { id: 'hand', icon: Hand, label: 'Mano', grupo: 'editar' },
  { id: 'measureCurve', icon: MedirBordeIcon, label: 'Medir el borde', grupo: 'dibujar' },
  { id: 'compareCurves', icon: CompararLargosIcon, label: 'Comparar largos', grupo: 'dibujar' },
  { id: 'slashAndSpread', icon: AbrirPiezaIcon, label: 'Abrir la pieza', grupo: 'editar' },
  { id: 'trimPlace', icon: PonerAvioIcon, label: 'Poner avío', grupo: 'coser' },
  // Las otras dos del censo, que el 05-09 se quedaron fuera con su razón
  // escrita. Las dos razones eran ciertas y las dos se cerraron:
  //
  //   elastic  no se podía seleccionar ni borrar, porque el resalte leía
  //            `editor.selectedElasticId`, un campo de Redux sin un solo
  //            escritor. Ahora el resalte cuelga del local —que sí se escribe—
  //            y Supr borra el seleccionado.
  //   pleat    «nadie lo pinta» era falso: `PieceRenderer` dibuja las líneas
  //            `fold` con sus marcas de monte y valle desde siempre. Lo que
  //            fallaba estaba antes, en `generatePleatFoldLines`, que rebanaba
  //            el rango del borde y perdía su punto de arranque: devolvía cero
  //            pliegues en CUALQUIER borde de un comando, o sea los cuatro
  //            lados de un rectángulo.
  { id: 'elastic', icon: ElasticoIcon, label: 'Elástico', grupo: 'coser' },
  { id: 'pleat', icon: PliegueIcon, label: 'Pliegue', grupo: 'coser' },
];

export function getDockToolById(id: string): DockToolDef | undefined {
  return DOCK_2D_CATALOG.find((t) => t.id === id);
}
