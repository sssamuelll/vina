import type { PatternPiece, SaSelection } from '../../../../types/types';
import { flattenPath, commandRangeToFlattened } from '../../../../utils/seam';
import { pieceLocalToPattern } from '../../../../utils/geometry/pieceSpace';

interface Props {
  saSelection: SaSelection | null;
  hoverEdge?: { pieceId: string; edgeId: string } | null;
  pieces: PatternPiece[];
  zoom: number;
}

/** Con hover esto corre por movimiento: el aplanado se memoiza por identidad del contorno. */
const aplanados = new WeakMap<PatternPiece['outline'], ReturnType<typeof flattenPath>>();
function aplanado(outline: PatternPiece['outline']) {
  let flat = aplanados.get(outline);
  if (!flat) { flat = flattenPath(outline); aplanados.set(outline, flat); }
  return flat;
}

function edgeTracePoints(pieces: PatternPiece[], pieceId: string, edgeId: string): string[] | null {
  const piece = pieces.find(candidate => candidate.id === pieceId);
  const edge = piece?.edges?.find(candidate => candidate.id === edgeId);
  if (!piece || !edge || !piece.outline?.length) return null;
  const flat = aplanado(piece.outline);
  const [from, to] = commandRangeToFlattened(piece.outline, edge.segmentRange);
  const span = to >= from
    ? flat.slice(from, to + 1)
    : [...flat.slice(from), ...flat.slice(0, to + 1)];
  const points = span.map(point => {
    const world = pieceLocalToPattern(point, piece);
    return `${world.x},${world.y}`;
  });
  return points.length >= 2 ? points : null;
}

/**
 * Highlights the edge(s) or vertex(es) selected for seam-allowance editing
 * (the seamAllowance tool). Selection is visible feedback — the user sees what
 * the panel is about to edit before committing. Renders one highlight per item
 * in the set (multi-select Shift). Inside the pan/zoom group, so sizes are
 * divided by zoom to stay constant on screen.
 */
export default function SeamAllowanceSelectionOverlay({ saSelection, hoverEdge, pieces, zoom }: Props) {
  const thinStroke = 2.5 / zoom;
  const selectionStroke = 4 / zoom;
  const r = 5 / zoom;
  const hoverIsSelected = Boolean(hoverEdge && saSelection?.kind === 'edge'
    && saSelection.items.some(item => item.pieceId === hoverEdge.pieceId && item.edgeId === hoverEdge.edgeId));
  const hoverPoints = hoverEdge && !hoverIsSelected
    ? edgeTracePoints(pieces, hoverEdge.pieceId, hoverEdge.edgeId)
    : null;

  const hover = hoverPoints ? (
    <polyline
      data-testid="sa-edge-hover"
      points={hoverPoints.join(' ')}
      fill="none"
      stroke="var(--accent-2d)"
      strokeWidth={thinStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
      opacity={0.55}
    />
  ) : null;

  if (!saSelection) return hover;

  if (saSelection.kind === 'vertex') {
    return (
      <>
        {hover}
        {saSelection.items.map(({ pieceId, vertexIndex }, i) => {
          const piece = pieces.find((p) => p.id === pieceId);
          const cmd = piece?.outline?.[vertexIndex];
          if (!piece || !cmd || (cmd.type !== 'M' && cmd.type !== 'L')) return null;
          // El overlay vive en espacio de PATRÓN, colgado del grupo de
          // pan/zoom. Sumar solo `position` lo pinta sobre el fantasma sin
          // girar: la usuaria clica el borde que ve, el hit-test acierta
          // —#1064— y el resalte sale en otro sitio (#1068).
          const { x: cx, y: cy } = pieceLocalToPattern(
            { x: cmd.values[0], y: cmd.values[1] },
            piece,
          );
          return (
            <circle key={`${pieceId}:${vertexIndex}:${i}`} cx={cx} cy={cy} r={r}
              fill="none" stroke="var(--accent-2d)" strokeWidth={thinStroke} pointerEvents="none" />
          );
        })}
      </>
    );
  }

  return (
    <>
      {hover}
      {saSelection.items.map(({ pieceId, edgeId }, i) => {
        const points = edgeTracePoints(pieces, pieceId, edgeId);
        if (!points) return null;
        // El resalte sigue el TRAZO, no la cuerda. Antes se pintaba un punto
        // por comando (el endpoint de cada uno), así que un borde curvo salía
        // como la recta entre sus extremos: la "V en azul" de la foto del #213,
        // desviada de la curva real por toda la flecha del arco. `flattenPath`
        // + `commandRangeToFlattened` son el mismo boundary comando→aplanado
        // (BP-3) que ya usan el solver y el SeamRenderer.
        return (
          <polyline key={`${pieceId}:${edgeId}:${i}`} data-testid="sa-edge-highlight" points={points.join(' ')}
            fill="none" stroke="var(--accent-2d)" strokeWidth={selectionStroke}
            strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
        );
      })}
    </>
  );
}
