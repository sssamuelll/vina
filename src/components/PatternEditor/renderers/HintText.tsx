import { PatternPiece, Tool2D } from '../../../types/types';
import { DEFAULT_SEAM_ALLOWANCE } from '../../../utils/defaults';
import { formatMedida } from '../cotas/parseMedida';
import { displayModifierKey, displayShortcut } from '../../shell/shortcutDisplay';
import type { ModoShift } from '../useShiftSostenido';
import { ABSOLUTE_REFERENCE, angleReferenceLabel, type AngleReference } from '../angleReference';

/** Arrastrar con Shift endereza a la hoja (Hilo y Editar patrón). La notación
 *  del modificador sale de `shortcutDisplay`: ⇧ en macOS, Shift+ fuera. */
const SHIFT_ENDEREZA = `${displayShortcut('⇧')}arrastrar: 0°/45°/90°`;

/** Las herramientas con las dos guías de Shift (spec 2026-09-23). */
const CON_DOS_GUIAS = new Set<Tool2D>(['pen', 'internalShape', 'editPattern']);

/**
 * Con Shift pulsado, la pista de la Pluma, la Línea interna y `Q` la sustituye
 * una corta que dice cómo llegar a la otra guía (spec 2026-09-23 § 4.2): las de
 * la Pluma y la Línea interna ya no caben en su laptop, y lo añadido caería en
 * lo que no se ve. Los marcos se nombran como en la píldora.
 */
function pistaShift(modo: ModoShift, segundo: AngleReference['kind']): string {
  const shift = displayModifierKey('⇧');
  const eje = angleReferenceLabel(ABSOLUTE_REFERENCE);
  const otro = angleReferenceLabel({ kind: segundo, baseDeg: 0 });
  return modo === 'borde'
    ? `${shift} dos veces: ${otro} · una vez: ${eje}`
    : `${shift}: ${eje} · ${shift} dos veces: ${otro}`;
}

interface HintTextProps {
  activeTool: Tool2D;
  pieces: PatternPiece[];
  penNodesLength: number;
  nodeEditorIsEditing: boolean;
  /** Fase del gesto de coser unificado (#199, #1029): 'idle' antes del primer
   *  borde, 'holdingA' sosteniendo la primera mitad. */
  seamPhase?: 'idle' | 'holdingA';
  topstitchMode?: string;
  walkSeamPhase?: string;
  /** Fase de «Abrir la pieza»: son cinco clics y ninguno se adivina, así que
   *  la pista va una a una en vez de en una línea que no cabe. */
  slashPhase?: string;
  /** Width the seamAllowance tool will apply on click (editor.defaultSeamAllowanceWidth) */
  saDefaultWidthMm?: number;
  /** Nodos del trazo de línea interna en curso: 0 = sin trazo. */
  internalShapeNodesLength?: number;
  /** Hay cotas vivas sobre la pieza seleccionada (spec 2026-08-30 § 7). */
  cotasVisibles?: boolean;
  /** Hay al menos una costura en el proyecto. Sin ninguna, el clic de
   *  `seamEdit` es un no-op silencioso (#1098) — el hint cambia. */
  hasSeams?: boolean;
  /** Modo de Extender/Recortar (#1178): la pista de "extender" no sirve
   *  mientras María está recortando, y viceversa. */
  extendTrimMode?: 'extend' | 'trim';
  /** Hay un extremo (extender) o un punto de recorte (recortar) ya elegido,
   *  esperando el clic o el Enter de confirmación (#1178). */
  extendTrimArmed?: boolean;
  /** Shift en la herramienta activa: suelto, una vez (el eje) o dos (el borde). */
  modoShift?: ModoShift;
  /** El marco de Shift dos veces, si hay uno distinto del eje que elegir. */
  segundoMarco?: AngleReference['kind'] | null;
}

/** A qué altura del lienzo va la pista, en %. La marca de escala se coloca por
 *  encima de esta línea (MarcaDeEscala.tsx): si esto cambia, ella lo sigue. */
export const PISTA_Y_PORCENTAJE = 98;

/**
 * Pista al pie del lienzo: la única cosa que le explica a María cómo se usa la
 * herramienta activa.
 *
 * Tinta: `--ink-hint`, NUNCA un literal ni un `--text-*`. Los `--text-*` son la
 * tinta del cromo oscuro; sobre el crema del lienzo desaparecen. Hasta el
 * 2026-08-14 esto se pintaba con `rgba(255, 215, 0, 0.5)` —oro al 50%— y daba
 * 1.05:1 de contraste, o sea que el gesto de arrastre de #1029 se explicaba con
 * un texto invisible. Lo fija HintText.legibilidad.test.tsx.
 */
function Pie({ children }: { children: React.ReactNode }) {
  return (
    <text
      data-superficie="pista"
      x="50%" y={`${PISTA_Y_PORCENTAJE}%`}
      textAnchor="middle" dominantBaseline="auto"
      fill="var(--ink-hint)"
      fontSize="11"
    >
      {children}
    </text>
  );
}

export default function HintText({
  activeTool, pieces, penNodesLength,
  nodeEditorIsEditing, seamPhase, topstitchMode, walkSeamPhase, slashPhase,
  saDefaultWidthMm, internalShapeNodesLength = 0, cotasVisibles = false, hasSeams,
  extendTrimMode = 'extend', extendTrimArmed = false,
  modoShift = 'suelto', segundoMarco = null,
}: HintTextProps) {
  const hasPieces = pieces.length > 0;
  // El editor de nodos tiene su propia pista: dos a la vez se pisarían.
  const conShift = modoShift !== 'suelto' && segundoMarco !== null && CON_DOS_GUIAS.has(activeTool)
    && !nodeEditorIsEditing
    ? pistaShift(modoShift, segundoMarco)
    : null;

  return (
    <>
      {nodeEditorIsEditing && (
        <Pie>Editando nodos · arrastra para mover · Esc para salir</Pie>
      )}

      {activeTool === 'internalShape' && !conShift && (
        <Pie>
          {internalShapeNodesLength === 0
            ? 'Clic dentro de una pieza para empezar · las esquinas y los bordes enganchan'
            : 'Clic añade · arrastra para curvar · Tab escribe largo y ángulo · doble clic o Enter termina · clic en el primer punto cierra · Retroceso quita el último · Esc descarta'}
        </Pie>
      )}

      {activeTool === 'pen' && penNodesLength > 0 && !conShift && (
        // Con dos nodos Enter NO cierra ninguna pieza: deja un trazo (spec de
        // trazos § 3.1). Decir «cierra la pieza» prometía lo que no pasa, que es
        // justo la mitad del gesto que María todavía está aprendiendo.
        <Pie>Clic añade · arrastra para curvar · Tab escribe largo y ángulo · clic en el primer punto cierra · Enter o doble clic termina: pieza con tres puntos, trazo con dos · Esc deja el trazo · Retroceso quita el último</Pie>
      )}

      {activeTool === 'rectangle' && (
        <Pie>Arrastra para dibujar · un clic crea con el último tamaño · escribe en sus cotas para cambiarlo · Esc cancela</Pie>
      )}

      {activeTool === 'circle' && (
        <Pie>Arrastra para dibujar · un clic crea con el último radio · escribe en sus cotas para cambiarlo · Esc cancela</Pie>
      )}

      {activeTool === 'triangle' && (
        <Pie>Arrastra para dibujar · un clic crea con el último tamaño · escribe en sus cotas para cambiarlo · Esc cancela</Pie>
      )}

      {activeTool === 'grainline' && (
        <Pie>{`Arrastra dentro de la pieza para el hilo · ${SHIFT_ENDEREZA}`}</Pie>
      )}

      {cotasVisibles && (activeTool === 'select' || activeTool === 'transform') && (
        <Pie>Clic en una cota para escribirla · arrástrala para ajustar · Tab pasa a la siguiente · Esc suelta</Pie>
      )}

      {/* María [12:48]: «estos puntos los puedo mover con el comando
          seleccionar o con el de editar… cuál es la diferencia… no está bien
          definido para qué es cada comando». La respuesta es corta y no estaba
          escrita en ninguna parte (#1103). */}
      {activeTool === 'select' && !cotasVisibles && !nodeEditorIsEditing && (
        <Pie>Seleccionar mueve la pieza, y un punto si pinchas encima · Editar patrón además añade, borra y curva</Pie>
      )}

      {/* Y [34:24]: «por qué este punto es redondo y este cuadrado, yo pensaría
          que estos son de curva… no entiendo por qué». La forma SÍ dice el tipo
          — lo que faltaba era decirle cuál es cuál. */}
      {activeTool === 'editPattern' && !nodeEditorIsEditing && !conShift && (
        <Pie>{`Cuadrado es esquina · redondo es punto de curva · rombo es extremo abierto · arrastra para mover · ${SHIFT_ENDEREZA}`}</Pie>
      )}

      {conShift && <Pie>{conShift}</Pie>}

      {!hasPieces && activeTool === 'pen' && penNodesLength === 0 && (
        // `hasPieces` no cambia con un trazo (spec de trazos § 3.1: abierto no
        // es pieza), así que esta pista de bienvenida reaparece después de
        // cada trazo — es el flujo que #1158 habilita, no un caso raro.
        <text data-superficie="pista" x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
          fill="var(--ink-hint)" fontSize="13">
          Clic para añadir puntos · arrastra para curvar · clic en el primer punto para cerrar · Enter termina: pieza con tres puntos, trazo con dos · Esc cancela
        </text>
      )}

      {activeTool === 'seam' && (
        <Pie>
          {seamPhase === 'holdingA'
            ? 'Ahora marca en la otra pieza · clic en vacío o Esc suelta'
            : 'Clic cose el lado entero · arrastre cose solo un tramo'}
        </Pie>
      )}

      {activeTool === 'seamEdit' && (
        hasSeams === false
          ? <Pie>No hay costuras: cose primero con N</Pie>
          : <Pie>Clic en un lado para ver con qué está cosido</Pie>
      )}

      {(activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree' || activeTool === 'topstitchEdit') && (() => {
        const msgs: Record<string, string> = {
          seamline: 'Clic en un borde para pespuntear todo su largo',
          segment: 'Clic en dos puntos del mismo borde para el tramo de pespunte',
          free: 'Clic añade puntos · Enter confirma · Retroceso deshace · Esc cancela',
          edit: 'Clic en un pespunte para seleccionarlo y editarlo',
        };
        return <Pie>{msgs[topstitchMode ?? 'seamline'] ?? msgs.seamline}</Pie>;
      })()}

      {activeTool === 'seamAllowance' && (
        <Pie>
          {`Pasa por un borde para leer su margen · clic para escribirlo · pieza entera: ${formatMedida(saDefaultWidthMm ?? DEFAULT_SEAM_ALLOWANCE, 'mm')} · esquina: su tipo`}
        </Pie>
      )}

      {/* Las cinco que estrenaron puerta el 2026-09-05. Hasta ese día no tenían
          botón ni atajo, así que tampoco tenían pista: nadie escribe la
          instrucción de una herramienta a la que no se puede llegar. */}

      {activeTool === 'hand' && (
        <Pie>Arrastra para mover la vista · el botón del medio del ratón hace lo mismo sin salir de la herramienta que estés usando</Pie>
      )}

      {activeTool === 'measureCurve' && (
        <Pie>Clic en un borde para leer su largo siguiendo la curva · clic en otro cambia de borde</Pie>
      )}

      {activeTool === 'compareCurves' && (
        <Pie>Clic en un borde y después en otro para ver la diferencia de largo</Pie>
      )}

      {/* `canExecute` de Offset tenía un solo consumidor en todo el repo: el
          propio atajo de Enter. Sin esta pista, nada en pantalla enseñaba que
          esa tecla existe (#1178). */}
      {activeTool === 'offsetOutline' && (
        <Pie>Elige distancia y dirección en la tira · Enter aplica el desplazamiento</Pie>
      )}

      {/* Extender/Recortar no pintaba nada en toda su vida y tampoco tenía
          pista (#1178). El modo importa: "extender" no sirve mientras María
          recorta, y al revés — mismo criterio que topstitch unas líneas
          arriba. */}
      {activeTool === 'extendTrim' && (() => {
        if (extendTrimMode === 'trim') {
          return extendTrimArmed
            ? <Pie>Clic del lado que quieres conservar, o Enter conserva el lado más cercano · Esc cancela</Pie>
            : <Pie>Clic sobre un borde para marcar dónde recortar</Pie>;
        }
        return extendTrimArmed
          ? <Pie>Clic otra vez, o Enter, confirma el extremo · Esc cancela</Pie>
          : <Pie>Clic en el extremo de un borde para extenderlo</Pie>;
      })()}

      {/* Cinco clics antes de poder arrastrar, y ninguno se adivina: es el
          gesto más largo del lienzo 2D y hasta hoy no lo decía nadie.
          Contarlos todos en una línea NO cabe — medido a 1366×643, la frase
          entera ocupaba 883 px y arrancaba en x = −101, o sea el hallazgo F2
          del informe repuesto por nuestra propia mano. Va por fases, como
          `walkSeam` unas líneas más abajo: cada una dice solo el clic que toca.
          Las fases son las de `useSlashAndSpreadTool`. */}
      {activeTool === 'slashAndSpread' && (() => {
        const msgs: Record<string, string> = {
          idle: 'Clic en el contorno de la pieza para empezar el corte',
          drawingSlash: 'Clic en el contorno otra vez para cerrar el corte · Esc cancela',
          slashComplete: 'Clic en la mitad que quieres mover',
          selectingHalf: 'Clic otra vez en esa mitad para confirmarla',
          halfConfirmed: 'Clic en una punta del corte: esa se queda quieta',
          awaitingDrag: 'Mueve el ratón para abrir · Tab cambia entre girar y separar',
          spreading: 'Suelta cuando esté como la quieres',
          spreadPreview: 'Enter la abre de verdad · Esc descarta y deja volver a probar',
          // OJO con Escape: solo en `spreadPreview` vuelve UN paso
          // (`useSlashAndSpreadTool.ts:414-423`). En cualquier otra fase es un
          // reinicio entero — bota el corte, la mitad y el pivote, y María
          // vuelve al clic 1. Por eso ninguna otra pista lo nombra: prometer
          // «vuelve atrás» donde hay reinicio es peor que no decir nada.
        };
        return <Pie>{msgs[slashPhase ?? 'idle'] ?? msgs.idle}</Pie>;
      })()}

      {activeTool === 'trimPlace' && (
        <Pie>Clic en un borde pone el avío elegido · con «Repartidos por el borde» pone la cantidad que digas, repartida</Pie>
      )}

      {activeTool === 'walkSeam' && (() => {
        const msgs: Record<string, string> = {
          idle: 'Clic en un borde para recorrer la costura · Shift+clic para par manual',
          stationary: 'Shift+clic en otro borde para par manual · o auto-emparejado por la costura',
          walking: 'Recorre el borde con el cursor · clic reinicia · Esc limpia',
        };
        return <Pie>{msgs[walkSeamPhase ?? 'idle'] ?? msgs.idle}</Pie>;
      })()}
    </>
  );
}
