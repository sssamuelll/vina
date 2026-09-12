import type { InternalLineSelection, PatternPiece, SaSelection, Tool2D, Trazo, TrazoSelection } from '../../../types/types';
import { margenEnPunto } from '../../../utils/seam/margenEnPunto';
import { cotaDeMargen } from './cotaDeMargen';
import { cotasDeLineaInterna, cotasDePieza, cotasDeTrazo, type Cota } from './cotas';
import { cotasDelTramoEnCurso, type TramoEnCurso } from './tramoEnCurso';
import { cotasDelNodo } from './nodo';
import { formatMedida } from './parseMedida';

export interface SeamAllowanceAnchor {
  pieceId: string;
  edgeId: string;
  t: number;
}

export interface SujetoInput {
  activeTool: Tool2D;
  pieces: PatternPiece[];
  selectedPieceIds: string[];
  selectedInternalLine: InternalLineSelection | null;
  /** La pieza que Rectángulo acaba de crear (enfriada a `null` por `PatternEditor`, spec § 3.1). */
  hotId: string | null;
  isDragging: boolean;
  contextMenuOpen: boolean;
  calibrationActive: boolean;
  /** Capas ocultas (`simulation.hiddenLayerIds`): una pieza oculta no tiene cotas. */
  hiddenLayerIds: readonly number[];
  /** Capas bloqueadas (`project.layerLocked`): misma regla que el candado de pieza. */
  layerLocked: Readonly<Record<number, boolean>>;
  /** Opcionales para que los consumidores anteriores conserven su firma. */
  saSelection?: SaSelection | null;
  saAncla?: SeamAllowanceAnchor | null;
  saHover?: SeamAllowanceAnchor | null;
  /**
   * El tramo congelado con Tab mientras se dibuja (#1129). Vive en el estado
   * local del hook de la pluma o de la línea interna, no en Redux, así que
   * llega como argumento — igual que le pasará a la selección de nodos.
   */
  tramoEnCurso?: TramoEnCurso | null;
  /**
   * El nodo que se está editando en «Editar patrón» (#1112). Como el tramo en
   * curso, vive en el estado LOCAL de su hook y por eso llega como argumento —
   * es una de las dos clases de sujeto que un `createSelector` puro no podría
   * alcanzar, y de ahí que la escalera del sujeto activo tenga que recibirlas.
   *
   * Solo con UNO seleccionado: lo único que comparten dos o más nodos es su
   * desplazamiento, y eso es otra cota (decisión 5 de la gramática de la
   * tanda 6, todavía sin implementar).
   */
  nodoSeleccionado?: { pieceId: string; commandIndex: number } | null;
  /**
   * Los trazos VISIBLES (spec 2026-09-12 § 5.3). `PatternEditor` los filtra por
   * «Construcción» antes de pasarlos, así que aquí «no está en la lista» y
   * «no se ve» son el mismo hecho.
   */
  trazos?: readonly Trazo[];
  /** El tramo de trazo seleccionado (`editor.selectedTrazo`). */
  selectedTrazo?: TrazoSelection | null;
}

export interface Sujeto {
  piece: PatternPiece | null;
  /** Creación caliente: confirmar una cota también escribe el default del próximo rectángulo. */
  caliente: boolean;
  cotas: Cota[];
  /** Lectura transitoria del borde bajo el ratón; nunca es un blanco. */
  lectura: Cota | null;
  /** La lectura viene de una pieza o capa bloqueada: se ve apagada. Independiente de `disabled` (el ancla). */
  lecturaApagada: boolean;
  /** El borde bajo el ratón que pasó las compuertas, para el resalte — aunque la lectura se suprima. */
  bordeLeido: { pieceId: string; edgeId: string } | null;
  /** Pieza bloqueada: las cotas se ven apagadas y no se editan. */
  disabled: boolean;
  /** La línea de la tira que nombra qué se edita; `null` si no hay nada que decir. */
  lineaDeSujeto: string | null;
}

const CON_COTAS_DE_PIEZA: ReadonlySet<Tool2D> = new Set<Tool2D>(['select', 'transform', 'rectangle', 'circle', 'triangle']);

/** Las que crean una pieza arrastrando: la recién nacida sale caliente y sus
 *  cotas escriben el default de la próxima (#1111 le dio la del círculo y la
 *  del triángulo). */
const CREAN_EN_CALIENTE: ReadonlySet<Tool2D> = new Set<Tool2D>(['rectangle', 'circle', 'triangle']);

/**
 * Las cuatro herramientas 2D que toman el sujeto de la SELECCIÓN y no del
 * cursor (#1117). Las otras veinte son de hit-test: ahí el silencio dice lo
 * mismo que el cursor. Estas mueren mudas de verdad — María entra, hace clic
 * sobre la pieza y no pasa nada, porque la pieza no estaba *seleccionada*.
 *
 * `requiresSelection` de las definiciones NO sirve de puerta: es metadata del
 * copiloto, no del ratón, y `seamAllowance`, `grainline`, `internalShape` y
 * `point` la declaran sin necesitarla. Estas cuatro están medidas una a una.
 */
export const HERRAMIENTAS_QUE_PIDEN_PIEZA = ['offsetOutline', 'slashAndSpread', 'extendTrim', 'transform'] as const;

/**
 * Qué pide cada una, con el nombre que ya tiene escrito (`shortcuts/defaults.ts`
 * y el registro de herramientas): un nombre por concepto. `maximo` es cuántas
 * piezas aguanta — desplazar y extender trabajan sobre una sola, y con dos
 * seleccionadas mueren igual de silenciosas que con cero.
 */
const PIDEN: Record<string, { pista: string; maximo: number }> = {
  offsetOutline: { pista: 'Selecciona una sola pieza para usar Desplazar contorno', maximo: 1 },
  extendTrim: { pista: 'Selecciona una sola pieza para usar Extender / recortar', maximo: 1 },
  // Sin nombrar la herramienta: ahora se llama «Abrir la pieza», y la frase
  // ya dice «abrir». Repetirlo no enseña nada — las otras tres lo nombran
  // porque su verbo solo no distingue cuál de las cuatro es.
  slashAndSpread: { pista: 'Selecciona la pieza que vas a abrir', maximo: Infinity },
  transform: { pista: 'Selecciona la pieza o piezas para usar Transformar patrón', maximo: Infinity },
};

/**
 * Lo que a la herramienta le falta para poder trabajar, dicho ANTES del clic
 * (#1117). `null` = no hay nada que decir: o no es de las que piden pieza, o
 * ya tiene su selección.
 */
export function faltaSujeto(activeTool: string, selectedPieceIds: string[]): string | null {
  const piden = PIDEN[activeTool];
  if (!piden) return null;
  const cuantas = selectedPieceIds.length;
  return cuantas >= 1 && cuantas <= piden.maximo ? null : piden.pista;
}

/**
 * Regla del sujeto (spec 2026-08-30 § 3.1): un sujeto, el más reciente.
 * Caliente solo si Rectángulo acaba de crear la pieza y sigue seleccionada;
 * seleccionar una pieza cualquiera nunca escribe el default (un DXF de 892 mm
 * no puede volverse el ancho del próximo rectángulo). Las cotas se ocultan
 * mientras se arrastra, con el menú abierto o en calibración (la compuerta
 * de `FloatingActionBar`), y no existen con dos piezas. Una interna
 * seleccionada gana sobre la pieza que la contiene y recibe sus propias cotas.
 */
export function cotasDelSujeto(input: SujetoInput, defaultRect: { width: number; height: number }): Sujeto {
  const nada = (linea: string | null): Sujeto => ({
    piece: null,
    caliente: false,
    cotas: [],
    lectura: null,
    lecturaApagada: false,
    bordeLeido: null,
    disabled: false,
    lineaDeSujeto: linea,
  });
  // Un trazo vivo gana a cualquier selección: la regla del sujeto es «el más
  // reciente», y no hay nada más reciente que lo que se está dibujando ahora
  // mismo. Va antes que todo lo demás por eso.
  if (input.tramoEnCurso) {
    return {
      piece: null,
      caliente: false,
      cotas: cotasDelTramoEnCurso(input.tramoEnCurso),
      lectura: null,
      lecturaApagada: false,
      bordeLeido: null,
      disabled: false,
      lineaDeSujeto: 'Editando: el tramo en curso',
    };
  }

  // Un nodo en edición gana a la pieza que lo contiene, por la misma regla de
  // especificidad que hace ganar a una línea interna seleccionada: una
  // sub-selección siempre manda sobre su contenedor.
  if (input.nodoSeleccionado) {
    const piezaDelNodo = input.pieces.find(p => p.id === input.nodoSeleccionado!.pieceId);
    const capaDelNodo = piezaDelNodo?.layer ?? 1;
    if (piezaDelNodo && !input.hiddenLayerIds.includes(capaDelNodo)) {
      const cotas = cotasDelNodo(piezaDelNodo, input.nodoSeleccionado.commandIndex);
      if (cotas.length > 0) {
        return {
          piece: piezaDelNodo,
          caliente: false,
          cotas,
          lectura: null,
          lecturaApagada: false,
          bordeLeido: null,
          disabled: Boolean(piezaDelNodo.locked) || Boolean(input.layerLocked[capaDelNodo]),
          lineaDeSujeto: 'Editando: el punto seleccionado',
        };
      }
    }
  }

  const lineaRect = input.activeTool === 'rectangle'
    ? `Un clic crea ${formatMedida(defaultRect.width, 'mm').replace(' mm', '')} × ${formatMedida(defaultRect.height, 'mm')} · arrastra para dibujar`
    : null;

  if (input.activeTool === 'seamAllowance') {
    if (input.isDragging || input.contextMenuOpen || input.calibrationActive) return nada(null);

    const selection = input.saSelection;
    const selected = selection?.kind === 'edge' && selection.items.length === 1
      ? selection.items[0]
      : null;
    const ancla = selected
      && input.saAncla?.pieceId === selected.pieceId
      && input.saAncla.edgeId === selected.edgeId
      ? input.saAncla
      : null;

    const resolve = (anchor: SeamAllowanceAnchor | null | undefined) => {
      if (!anchor) return null;
      const piece = input.pieces.find(candidate => candidate.id === anchor.pieceId);
      const edge = piece?.edges?.find(candidate => candidate.id === anchor.edgeId);
      if (!piece || !edge) return null;
      const capa = piece.layer ?? 1;
      if (input.hiddenLayerIds.includes(capa)) return null;
      const cota = cotaDeMargen(piece, edge, anchor.t);
      if (!cota) return null;
      return { piece, edge, cota, margen: margenEnPunto(piece, edge, anchor.t), capa };
    };

    const anclada = resolve(ancla);
    const leida = resolve(input.saHover);
    const mismaFuente = Boolean(anclada && leida
      && anclada.piece.id === leida.piece.id
      && anclada.edge.id === leida.edge.id
      && (anclada.margen.fuente === 'tramo'
        ? leida.margen.fuente === 'tramo' && anclada.margen.spanIndex === leida.margen.spanIndex
        : anclada.margen.fuente === leida.margen.fuente));
    // Dos chips, dos piezas posibles, dos candados (revisión 2026-09-02): el
    // ancla apaga sus chips y la lectura se apaga sola. Colapsarlos en una
    // bandera prometía escritura sobre una pieza bloqueada.
    const apagada = (r: NonNullable<typeof anclada>) => Boolean(r.piece.locked) || Boolean(input.layerLocked[r.capa]);

    return {
      piece: (anclada ?? leida)?.piece ?? null,
      caliente: false,
      cotas: anclada ? [anclada.cota] : [],
      lectura: mismaFuente ? null : leida?.cota ?? null,
      lecturaApagada: leida ? apagada(leida) : false,
      bordeLeido: leida ? { pieceId: leida.piece.id, edgeId: leida.edge.id } : null,
      disabled: anclada ? apagada(anclada) : false,
      lineaDeSujeto: anclada ? 'Editando: este borde' : null,
    };
  }

  // Un tramo de trazo seleccionado es sujeto por la misma regla de
  // especificidad que la interna: manda sobre cualquier pieza seleccionada.
  if (input.selectedTrazo) {
    if (input.isDragging || input.contextMenuOpen || input.calibrationActive) return nada(lineaRect);
    const trazo = input.trazos?.find(t => t.id === input.selectedTrazo!.trazoId) ?? null;
    // Oculto (`trazos` ya viene filtrado) o borrado por deshacer: sin sujeto.
    if (trazo) {
      return {
        piece: null,
        caliente: false,
        cotas: cotasDeTrazo(trazo, input.selectedTrazo.segmentIndex),
        lectura: null,
        lecturaApagada: false,
        bordeLeido: null,
        disabled: false,
        lineaDeSujeto: 'Editando: el tramo seleccionado',
      };
    }
  }

  if (input.selectedInternalLine) {
    if (input.isDragging || input.contextMenuOpen || input.calibrationActive) return nada(lineaRect);
    const piece = input.pieces.find(p => p.id === input.selectedInternalLine!.pieceId) ?? null;
    const line = piece?.internals.find(internal => (
      internal.id === input.selectedInternalLine!.lineId
    )) ?? null;
    // Colgante (undo borró la línea, el par pieza/línea sigue en Redux): no
    // hay cotas de interna que mostrar, pero la pieza sigue siendo un sujeto
    // válido — cae al camino de abajo en vez de dejar la tira en blanco.
    if (piece && line) {
      const capa = piece.layer ?? 1;
      if (input.hiddenLayerIds.includes(capa)) return nada(lineaRect);
      const { segmentIndex } = input.selectedInternalLine;
      const cotas = cotasDeLineaInterna(piece, line, segmentIndex);
      return {
        piece,
        caliente: false,
        cotas,
        lectura: null,
        lecturaApagada: false,
        bordeLeido: null,
        disabled: Boolean(piece.locked) || Boolean(input.layerLocked[capa]),
        lineaDeSujeto: segmentIndex === undefined
          ? `Editando: la línea seleccionada · ${cotas.length} cotas`
          : 'Editando: el tramo seleccionado',
      };
    }
  }

  if (!CON_COTAS_DE_PIEZA.has(input.activeTool)) return nada(null);
  if (input.selectedPieceIds.length !== 1) return nada(lineaRect);
  if (input.isDragging || input.contextMenuOpen || input.calibrationActive) return nada(lineaRect);
  const piece = input.pieces.find(p => p.id === input.selectedPieceIds[0]) ?? null;
  if (!piece) return nada(lineaRect);
  const capa = piece.layer ?? 1;
  if (input.hiddenLayerIds.includes(capa)) return nada(lineaRect);
  const caliente = CREAN_EN_CALIENTE.has(input.activeTool) && input.hotId === piece.id;
  return {
    piece,
    caliente,
    cotas: cotasDePieza(piece),
    lectura: null,
    lecturaApagada: false,
    bordeLeido: null,
    disabled: Boolean(piece.locked) || Boolean(input.layerLocked[capa]),
    lineaDeSujeto: caliente ? 'Editando: la pieza nueva' : 'Editando: la pieza seleccionada',
  };
}
