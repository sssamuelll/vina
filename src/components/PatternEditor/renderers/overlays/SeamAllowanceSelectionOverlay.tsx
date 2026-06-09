import type { PathCommand, PatternPiece, SaSelection } from '../../../../types/types';

interface Props {
  saSelection: SaSelection | null;
  pieces: PatternPiece[];
  zoom: number;
}

/** Endpoint of each outline command (where it draws to), in piece-local coords. */
function commandEndpoints(outline: PathCommand[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  let sx = 0, sy = 0;
  for (const cmd of outline) {
    const v = cmd.values;
    switch (cmd.type) {
      case 'M': sx = v[0]; sy = v[1]; pts.push({ x: v[0], y: v[1] }); break;
      case 'L': pts.push({ x: v[0], y: v[1] }); break;
      case 'C': pts.push({ x: v[4], y: v[5] }); break;
      case 'Q': pts.push({ x: v[2], y: v[3] }); break;
      case 'Z': pts.push({ x: sx, y: sy }); break;
      default: pts.push(pts[pts.length - 1] ?? { x: 0, y: 0 });
    }
  }
  return pts;
}

/**
 * Highlights the edge(s) or vertex(es) selected for seam-allowance editing
 * (the seamAllowance tool). Selection is visible feedback — the user sees what
 * the panel is about to edit before committing. Renders one highlight per item
 * in the set (multi-select Shift). Inside the pan/zoom group, so sizes are
 * divided by zoom to stay constant on screen.
 */
export default function SeamAllowanceSelectionOverlay({ saSelection, pieces, zoom }: Props) {
  const stroke = 2.5 / zoom;
  const r = 5 / zoom;
  if (!saSelection) return null;

  if (saSelection.kind === 'vertex') {
    return (
      <>
        {saSelection.items.map(({ pieceId, vertexIndex }, i) => {
          const piece = pieces.find((p) => p.id === pieceId);
          const cmd = piece?.outline?.[vertexIndex];
          if (!piece || !cmd || (cmd.type !== 'M' && cmd.type !== 'L')) return null;
          const cx = (piece.position?.x ?? 0) + cmd.values[0];
          const cy = (piece.position?.y ?? 0) + cmd.values[1];
          return (
            <circle key={`${pieceId}:${vertexIndex}:${i}`} cx={cx} cy={cy} r={r}
              fill="none" stroke="var(--accent-2d)" strokeWidth={stroke} pointerEvents="none" />
          );
        })}
      </>
    );
  }

  return (
    <>
      {saSelection.items.map(({ pieceId, edgeId }, i) => {
        const piece = pieces.find((p) => p.id === pieceId);
        const edge = piece?.edges?.find((e) => e.id === edgeId);
        if (!piece || !edge || !piece.outline?.length) return null;
        const ox = piece.position?.x ?? 0;
        const oy = piece.position?.y ?? 0;
        const ends = commandEndpoints(piece.outline);
        const [start, end] = edge.segmentRange;
        // The edge spans command endpoints [start-1 .. end-1].
        const from = Math.max(0, start - 1);
        const pts: string[] = [];
        for (let j = from; j < end && j < ends.length; j++) {
          pts.push(`${ox + ends[j].x},${oy + ends[j].y}`);
        }
        if (pts.length < 2) return null;
        return (
          <polyline key={`${pieceId}:${edgeId}:${i}`} points={pts.join(' ')}
            fill="none" stroke="var(--accent-2d)" strokeWidth={stroke * 1.6}
            strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
        );
      })}
    </>
  );
}
