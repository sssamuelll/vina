import type { PatternPiece, SaSelection } from '../../../../types/types';
import { flattenPath, commandRangeToFlattened } from '../../../../utils/seam';

interface Props {
  saSelection: SaSelection | null;
  pieces: PatternPiece[];
  zoom: number;
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
        // El resalte sigue el TRAZO, no la cuerda. Antes se pintaba un punto
        // por comando (el endpoint de cada uno), así que un borde curvo salía
        // como la recta entre sus extremos: la "V en azul" de la foto del #213,
        // desviada de la curva real por toda la flecha del arco. `flattenPath`
        // + `commandRangeToFlattened` son el mismo boundary comando→aplanado
        // (BP-3) que ya usan el solver y el SeamRenderer.
        const flat = flattenPath(piece.outline);
        const [from, to] = commandRangeToFlattened(piece.outline, edge.segmentRange);
        const span = to >= from
          ? flat.slice(from, to + 1)
          : [...flat.slice(from), ...flat.slice(0, to + 1)];
        const pts = span.map(p => `${ox + p.x},${oy + p.y}`);
        if (pts.length < 2) return null;
        return (
          <polyline key={`${pieceId}:${edgeId}:${i}`} data-testid="sa-edge-highlight" points={pts.join(' ')}
            fill="none" stroke="var(--accent-2d)" strokeWidth={stroke * 1.6}
            strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
        );
      })}
    </>
  );
}
