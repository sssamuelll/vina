import type { Tool2D } from '../../types/types';
import { DEFAULT_SEAM_ALLOWANCE } from '../../utils/defaults';
import { formatMedida } from './cotas/parseMedida';
import { displayModifierKey, displayShortcut } from '../shell/shortcutDisplay';
import type { ModoShift } from './useShiftSostenido';
import type { PointToolMode } from './usePointTool';
import { ABSOLUTE_REFERENCE, angleReferenceLabel, type AngleReference } from './angleReference';

/** Arrastrar con Shift endereza a la hoja (Hilo y Editar patrón). La notación
 *  del modificador sale de `shortcutDisplay`: ⇧ en macOS, Shift+ fuera. */
const SHIFT_ENDEREZA = `${displayShortcut('⇧')}arrastrar: 0°/45°/90°`;

/** Las herramientas con las dos guías de Shift (spec 2026-09-23). */
const CON_DOS_GUIAS = new Set<Tool2D>(['pen', 'internalShape', 'editPattern']);

const COTAS = 'Clic en una cota para escribirla · arrástrala para ajustar · Tab pasa a la siguiente · Esc suelta';

/** La cota del piquete recién puesto está abierta (spec 2026-10-02 § 5.2). Cabe en el hueco del piquete (55). */
export const LO_QUE_SE_PONE = 'Escribe la distancia · Enter fija · Esc no lo mueve';
/**
 * La del punto descansa en reposo: no se lleva el foco, para que las teclas
 * sigan siendo del lienzo (la firma D3 de María: pone un punto y pulsa Q).
 */
export const LO_QUE_SE_PONE_EL_PUNTO = 'Clic en la cota para ponerlo a una distancia exacta · Esc la cierra';

/**
 * Con Shift pulsado, la frase de la Pluma, la Línea interna y `Q` la sustituye
 * una corta que dice cómo llegar a la otra guía (spec 2026-09-23 § 4.2). Los
 * marcos se nombran como en la píldora.
 */
function fraseDeShift(modo: ModoShift, segundo: AngleReference['kind']): string {
  const shift = displayModifierKey('⇧');
  const eje = angleReferenceLabel(ABSOLUTE_REFERENCE);
  const otro = angleReferenceLabel({ kind: segundo, baseDeg: 0 });
  return modo === 'borde'
    ? `${shift} dos veces: ${otro} · una vez: ${eje}`
    : `${shift}: ${eje} · ${shift} dos veces: ${otro}`;
}

/** Lo que la frase necesita saber de la herramienta activa y de su gesto. */
export interface FaseDeLaHerramienta {
  activeTool: Tool2D;
  penNodesLength: number;
  nodeEditorIsEditing: boolean;
  /** Fase del gesto de coser (#199, #1029): 'holdingA' sosteniendo la primera mitad. */
  seamPhase?: 'idle' | 'holdingA';
  topstitchMode?: string;
  walkSeamPhase?: string;
  /** Fase de «Abrir la pieza»: cinco clics y ninguno se adivina, así que va una a una. */
  slashPhase?: string;
  /** El margen que pone un clic dentro de la pieza (editor.defaultSeamAllowanceWidth). */
  saDefaultWidthMm?: number;
  /** Puntos del trazo de línea interna en curso: 0 = sin trazo. */
  internalShapeNodesLength?: number;
  /** Hay cotas vivas sobre lo seleccionado (spec 2026-08-30 § 7). */
  cotasVisibles?: boolean;
  /** Hay al menos una costura. Sin ninguna, el clic de Editar costuras no hace nada (#1098). */
  hasSeams?: boolean;
  /** Modo de Extender / recortar (#1178). */
  extendTrimMode?: 'extend' | 'trim';
  /** Hay un extremo o un punto de recorte elegido, esperando su confirmación (#1178). */
  extendTrimArmed?: boolean;
  /** Shift en la herramienta activa: suelto, una vez (el eje) o dos (el borde). */
  modoShift?: ModoShift;
  /** El marco de Shift dos veces, si hay uno distinto del eje que elegir. */
  segundoMarco?: AngleReference['kind'] | null;
  /** El tamaño con que un clic crea el rectángulo (spec 2026-08-30 § 3.1). */
  rectanguloPorDefecto?: { width: number; height: number };
  /** El piquete o el punto que se está poniendo tiene su cota a la vista: gana a cualquier herramienta. */
  loQueSePone?: 'piquete' | 'punto' | null;
  /** Tijeras: el primer punto del corte ya está puesto. */
  tijerasEmpezadas?: boolean;
  /** Medir: el primer punto ya está puesto. */
  medidaEmpezada?: boolean;
  /** Punto: lo que hace el clic, la alternativa elegida de su opción. */
  modoDelPunto?: PointToolMode;
}

/**
 * La frase de la fase (spec 2026-10-02 «la interfaz en papel» § 5.4): lo único
 * que le explica a María cómo se usa la herramienta activa, en la línea al pie.
 * Una sola, en una línea; `null` si no hay nada que decir. Ninguna tecla pierde
 * su único anuncio: si un gesto no cabe, se cae el gesto, no la tecla. Hasta
 * P2b esto era `HintText.tsx`, un `<text>` de SVG al pie de la hoja.
 */
export function fraseDeLaFase(f: FaseDeLaHerramienta): string | null {
  const tool = f.activeTool;
  if (f.loQueSePone === 'piquete') return LO_QUE_SE_PONE;
  if (f.loQueSePone === 'punto') return LO_QUE_SE_PONE_EL_PUNTO;
  // El editor de nodos tiene su propia frase, y gana: dos a la vez se pisaban.
  if (f.nodeEditorIsEditing) return 'Editando nodos · arrastra para mover · Esc para salir';
  if (f.modoShift && f.modoShift !== 'suelto' && f.segundoMarco && CON_DOS_GUIAS.has(tool)) {
    return fraseDeShift(f.modoShift, f.segundoMarco);
  }

  switch (tool) {
    // María [12:48]: «cuál es la diferencia… no está bien definido para qué es
    // cada comando». La respuesta es corta y no estaba escrita (#1103).
    case 'select':
      return f.cotasVisibles
        ? COTAS
        : 'Seleccionar mueve la pieza, y un punto si pinchas encima · Editar patrón además añade, borra y curva';
    case 'transform':
      return f.cotasVisibles ? COTAS : null;
    // Y [34:24]: «por qué este punto es redondo y este cuadrado». La forma SÍ
    // dice el tipo: faltaba decir cuál es cuál.
    case 'editPattern':
      return `Cuadrado es esquina · redondo es punto de curva · rombo es extremo abierto · arrastra para mover · ${SHIFT_ENDEREZA}`;
    case 'point':
      if (f.modoDelPunto === 'curvePoints') return 'Clic en un tramo lo convierte en curva por puntos';
      if (f.modoDelPunto === 'bezier') return 'Clic en un tramo lo convierte en curva bezier';
      return 'Clic en un borde añade un punto · arrastra por el borde para elegir dónde';
    // Con dos puntos Enter NO cierra ninguna pieza: deja un trazo (spec de
    // trazos § 3.1). Decir «cierra la pieza» prometía lo que no pasa.
    case 'pen':
      return f.penNodesLength > 0
        ? 'Tab escribe la medida · clic en el primer punto cierra · Enter termina: pieza con tres puntos, trazo con dos · Retroceso quita un punto · Esc deja el trazo'
        : 'Clic pone el primer punto · arrastra para curvar';
    case 'internalShape':
      return (f.internalShapeNodesLength ?? 0) === 0
        ? 'Clic dentro de una pieza para empezar · las esquinas y los bordes enganchan'
        : 'Tab escribe la medida · Enter termina · Retroceso quita un punto · Esc descarta';
    case 'rectangle': {
      const r = f.rectanguloPorDefecto;
      const tam = r ? `uno de ${formatMedida(r.width, 'mm').replace(' mm', '')} × ${formatMedida(r.height, 'mm')}` : 'con el último tamaño';
      return `Arrastra para dibujar · un clic crea ${tam} · escribe en sus cotas para cambiarlo · Esc cancela`;
    }
    case 'circle':
      return 'Arrastra para dibujar · un clic crea con el último radio · escribe en sus cotas para cambiarlo · Esc cancela';
    case 'triangle':
      return 'Arrastra para dibujar · un clic crea con el último tamaño · escribe en sus cotas para cambiarlo · Esc cancela';
    case 'grainline':
      return `Arrastra dentro de la pieza para el hilo · ${SHIFT_ENDEREZA}`;
    case 'scissors':
      return f.tijerasEmpezadas
        ? 'Clic donde termina el corte, en otro borde · Esc cancela'
        : 'Clic en el contorno donde empieza el corte';
    case 'measure':
      return f.medidaEmpezada ? 'Clic en el segundo punto · Esc lo suelta' : 'Clic en dos puntos para medir la distancia';
    case 'seam':
      return f.seamPhase === 'holdingA'
        ? 'Ahora marca en la otra pieza · clic en vacío o Esc suelta'
        : 'Clic cose el lado entero · arrastre cose solo un tramo';
    case 'seamEdit':
      return f.hasSeams === false ? 'No hay costuras: cose primero con N' : 'Clic en un lado para ver con qué está cosido';
    case 'seamAllowance':
      return `Pasa por un borde para leer su margen · clic para escribirlo · pieza entera: ${formatMedida(f.saDefaultWidthMm ?? DEFAULT_SEAM_ALLOWANCE, 'mm')} · esquina: su tipo`;
    case 'notch':
      return 'Clic en el borde donde va el piquete';
    case 'topstitchSeamline':
    case 'topstitchSegment':
    case 'topstitchFree':
    case 'topstitchEdit': {
      const frases: Record<string, string> = {
        seamline: 'Clic en un borde lo pespuntea entero',
        segment: 'Clic en dos puntos del mismo borde',
        free: 'Clic añade puntos · Enter confirma · Retroceso deshace · Esc cancela',
        edit: 'Clic en un pespunte para seleccionarlo y editarlo',
      };
      return frases[f.topstitchMode ?? 'seamline'] ?? frases.seamline;
    }
    case 'hand':
      return 'Arrastra para mover la vista · el botón del medio del ratón hace lo mismo sin salir de la herramienta que estés usando';
    case 'measureCurve':
      return 'Clic en un borde para leer su largo siguiendo la curva · clic en otro cambia de borde';
    case 'compareCurves':
      return 'Clic en un borde y después en otro para ver la diferencia de largo';
    // `canExecute` de Desplazar tenía un solo consumidor: el propio Enter. Sin
    // esta frase, nada enseñaba que esa tecla existe (#1178).
    case 'offsetOutline':
      return 'Enter aplica el desplazamiento';
    case 'extendTrim':
      if (f.extendTrimMode === 'trim') {
        return f.extendTrimArmed
          ? 'Clic del lado que quieres conservar, o Enter conserva el lado más cercano · Esc cancela'
          : 'Clic sobre un borde para marcar dónde recortar';
      }
      return f.extendTrimArmed
        ? 'Clic otra vez, o Enter, confirma el extremo · Esc cancela'
        : 'Clic en el extremo de un borde para extenderlo';
    // Por fases, porque los cinco clics en una línea no caben. OJO con Esc:
    // solo en `spreadPreview` vuelve UN paso (`useSlashAndSpreadTool.ts`); en
    // las demás es un reinicio, y por eso ninguna otra lo nombra.
    case 'slashAndSpread': {
      const frases: Record<string, string> = {
        idle: 'Clic en el contorno de la pieza para empezar el corte',
        drawingSlash: 'Clic en el contorno para cerrar el corte · Esc cancela',
        slashComplete: 'Clic en la mitad que quieres mover',
        selectingHalf: 'Clic otra vez en esa mitad para confirmarla',
        halfConfirmed: 'Clic en una punta del corte: esa se queda quieta',
        awaitingDrag: 'Mueve el ratón para abrir · Tab: girar o separar',
        spreading: 'Suelta cuando esté como la quieres',
        spreadPreview: 'Enter la abre de verdad · Esc descarta la prueba',
      };
      return frases[f.slashPhase ?? 'idle'] ?? frases.idle;
    }
    case 'trimPlace':
      return 'Clic en un borde pone el avío elegido';
    case 'walkSeam': {
      const frases: Record<string, string> = {
        idle: 'Clic en un borde para recorrer la costura · Shift+clic para par manual',
        stationary: 'Shift+clic en otro borde para par manual · o auto-emparejado por la costura',
        walking: 'Recorre el borde con el cursor · clic reinicia · Esc limpia',
      };
      return frases[f.walkSeamPhase ?? 'idle'] ?? frases.idle;
    }
    default:
      return null;
  }
}

/** La frase que enseña la línea al pie, con su clase de mensaje. */
export interface FraseDelPie {
  texto: string;
  tipo: 'desenlace' | 'falta' | 'fase';
}

/**
 * La prioridad de la frase (spec § 5.4): el gesto que murió sin dejar nada
 * (`desenlace`, 4 s), lo que a la herramienta le falta para trabajar, y la
 * frase de la fase.
 */
export function fraseDelPie(desenlace: string | null, falta: string | null, fase: string | null): FraseDelPie | null {
  if (desenlace) return { texto: desenlace, tipo: 'desenlace' };
  if (falta) return { texto: falta, tipo: 'falta' };
  return fase ? { texto: fase, tipo: 'fase' } : null;
}
