import type {
  CornerType, InternalLineSelection, NotchOptions, PatternPiece, Point2D, SaSelection, Seam, Tool2D,
} from '../../../types/types';
import { pieceLocalToPattern, pieceLocalToPatternDirection, pieceLocalToPatternMany } from '../../../utils/geometry/pieceSpace';
import { samplePolyline } from '../../../utils/pleatGeometry';
import { resolveEdgePolyline, slicePolylineByT } from '../../../utils/seam/index';
import { nombreDelTipoDeCostura, TIPOS_DE_COSTURA } from '../../../utils/seam/tiposDeCostura';
import { resolveNotchAnchor } from '../../../utils/notchAnchor';
import { DEFAULT_NOTCH_OPTIONS } from '../../../utils/notches';
import { piezaBloqueada } from '../../../utils/piezaBloqueada';
import { FORMAS_DE_PIQUETE, notchTool } from '../../../tools/definitions/notch';
import type { ToolOption } from '../../../tools/types';
import { margenMasAncho } from '../../../utils/seam/esquinaDelMargen';
import { TIPOS_DE_ESQUINA, tipoDeEsquina } from '../../../utils/seam/tiposDeEsquina';
import { centroDe } from '../cotas/loQueSePone';
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

/**
 * La esquina del margen elegida con Seleccionar o con Margen: la etiqueta va
 * sobre el vértice, pasada la punta del margen.
 */
function deLaEsquina(input: EtiquetaInput): Etiqueta | null {
  const sel = input.saSelection;
  if (sel?.kind !== 'vertex' || sel.items.length !== 1 || !input.showSeamAllowance) return null;
  if (input.activeTool !== 'select' && input.activeTool !== 'seamAllowance') return null;
  const { pieceId, vertexIndex } = sel.items[0];
  const piece = input.pieces.find((p) => p.id === pieceId);
  if (!piece || !visible(piece, input)) return null;
  const margen = margenMasAncho(piece);
  const cmd = piece.outline[vertexIndex];
  if (!(margen > 0) || !cmd || (cmd.type !== 'M' && cmd.type !== 'L')) return null;
  const punto = pieceLocalToPattern({ x: cmd.values[0], y: cmd.values[1] }, piece);
  const centro = centroDe(piece);
  return {
    que: 'esquina',
    pieceId,
    vertexIndex,
    tipo: tipoDeEsquina(piece, vertexIndex),
    apagada: piezaBloqueada(piece, input.layerLocked),
    punto,
    // ponytail: del centro de la pieza al vértice; en una esquina cóncava apunta
    // hacia dentro. La bisectriz, si molesta.
    hacia: unitario({ x: punto.x - centro.x, y: punto.y - centro.y }),
    separacionMm: margen * Math.SQRT2,
  };
}

/** Las herramientas donde la costura elegida enseña su etiqueta. */
const CON_ETIQUETA_DE_COSTURA: ReadonlySet<Tool2D> = new Set<Tool2D>(['select', 'seam', 'seamEdit']);

/**
 * La costura elegida: la deja elegida Coser al terminarla, y la elige Editar
 * costuras con un clic en su lado (su puerta de vuelta: con Seleccionar no se
 * pinta ninguna costura, firma de María #210). La etiqueta va en el medio de
 * su mitad A, hacia dentro de la pieza A. Nunca apagada: el tipo de costura
 * no es geometría de la pieza.
 */
function deLaCostura(input: EtiquetaInput): Etiqueta | null {
  if (!input.selectedSeamId || !input.showSewingLines || !CON_ETIQUETA_DE_COSTURA.has(input.activeTool)) return null;
  const seam = input.seams.find((s) => s.id === input.selectedSeamId);
  const pieceA = seam && input.pieces.find((p) => p.id === seam.pieceA.pieceId);
  if (!seam || !pieceA || !visible(pieceA, input)) return null;
  const entera = resolveEdgePolyline(pieceA.outline, pieceA.edges, seam.pieceA.edgeName);
  const { tStart, tEnd } = seam.pieceA;
  const tramo = tStart != null && tEnd != null ? slicePolylineByT(entera, tStart, tEnd) : entera;
  // ponytail: sin tramo resuelto no hay etiqueta; SeamRenderer cae al medio del primer comando.
  if (tramo.length < 2) return null;
  // Con el giro de la pieza, a diferencia de SeamRenderer (deuda #1068): donde
  // el dibujo ya está mal, la etiqueta está en su sitio.
  const punto = samplePolyline(pieceLocalToPatternMany(tramo, pieceA), 0.5).point;
  const centro = centroDe(pieceA);
  return {
    que: 'costura',
    seamId: seam.id,
    tipo: seam.type,
    apagada: false,
    punto,
    hacia: unitario({ x: centro.x - punto.x, y: centro.y - punto.y }),
    separacionMm: 0,
  };
}

export function etiquetaDeLaSeleccion(input: EtiquetaInput): Etiqueta | null {
  if (input.callada) return null;
  return delPiquete(input) ?? deLaEsquina(input) ?? deLaCostura(input);
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
  if (e.que === 'esquina') {
    const texto = TIPOS_DE_ESQUINA.find((t) => t.value === e.tipo)?.label ?? e.tipo;
    return {
      texto,
      nombre: `Tipo de esquina: ${texto}`,
      nombreDelMenu: 'Opciones de la esquina',
      opciones: [OPCION_TIPO_DE_ESQUINA],
      valores: { cornerType: e.tipo },
    };
  }
  const texto = nombreDelTipoDeCostura(e.tipo);
  return {
    texto,
    nombre: `Tipo de costura: ${texto}`,
    nombreDelMenu: 'Opciones de la costura',
    opciones: [OPCION_TIPO_DE_COSTURA],
    valores: { type: e.tipo },
  };
}

/** El tipo de costura como una opción del pie: las cuatro alternativas de siempre. */
const OPCION_TIPO_DE_COSTURA: ToolOption = {
  id: 'type',
  label: 'Tipo de costura',
  type: 'select',
  value: 'standard',
  choices: TIPOS_DE_COSTURA.map((t) => ({ label: t.label, value: t.value })),
};

/** El tipo de esquina como una opción del pie: siete alternativas, que caben como botones. */
const OPCION_TIPO_DE_ESQUINA: ToolOption = {
  id: 'cornerType',
  label: 'Tipo de esquina',
  type: 'select',
  value: 'mitered',
  choices: TIPOS_DE_ESQUINA.map((t) => ({ label: t.label, value: t.value })),
};

/**
 * Separación fija, en px, entre el objeto (más su separación a escala) y el
 * centro de la pastilla. La costura se aparta más: en su medio están sus largos.
 */
const SEPARACION_PX = 16;
const SEPARACION_COSTURA_PX = 24;

/** El centro de la pastilla en px del contenedor `.pattern-editor`. */
export function posicionDeEtiqueta(e: Etiqueta, pan: Point2D, zoom: number): { left: number; top: number } {
  const lejos = e.separacionMm * zoom + (e.que === 'costura' ? SEPARACION_COSTURA_PX : SEPARACION_PX);
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
