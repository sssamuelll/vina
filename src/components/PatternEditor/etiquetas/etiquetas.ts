import type {
  CornerType, InternalLineSelection, NotchOptions, PatternPiece, Point2D, SaSelection, Seam, Tool2D,
} from '../../../types/types';
import { pieceLocalToPattern, pieceLocalToPatternDirection } from '../../../utils/geometry/pieceSpace';
import { resolveNotchAnchor } from '../../../utils/notchAnchor';
import { DEFAULT_NOTCH_OPTIONS } from '../../../utils/notches';
import { piezaBloqueada } from '../../../utils/piezaBloqueada';
import { FORMAS_DE_PIQUETE, notchTool } from '../../../tools/definitions/notch';
import type { EtiquetaDeOpcionProps } from './EtiquetaDeOpcion';
import { textoDelPiquete } from './piquete';

/**
 * Qué etiqueta de opción enseña la selección, dónde va y qué dice (spec
 * 2026-10-02 «la interfaz en papel» § 5.2, P3c). Una función pura sobre el
 * store: `PatternEditor` la pinta y escribe sus cambios.
 */

export interface EtiquetaInput {
  activeTool: Tool2D;
  pieces: PatternPiece[];
  seams: Seam[];
  selectedInternalLine: InternalLineSelection | null;
  selectedSeamId: string | null;
  saSelection: SaSelection | null;
  /** Los interruptores de «Qué se ve»: lo que no se pinta no lleva etiqueta. */
  showNotches: boolean;
  showSewingLines: boolean;
  showSeamAllowance: boolean;
  hiddenLayerIds: readonly number[];
  layerLocked: Readonly<Record<number, boolean>>;
  /** Arrastre, menú del clic derecho o calibración: la cabina se calla, como las cotas. */
  callada: boolean;
}

/**
 * Dónde: `punto` en patrón, `hacia` unitario (pantalla y patrón comparten
 * ejes) y `separacionMm` a escala, más unos px fijos (`posicionDeEtiqueta`).
 */
interface Lugar {
  punto: Point2D;
  hacia: Point2D;
  separacionMm: number;
}

export type Etiqueta =
  | ({ que: 'piquete'; pieceId: string; lineId: string; opciones: NotchOptions; apagada: boolean } & Lugar)
  | ({ que: 'costura'; seamId: string; tipo: Seam['type']; apagada: false } & Lugar)
  | ({ que: 'esquina'; pieceId: string; vertexIndex: number; tipo: CornerType; apagada: boolean } & Lugar);

function unitario(v: Point2D): Point2D {
  const n = Math.hypot(v.x, v.y);
  return n > 1e-12 ? { x: v.x / n, y: v.y / n } : { x: 0, y: -1 };
}

const visible = (piece: PatternPiece, input: EtiquetaInput) => !input.hiddenLayerIds.includes(piece.layer ?? 1);

/** El piquete elegido con Seleccionar: la etiqueta va pasada su punta, hacia dentro de la pieza. */
function delPiquete(input: EtiquetaInput): Etiqueta | null {
  const sel = input.selectedInternalLine;
  if (!sel || input.activeTool !== 'select' || !input.showNotches) return null;
  const piece = input.pieces.find((p) => p.id === sel.pieceId);
  const line = piece?.internals.find((l) => l.id === sel.lineId);
  if (!piece || !line || line.type !== 'notch' || !line.notchAnchor || !visible(piece, input)) return null;
  const resuelta = resolveNotchAnchor(piece.outline, line.notchAnchor);
  if (!resuelta) return null;
  const opciones: NotchOptions = { ...DEFAULT_NOTCH_OPTIONS, ...line.notchOptions };
  return {
    que: 'piquete',
    pieceId: piece.id,
    lineId: line.id,
    opciones,
    apagada: piezaBloqueada(piece, input.layerLocked),
    punto: pieceLocalToPattern(resuelta.point, piece),
    // La normal es de la pieza: con la pieza girada, gira con ella.
    hacia: unitario(pieceLocalToPatternDirection(resuelta.normal, piece)),
    separacionMm: Number(opciones.length) || 0,
  };
}

export function etiquetaDeLaSeleccion(input: EtiquetaInput): Etiqueta | null {
  if (input.callada) return null;
  return delPiquete(input);
}

/** Lo que la pastilla enseña y lo que su menú ofrece (microcopy: solace-wren, 2026-10-09). */
export function presentarEtiqueta(
  e: Etiqueta,
): Pick<EtiquetaDeOpcionProps, 'texto' | 'Dibujo' | 'nombre' | 'nombreDelMenu' | 'opciones' | 'valores'> {
  if (e.que === 'piquete') {
    const texto = textoDelPiquete(e.opciones);
    return {
      texto,
      Dibujo: FORMAS_DE_PIQUETE.find((c) => c.value === e.opciones.shape)?.icon,
      nombre: `Piquete: ${texto}`,
      nombreDelMenu: 'Opciones del piquete',
      // Las mismas del pie, no una copia que se pueda desincronizar.
      opciones: notchTool.options ?? [],
      valores: { shape: e.opciones.shape, count: e.opciones.count, length: e.opciones.length, width: e.opciones.width },
    };
  }
  // ponytail: la costura y la esquina llegan en sus tareas (P3c, Tasks 4 y 5).
  return { texto: '', nombre: '', nombreDelMenu: '', opciones: [], valores: {} };
}

/** Separación fija, en px, entre el objeto (más su separación a escala) y el centro de la pastilla. */
const SEPARACION_PX = 16;

/** El centro de la pastilla en px del contenedor `.pattern-editor`. */
export function posicionDeEtiqueta(e: Etiqueta, pan: Point2D, zoom: number): { left: number; top: number } {
  const lejos = e.separacionMm * zoom + SEPARACION_PX;
  return {
    left: pan.x + e.punto.x * zoom + e.hacia.x * lejos,
    top: pan.y + e.punto.y * zoom + e.hacia.y * lejos,
  };
}

/** La identidad del objeto: otra selección es otra etiqueta, y su menú se cierra. */
export function claveDeEtiqueta(e: Etiqueta): string {
  if (e.que === 'piquete') return `piquete:${e.pieceId}:${e.lineId}`;
  if (e.que === 'costura') return `costura:${e.seamId}`;
  return `esquina:${e.pieceId}:${e.vertexIndex}`;
}
