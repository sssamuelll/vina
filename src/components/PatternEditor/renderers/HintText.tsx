import { PatternPiece, Tool2D } from '../../../types/types';
import { DEFAULT_SEAM_ALLOWANCE } from '../../../utils/defaults';

interface HintTextProps {
  activeTool: Tool2D;
  pieces: PatternPiece[];
  penNodesLength: number;
  nodeEditorIsEditing: boolean;
  segmentSewingPhase?: string;
  topstitchMode?: string;
  walkSeamPhase?: string;
  /** Whether the seam/freesewing tool already holds its first edge */
  seamHasFirstEdge?: boolean;
  /** Width the seamAllowance tool will apply on click (editor.defaultSeamAllowanceWidth) */
  saDefaultWidthMm?: number;
}

export default function HintText({
  activeTool, pieces, penNodesLength,
  nodeEditorIsEditing, segmentSewingPhase, topstitchMode, walkSeamPhase,
  seamHasFirstEdge, saDefaultWidthMm,
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

      {(activeTool === 'seam' || activeTool === 'freesewing') && (
        <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
          fill="rgba(255, 215, 0, 0.5)" fontSize="11">
          {seamHasFirstEdge
            ? 'Clic en un borde de otra pieza para coser · Esc cancela'
            : 'Clic en un borde de la primera pieza para empezar la costura'}
        </text>
      )}

      {activeTool === 'segmentSewing' && (() => {
        const msgs: Record<string, string> = {
          idle: 'Clic en un borde para empezar el segmento A',
          a_start: 'Clic más adelante en el mismo borde para cerrar el segmento A',
          a_end: 'Clic en otra pieza para empezar el segmento B',
          b_start: 'Clic más adelante en el mismo borde para cerrar el segmento B',
          b_end: 'Enter cose · Retroceso deshace · Esc cancela',
        };
        return (
          <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
            fill="rgba(255, 215, 0, 0.5)" fontSize="11">
            {msgs[segmentSewingPhase ?? 'idle'] ?? msgs.idle}
          </text>
        );
      })()}

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
