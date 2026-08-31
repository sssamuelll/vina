import { PatternPiece, Tool2D } from '../../../types/types';
import { DEFAULT_SEAM_ALLOWANCE } from '../../../utils/defaults';

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
  /** Width the seamAllowance tool will apply on click (editor.defaultSeamAllowanceWidth) */
  saDefaultWidthMm?: number;
  /** Nodos del trazo de línea interna en curso: 0 = sin trazo. */
  internalShapeNodesLength?: number;
  /** Hay cotas vivas sobre la pieza seleccionada (spec 2026-08-30 § 7). */
  cotasVisibles?: boolean;
  /** Hay al menos una costura en el proyecto. Sin ninguna, el clic de
   *  `seamEdit` es un no-op silencioso (#1098) — el hint cambia. */
  hasSeams?: boolean;
}

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
      x="50%" y="98%"
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
  nodeEditorIsEditing, seamPhase, topstitchMode, walkSeamPhase,
  saDefaultWidthMm, internalShapeNodesLength = 0, cotasVisibles = false, hasSeams,
}: HintTextProps) {
  const hasPieces = pieces.length > 0;

  return (
    <>
      {nodeEditorIsEditing && (
        <Pie>Editando nodos · arrastra para mover · Esc para salir</Pie>
      )}

      {activeTool === 'internalShape' && (
        <Pie>
          {internalShapeNodesLength === 0
            ? 'Clic dentro de una pieza para empezar · las esquinas y los bordes enganchan'
            : 'Clic añade · arrastra para curvar · Tab escribe largo y ángulo · doble clic o Enter termina · clic en el primer punto cierra · Retroceso quita el último · Esc descarta'}
        </Pie>
      )}

      {activeTool === 'pen' && penNodesLength > 0 && (
        <Pie>Clic añade · arrastra para curvar · Tab escribe largo y ángulo · clic en el primer punto cierra · Enter o doble clic termina · Retroceso quita el último · Esc cancela</Pie>
      )}

      {activeTool === 'rectangle' && (
        <Pie>Arrastra para dibujar · un clic crea con el último tamaño · escribe en sus cotas para cambiarlo · Esc cancela</Pie>
      )}

      {activeTool === 'grainline' && (
        <Pie>Arrastra dentro de la pieza para el hilo · Shift ajusta a 0°/45°/90°</Pie>
      )}

      {cotasVisibles && (activeTool === 'select' || activeTool === 'transform') && (
        <Pie>Clic en una cota para escribirla · arrástrala para ajustar · Tab pasa a la siguiente · Esc suelta</Pie>
      )}

      {!hasPieces && activeTool === 'pen' && penNodesLength === 0 && (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
          fill="var(--ink-hint)" fontSize="13">
          Clic para añadir puntos · arrastra para curvar · clic en el primer punto para cerrar · Enter termina abierto · Esc cancela
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
          {`Clic en una pieza aplica ${saDefaultWidthMm ?? DEFAULT_SEAM_ALLOWANCE} mm · arrastra sobre varias para aplicarlo a todas · clic en un borde para su ancho · en una esquina para su tipo`}
        </Pie>
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
