/**
 * El estado de Editar patrón (`Q`) y las operaciones puras sobre sus líneas
 * (spec 2026-09-24 §§ 3-4).
 *
 * El contorno conserva los campos de siempre —`nodes`, `selectedNodes`,
 * `hoveredSegment`…—, que leen `PatternEditor`, el overlay y los tests de
 * antes. Cada interna editable lleva los mismos campos en `internas`, y
 * `vistas()` las enseña todas como una sola lista: así los gestos se escriben
 * una vez para cualquier línea (decisión 5 de la spec: una sola vía de
 * edición).
 *
 * Vive aparte de `useEditPattern.ts` para que el hook, sus tests y los módulos
 * puros compartan el vocabulario sin ciclos de importación.
 */
import type { PathCommand, PatternPiece, Point2D } from '../../types/types';
import { extractNodes, extractNodesFromPath, type EditableNode } from './nodeEditorUtils';
import { pieceLocalToPattern } from './pieceTransform';
import { indiceSegunLosBordes } from '../../utils/semanticEdges';
import {
  CLAVE_CONTORNO, claveDeInterna, internasEditables, lineIdDeClave, type ClaveLinea,
} from './lineaEditable';

// ─── Estado ───

export interface EdicionDeInterna {
  lineId: string;
  /** El path cuando se leyó: su identidad dice si la línea cambió desde fuera. */
  path: PathCommand[];
  nodes: EditableNode[];
  selectedNodes: Set<number>;
  selectedSegments: Set<number>;
  hoveredNode: number | null;
  hoveredSegment: number | null;
  addPointPreview: Point2D | null;
}

export interface EditPatternState {
  isEditing: boolean;
  editingPieceId: string | null;
  hoveredPieceId: string | null;
  nodes: EditableNode[];
  selectedNodes: Set<number>;       // commandIndex set (multi-select)
  selectedSegments: Set<number>;    // commandIndex of segment destination
  hoveredNode: number | null;       // commandIndex
  hoveredSegment: number | null;    // commandIndex
  addPointPreview: Point2D | null;  // preview dot on edge hover
  marquee: { start: Point2D; current: Point2D } | null;
  /**
   * Las internas editables de la pieza en edición —o bajo el ratón—, con los
   * mismos campos que el contorno (spec § 3.2). Opcional para que los estados
   * escritos a mano de los tests de antes sigan valiendo; ausente = ninguna.
   */
  internas?: EdicionDeInterna[];
}

export const SIN_INTERNAS: EdicionDeInterna[] = [];
const SIN_PATH: PathCommand[] = [];

export const INITIAL_STATE: EditPatternState = {
  isEditing: false,
  editingPieceId: null,
  hoveredPieceId: null,
  nodes: [],
  selectedNodes: new Set<number>(),
  selectedSegments: new Set<number>(),
  hoveredNode: null,
  hoveredSegment: null,
  addPointPreview: null,
  marquee: null,
  internas: SIN_INTERNAS,
};

/** Las internas editables de una pieza, sin nada elegido ni bajo el ratón. */
export function extraerInternas(piece: PatternPiece): EdicionDeInterna[] {
  return internasEditables(piece).map(line => ({
    lineId: line.id,
    path: line.path,
    nodes: extractNodesFromPath(line.path, piece.id),
    selectedNodes: new Set<number>(),
    selectedSegments: new Set<number>(),
    hoveredNode: null,
    hoveredSegment: null,
    addPointPreview: null,
  }));
}

/** Al entrar en una pieza: todas sus líneas, nada elegido. */
export function estadoDeEntrada(piece: PatternPiece): EditPatternState {
  return {
    isEditing: true,
    editingPieceId: piece.id,
    hoveredPieceId: null,
    nodes: extractNodes(piece),
    selectedNodes: new Set<number>(),
    selectedSegments: new Set<number>(),
    hoveredNode: null,
    hoveredSegment: null,
    addPointPreview: null,
    marquee: null,
    internas: extraerInternas(piece),
  };
}

/**
 * Rebuild overlay nodes from the piece's current outline after an EXTERNAL
 * change (undo/redo restoring project state), so the anchor dots never detach
 * from the path. Selections and transient hover state are cleared, not
 * remapped: command indices shift when an insert is undone, so a surviving
 * index would silently denote different geometry (and a Delete on it would
 * destroy a legitimate corner). Las internas se releen igual (spec § 4.7).
 */
export function resyncStateToPiece(
  state: EditPatternState,
  piece: PatternPiece,
): EditPatternState {
  return {
    ...state,
    nodes: extractNodes(piece),
    selectedNodes: new Set<number>(),
    selectedSegments: new Set<number>(),
    hoveredPieceId: null,
    hoveredNode: null,
    hoveredSegment: null,
    addPointPreview: null,
    marquee: null,
    internas: extraerInternas(piece),
  };
}

// ─── Las líneas como una sola lista ───

export interface VistaDeLinea {
  clave: ClaveLinea;
  path: PathCommand[];
  nodes: EditableNode[];
  selectedNodes: Set<number>;
  selectedSegments: Set<number>;
  hoveredNode: number | null;
  hoveredSegment: number | null;
  addPointPreview: Point2D | null;
}

/**
 * Todas las líneas del estado, el contorno primero: es el orden de pintado, y
 * la última interna es la de encima. `contorno` es el path de la pieza de hoy;
 * quien solo lee selección u hover puede omitirlo.
 */
export function vistas(state: EditPatternState, contorno: PathCommand[] = SIN_PATH): VistaDeLinea[] {
  return [
    {
      clave: CLAVE_CONTORNO,
      path: contorno,
      nodes: state.nodes,
      selectedNodes: state.selectedNodes,
      selectedSegments: state.selectedSegments,
      hoveredNode: state.hoveredNode,
      hoveredSegment: state.hoveredSegment,
      addPointPreview: state.addPointPreview,
    },
    ...(state.internas ?? SIN_INTERNAS).map(i => ({
      clave: claveDeInterna(i.lineId),
      path: i.path,
      nodes: i.nodes,
      selectedNodes: i.selectedNodes,
      selectedSegments: i.selectedSegments,
      hoveredNode: i.hoveredNode,
      hoveredSegment: i.hoveredSegment,
      addPointPreview: i.addPointPreview,
    })),
  ];
}

export type CamposDeLinea = Partial<Pick<VistaDeLinea,
  'selectedNodes' | 'selectedSegments' | 'hoveredNode' | 'hoveredSegment' | 'addPointPreview'>>;

/** El estado con los campos de UNA línea cambiados; las demás, intactas. */
export function conLinea(state: EditPatternState, clave: ClaveLinea, campos: CamposDeLinea): EditPatternState {
  const lineId = lineIdDeClave(clave);
  if (lineId === null) return { ...state, ...campos };
  return {
    ...state,
    internas: (state.internas ?? SIN_INTERNAS).map(i => (i.lineId === lineId ? { ...i, ...campos } : i)),
  };
}

const conTodas = (state: EditPatternState, campos: () => CamposDeLinea): EditPatternState => ({
  ...state,
  ...campos(),
  internas: state.internas?.map(i => ({ ...i, ...campos() })),
});

/** Ningún punto elegido en ninguna línea. */
export function sinPuntos(state: EditPatternState): EditPatternState {
  return conTodas(state, () => ({ selectedNodes: new Set<number>() }));
}

/** Ningún tramo elegido en ninguna línea. */
export function sinTramos(state: EditPatternState): EditPatternState {
  return conTodas(state, () => ({ selectedSegments: new Set<number>() }));
}

/** Nada elegido en ninguna línea. */
export function sinSeleccion(state: EditPatternState): EditPatternState {
  return sinTramos(sinPuntos(state));
}

/** Nada bajo el ratón en ninguna línea. */
export function sinHover(state: EditPatternState): EditPatternState {
  return conTodas(state, () => ({ hoveredNode: null, hoveredSegment: null, addPointPreview: null }));
}

export function algoElegido(state: EditPatternState): boolean {
  return vistas(state).some(v => v.selectedNodes.size > 0 || v.selectedSegments.size > 0);
}

/**
 * La interna que Q publica en `editor.selectedInternalLine` (spec § 3.5): la
 * única línea con algo elegido, si es una interna. Un tramo solo, con su
 * `segmentIndex`; puntos, la línea sin tramo. Nada, el contorno o varias
 * líneas: ninguna.
 */
export function internaElegidaDe(state: EditPatternState): { lineId: string; segmentIndex?: number } | null {
  const conAlgo = vistas(state).filter(v => v.selectedNodes.size > 0 || v.selectedSegments.size > 0);
  if (conAlgo.length !== 1) return null;
  const [v] = conAlgo;
  const lineId = lineIdDeClave(v.clave);
  if (lineId === null) return null;
  if (v.selectedNodes.size === 0 && v.selectedSegments.size === 1) {
    return { lineId, segmentIndex: [...v.selectedSegments][0] };
  }
  return { lineId };
}

/** Qué hay bajo el ratón, en cualquier línea: lo que decide el cursor. */
export function hoverDe(state: EditPatternState): { tipo: 'punto' | 'tramo'; conPreview: boolean } | null {
  for (const v of vistas(state)) {
    if (v.hoveredNode !== null) return { tipo: 'punto', conPreview: false };
    if (v.hoveredSegment !== null) return { tipo: 'tramo', conPreview: v.addPointPreview !== null };
  }
  return null;
}

/** Relee path y nodos de las líneas que cambió un verbo de Q, sin tocar lo elegido. */
export function refrescarLineas(
  state: EditPatternState,
  piece: PatternPiece,
  claves: Iterable<ClaveLinea>,
): EditPatternState {
  let next = state;
  for (const clave of claves) {
    const lineId = lineIdDeClave(clave);
    if (lineId === null) {
      next = { ...next, nodes: extractNodes(piece) };
      continue;
    }
    const line = piece.internals.find(l => l.id === lineId);
    if (!line) continue;
    next = {
      ...next,
      internas: (next.internas ?? SIN_INTERNAS).map(i => (i.lineId === lineId
        ? { ...i, path: line.path, nodes: extractNodesFromPath(line.path, piece.id) }
        : i)),
    };
  }
  return next;
}

// ─── La identidad de los paths: quién cambió qué ───

/**
 * Los paths que Q edita de una pieza, en orden. Su identidad dice si algo
 * cambió desde fuera (deshacer, el copiloto): si Q no lo escribió, se relee.
 * Un piquete o un doblez de pliegue no está aquí, así que cambiarlos no suelta
 * lo elegido.
 */
export function pathsEditables(piece: PatternPiece): PathCommand[][] {
  return [piece.outline, ...internasEditables(piece).map(l => l.path)];
}

export function mismosPaths(a: readonly PathCommand[][] | null, b: readonly PathCommand[][]): boolean {
  return !!a && a.length === b.length && a.every((p, i) => p === b[i]);
}

// ─── Arrastre ───

/** Lo que un gesto arrastra de UNA línea. */
export interface ArrastreDeLinea {
  /** El path de la línea al empezar el gesto: cada frame se calcula desde aquí. */
  startPath: PathCommand[];
  /** commandIndex → posición original (un tramo agarrado guarda sus dos extremos). */
  startPositions: Map<number, Point2D>;
  /** Grupo de anclas coincidentes de cada punto arrastrado, en `startPath`. */
  groups?: Map<number, number[]>;
}

/**
 * Find the "from" node of a segment. The segment ends at `commandIndex`;
 * the "from" node is the previous node whose commandIndex < commandIndex.
 */
export function findFromNode(nodes: EditableNode[], commandIndex: number): EditableNode | null {
  let best: EditableNode | null = null;
  let bestIdx = -1;
  for (const node of nodes) {
    const ci = node.ref.commandIndex;
    if (ci < commandIndex && ci > bestIdx) {
      bestIdx = ci;
      best = node;
    }
  }
  return best;
}

/**
 * Lo que mueve un gesto que empieza con esta selección (spec § 4.1): los
 * puntos elegidos de cada línea, o los dos extremos de cada tramo elegido.
 * Un solo vector para todas.
 */
export function arrastreDe(
  state: EditPatternState,
  contorno: PathCommand[],
  tipo: 'node' | 'segment',
): Map<ClaveLinea, ArrastreDeLinea> {
  const out = new Map<ClaveLinea, ArrastreDeLinea>();
  for (const v of vistas(state, contorno)) {
    const startPositions = new Map<number, Point2D>();
    if (tipo === 'node') {
      for (const ci of v.selectedNodes) {
        const node = v.nodes.find(n => n.ref.commandIndex === ci);
        if (node) startPositions.set(ci, { ...node.position });
      }
    } else {
      for (const segIdx of v.selectedSegments) {
        // La `Z` mueve la `M` de SU subcamino, no la del primero (#1205).
        const toIndex = indiceSegunLosBordes(v.path, segIdx);
        const toNode = v.nodes.find(n => n.ref.commandIndex === toIndex);
        if (toNode) startPositions.set(toIndex, { ...toNode.position });
        const fromNode = findFromNode(v.nodes, segIdx);
        if (fromNode && !startPositions.has(fromNode.ref.commandIndex)) {
          startPositions.set(fromNode.ref.commandIndex, { ...fromNode.position });
        }
      }
    }
    if (startPositions.size > 0) out.set(v.clave, { startPath: v.path, startPositions });
  }
  return out;
}

// ─── El marco de selección ───

/**
 * Resuelve el marco (spec § 4.1): coge los puntos de todas las líneas que caen
 * dentro, además de lo que ya había (con Shift). El marco es un rectángulo del
 * patrón; cada nodo se lleva a patrón con el giro de su pieza antes de probar.
 */
export function marcoSelecciona(state: EditPatternState, piece: PatternPiece): EditPatternState {
  if (!state.marquee) return state;
  const { start, current } = state.marquee;
  const minX = Math.min(start.x, current.x);
  const maxX = Math.max(start.x, current.x);
  const minY = Math.min(start.y, current.y);
  const maxY = Math.max(start.y, current.y);
  const dentro = (nodes: EditableNode[], ya: Set<number>): Set<number> => {
    const out = new Set(ya);
    for (const node of nodes) {
      const { x, y } = pieceLocalToPattern(node.position, piece);
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) out.add(node.ref.commandIndex);
    }
    return out;
  };
  return {
    ...state,
    marquee: null,
    selectedNodes: dentro(state.nodes, state.selectedNodes),
    internas: state.internas?.map(i => ({ ...i, selectedNodes: dentro(i.nodes, i.selectedNodes) })),
  };
}
