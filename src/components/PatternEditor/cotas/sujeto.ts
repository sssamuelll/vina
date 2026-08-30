import type { PatternPiece, Tool2D } from '../../../types/types';
import { cotasDePieza, type Cota } from './cotas';
import { formatMedida } from './parseMedida';

export interface SujetoInput {
  activeTool: Tool2D;
  pieces: PatternPiece[];
  selectedPieceIds: string[];
  selectedInternalLine: { pieceId: string; lineId: string } | null;
  /** La pieza que Rectángulo acaba de crear (enfriada a `null` por `PatternEditor`, spec § 3.1). */
  hotId: string | null;
  isDragging: boolean;
  contextMenuOpen: boolean;
  calibrationActive: boolean;
  /** Capas ocultas (`simulation.hiddenLayerIds`): una pieza oculta no tiene cotas. */
  hiddenLayerIds: readonly number[];
  /** Capas bloqueadas (`project.layerLocked`): misma regla que el candado de pieza. */
  layerLocked: Readonly<Record<number, boolean>>;
}

export interface Sujeto {
  piece: PatternPiece | null;
  /** Creación caliente: confirmar una cota también escribe el default del próximo rectángulo. */
  caliente: boolean;
  cotas: Cota[];
  /** Pieza bloqueada: las cotas se ven apagadas y no se editan. */
  disabled: boolean;
  /** La línea de la tira que nombra qué se edita; `null` si no hay nada que decir. */
  lineaDeSujeto: string | null;
}

const CON_COTAS_DE_PIEZA: ReadonlySet<Tool2D> = new Set<Tool2D>(['select', 'transform', 'rectangle']);

/**
 * Regla del sujeto (spec 2026-08-30 § 3.1): un sujeto, el más reciente.
 * Caliente solo si Rectángulo acaba de crear la pieza y sigue seleccionada;
 * seleccionar una pieza cualquiera nunca escribe el default (un DXF de 892 mm
 * no puede volverse el ancho del próximo rectángulo). Las cotas se ocultan
 * mientras se arrastra, con el menú abierto o en calibración (la compuerta
 * de `FloatingActionBar`), y no existen con dos piezas ni con una interna
 * seleccionada (PR B le da las suyas).
 */
export function cotasDelSujeto(input: SujetoInput, defaultRect: { width: number; height: number }): Sujeto {
  const nada = (linea: string | null): Sujeto => ({ piece: null, caliente: false, cotas: [], disabled: false, lineaDeSujeto: linea });
  const lineaRect = input.activeTool === 'rectangle'
    ? `Un clic crea ${formatMedida(defaultRect.width, 'mm').replace(' mm', '')} × ${formatMedida(defaultRect.height, 'mm')} · arrastra para dibujar`
    : null;
  if (!CON_COTAS_DE_PIEZA.has(input.activeTool)) return nada(null);
  if (input.selectedInternalLine || input.selectedPieceIds.length !== 1) return nada(lineaRect);
  if (input.isDragging || input.contextMenuOpen || input.calibrationActive) return nada(lineaRect);
  const piece = input.pieces.find(p => p.id === input.selectedPieceIds[0]) ?? null;
  if (!piece) return nada(lineaRect);
  const capa = piece.layer ?? 1;
  if (input.hiddenLayerIds.includes(capa)) return nada(lineaRect);
  const caliente = input.activeTool === 'rectangle' && input.hotId === piece.id;
  return {
    piece,
    caliente,
    cotas: cotasDePieza(piece),
    disabled: Boolean(piece.locked) || Boolean(input.layerLocked[capa]),
    lineaDeSujeto: caliente ? 'Editando: la pieza nueva' : 'Editando: la pieza seleccionada',
  };
}
