import type { PathCommand, PatternPiece } from '../../../../types/types';

interface Props {
  selectedEdge: { pieceId: string; edgeId: string } | null;
  selectedVertex: { pieceId: string; vertexIndex: number } | null;
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
 * Highlights the edge or vertex selected for per-edge seam-allowance editing
 * (the seamAllowance tool). Selection is visible feedback — the user sees what
 * the panel is about to edit before committing. Renders inside the pan/zoom
 * group, so sizes are divided by zoom to stay constant on screen.
 */
export default function SeamAllowanceSelectionOverlay({ selectedEdge, selectedVertex, pieces, zoom }: Props) {
  const stroke = 2.5 / zoom;
  const r = 5 / zoom;

  if (selectedVertex) {
    const piece = pieces.find((p) => p.id === selectedVertex.pieceId);
    const cmd = piece?.outline?.[selectedVertex.vertexIndex];
    if (piece && cmd && (cmd.type === 'M' || cmd.type === 'L')) {
      const cx = (piece.position?.x ?? 0) + cmd.values[0];
      const cy = (piece.position?.y ?? 0) + cmd.values[1];
      return (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--accent-2d)" strokeWidth={stroke} pointerEvents="none" />
      );
    }
    return null;
  }

  if (selectedEdge) {
    const piece = pieces.find((p) => p.id === selectedEdge.pieceId);
    const edge = piece?.edges?.find((e) => e.id === selectedEdge.edgeId);
    if (!piece || !edge || !piece.outline?.length) return null;
    const ox = piece.position?.x ?? 0;
    const oy = piece.position?.y ?? 0;
    const ends = commandEndpoints(piece.outline);
    const [start, end] = edge.segmentRange;
    // The edge spans command endpoints [start-1 .. end-1].
    const from = Math.max(0, start - 1);
    const pts: string[] = [];
    for (let i = from; i < end && i < ends.length; i++) {
      pts.push(`${ox + ends[i].x},${oy + ends[i].y}`);
    }
    if (pts.length < 2) return null;
    return (
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="var(--accent-2d)"
        strokeWidth={stroke * 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    );
  }

  return null;
}
