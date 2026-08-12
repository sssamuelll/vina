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
}

export default function HintText({
  activeTool, pieces, penNodesLength,
  nodeEditorIsEditing, seamPhase, topstitchMode, walkSeamPhase,
  saDefaultWidthMm,
}: HintTextProps) {
  const hasPieces = pieces.length > 0;

  return (
    <>
      {nodeEditorIsEditing && (
        <text
          x="50%" y="98%"
          textAnchor="middle" dominantBaseline="auto"
          fill="rgba(255, 215, 0, 0.5)"
          fontSize="11"
        >
          Editing nodes — Drag to move · Esc to exit
        </text>
      )}

      {!hasPieces && activeTool === 'pen' && penNodesLength === 0 && (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(0,0,0,0.2)" fontSize="13">
          Clic para añadir puntos · arrastra para curvar · clic en el primer punto para cerrar · Enter termina abierto · Esc cancela
        </text>
      )}

      {activeTool === 'seam' && (
        <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
          fill="rgba(255, 215, 0, 0.5)" fontSize="11">
          {seamPhase === 'holdingA'
            ? 'Ahora marca en la otra pieza · clic en vacío o Esc suelta'
            : 'Clic cose el lado entero · arrastre cose solo un tramo'}
        </text>
      )}

      {activeTool === 'seamEdit' && (
        <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
          fill="rgba(255, 215, 0, 0.5)" fontSize="11">
          Clic en un lado para ver con qué está cosido
        </text>
      )}

      {(activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree' || activeTool === 'topstitchEdit') && (() => {
        const msgs: Record<string, string> = {
          seamline: 'Clic en un borde para pespuntear todo su largo',
          segment: 'Clic en dos puntos del mismo borde para el tramo de pespunte',
          free: 'Clic añade puntos · Enter confirma · Retroceso deshace · Esc cancela',
          edit: 'Clic en un pespunte para seleccionarlo y editarlo',
        };
        return (
          <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
            fill="rgba(255, 215, 0, 0.5)" fontSize="11">
            {msgs[topstitchMode ?? 'seamline'] ?? msgs.seamline}
          </text>
        );
      })()}

      {activeTool === 'seamAllowance' && (
        <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
          fill="rgba(255, 215, 0, 0.5)" fontSize="11">
          {`Click a piece to apply ${saDefaultWidthMm ?? DEFAULT_SEAM_ALLOWANCE}mm · drag across pieces to apply to all · click an edge for its width · a corner for corner type`}
        </text>
      )}

      {activeTool === 'walkSeam' && (() => {
        const msgs: Record<string, string> = {
          idle: 'Clic en un borde para recorrer la costura · Shift+clic para par manual',
          stationary: 'Shift+clic en otro borde para par manual · o auto-emparejado por la costura',
          walking: 'Recorre el borde con el cursor · clic reinicia · Esc limpia',
        };
        return (
          <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
            fill="rgba(255, 215, 0, 0.5)" fontSize="11">
            {msgs[walkSeamPhase ?? 'idle'] ?? msgs.idle}
          </text>
        );
      })()}
    </>
  );
}
