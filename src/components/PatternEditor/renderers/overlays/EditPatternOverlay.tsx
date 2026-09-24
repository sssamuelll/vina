import type { PathCommand, PatternPiece, Point2D } from '../../../../types/types';
import { outlineBBoxCenter } from '../../../../utils/geometry/transform';
import { classifyAnchorsOfPath, classifyEditableAnchors } from '../../anchorRoles';
import type { EditableNode } from '../../nodeEditorUtils';
import type { EdicionDeInterna } from '../../estadoDeQ';
import { EDGE_HIT_PX } from '../../gestureConstants';
import { EXTREMOS } from '../PuntosDelContorno';
import AnchorGlyph, { type AnchorVisualState } from '../AnchorGlyph';

interface EditPatternOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  editingPieceId: string | null;
  hoveredPieceId: string | null;
  nodes: EditableNode[];
  selectedNodes: Set<number>;
  selectedSegments: Set<number>;
  hoveredNode: number | null;
  hoveredSegment: number | null;
  addPointPreview: Point2D | null;
  marquee: { start: Point2D; current: Point2D } | null;
  /** Las internas editables de la pieza (spec 2026-09-24 § 3.3). */
  internas?: EdicionDeInterna[];
  /** El punto al que engancha el arrastre de una interna, en patrón (§ 4.3). */
  enganche?: Point2D | null;
}

/** El resalte de los tramos elegidos o bajo el ratón de un path, cierre incluido. */
function resaltesDeTramos(
  path: PathCommand[], selected: Set<number>, hovered: number | null, zoom2D: number, prefijo: string,
): JSX.Element[] {
  // Build segment paths for highlight
  const out: JSX.Element[] = [];
  let prevX = 0, prevY = 0;
  const trazo = (key: string, d: string, i: number, isSelected: boolean, isHovered: boolean) => (
    <path
      key={key}
      data-tramo-hover={isHovered ? i : undefined}
      d={d}
      fill="none"
      stroke="var(--accent-2d)"
      strokeWidth={(isSelected ? 2.5 : 2) / zoom2D}
      opacity={isSelected ? 1 : 0.6}
      pointerEvents="none"
    />
  );
  for (let i = 0; i < path.length; i++) {
    const cmd = path[i];
    const isSelected = selected.has(i);
    const isHovered = hovered === i && !isSelected;
    if (isSelected || isHovered) {
      let d = '';
      if (cmd.type === 'L') d = `M ${prevX} ${prevY} L ${cmd.values[0]} ${cmd.values[1]}`;
      else if (cmd.type === 'C') d = `M ${prevX} ${prevY} C ${cmd.values.join(' ')}`;
      else if (cmd.type === 'Q') d = `M ${prevX} ${prevY} Q ${cmd.values.join(' ')}`;
      if (d) out.push(trazo(`${prefijo}seg-${i}`, d, i, isSelected, isHovered));
    }
    // Track previous anchor for segment path construction
    switch (cmd.type) {
      case 'M': case 'L': prevX = cmd.values[0]; prevY = cmd.values[1]; break;
      case 'C': prevX = cmd.values[4]; prevY = cmd.values[5]; break;
      case 'Q': prevX = cmd.values[2]; prevY = cmd.values[3]; break;
    }
  }
  // Closing segment: last anchor → first anchor (Z command)
  const zIndex = path.findIndex(c => c.type === 'Z');
  if (zIndex >= 0 && path[0]?.type === 'M') {
    const isSelected = selected.has(zIndex);
    const isHovered = hovered === zIndex && !isSelected;
    if (isSelected || isHovered) {
      // prevX/prevY from the loop already hold the last anchor position
      const d = `M ${prevX} ${prevY} L ${path[0].values[0]} ${path[0].values[1]}`;
      out.push(trazo(`${prefijo}seg-closing`, d, zIndex, isSelected, isHovered));
    }
  }
  return out;
}

export default function EditPatternOverlay({
  zoom2D, pieces, editingPieceId, hoveredPieceId, nodes, selectedNodes, selectedSegments,
  hoveredNode, hoveredSegment, addPointPreview, marquee, internas = [], enganche = null,
}: EditPatternOverlayProps) {
  const piece = pieces.find(p => p.id === (editingPieceId ?? hoveredPieceId));
  if (!piece) return null;

  const classifiedAnchors = editingPieceId ? classifyEditableAnchors(piece, nodes) : [];

  // Match the renderer's per-piece transform so anchor dots track a rotated
  // piece (nota de María #170): translate by position, then rotate about the
  // outline bbox center. The marquee stays screen-aligned (outside this group).
  const rot = piece.rotation ?? 0;
  const anchorTransform = (() => {
    const base = `translate(${piece.position.x}, ${piece.position.y})`;
    if (!rot) return base;
    const { x: cx, y: cy } = outlineBBoxCenter(piece.outline);
    return `${base} rotate(${rot}, ${cx}, ${cy})`;
  })();

  const estado = (sel: Set<number>, hov: number | null, i: number): AnchorVisualState =>
    sel.has(i) ? 'selected' : hov === i ? 'hovered' : 'idle';

  return (
    <>
      <g transform={anchorTransform}>
        {/* Segment highlights */}
        {resaltesDeTramos(piece.outline, selectedSegments, hoveredSegment, zoom2D, '')}

        {/* Add-point preview */}
        {addPointPreview && (
          <circle cx={addPointPreview.x} cy={addPointPreview.y} r={4 / zoom2D} fill="var(--accent-2d)" opacity={0.5} />
        )}

        {/* Semantic anchor glyphs */}
        {classifiedAnchors.map(({ node, role }) => {
          const commandIndex = node.ref.commandIndex;
          return (
            <g key={commandIndex} data-command-index={commandIndex}>
              <AnchorGlyph role={role} position={node.position} zoom2D={zoom2D} state={estado(selectedNodes, hoveredNode, commandIndex)} />
            </g>
          );
        })}

        {/* Las internas, encima del contorno como en el lienzo. Antes de entrar,
            solo sus extremos: el mismo trato que el contorno (spec § 3.3). */}
        {internas.map(i => (
          <g key={i.lineId} data-interna={i.lineId}>
            {resaltesDeTramos(i.path, i.selectedSegments, i.hoveredSegment, zoom2D, `${i.lineId}-`)}
            {i.addPointPreview && (
              <circle cx={i.addPointPreview.x} cy={i.addPointPreview.y} r={4 / zoom2D} fill="var(--accent-2d)" opacity={0.5} />
            )}
            {classifyAnchorsOfPath(i.path, i.nodes)
              .filter(({ role }) => editingPieceId !== null || EXTREMOS.has(role))
              .map(({ node, role }) => {
                const ci = node.ref.commandIndex;
                return (
                  <g key={ci} data-command-index={ci}>
                    <AnchorGlyph role={role} position={node.position} zoom2D={zoom2D} state={estado(i.selectedNodes, i.hoveredNode, ci)} />
                  </g>
                );
              })}
          </g>
        ))}
      </g>

      {/* El anillo: la palabra que la app ya usa para «el próximo clic cae AQUÍ». */}
      {enganche && (
        <circle
          className="snap-ring"
          cx={enganche.x} cy={enganche.y} r={(EDGE_HIT_PX / zoom2D) * 0.5}
          fill="none" stroke="var(--snap-2d)" strokeWidth={2 / zoom2D} pointerEvents="none"
        />
      )}

      {/* Marquee selection rectangle */}
      {marquee && (
        <rect
          x={Math.min(marquee.start.x, marquee.current.x)}
          y={Math.min(marquee.start.y, marquee.current.y)}
          width={Math.abs(marquee.current.x - marquee.start.x)}
          height={Math.abs(marquee.current.y - marquee.start.y)}
          fill="var(--accent-2d)"
          fillOpacity={0.1}
          stroke="var(--accent-2d)"
          strokeWidth={1 / zoom2D}
          strokeDasharray={`${4 / zoom2D}`}
        />
      )}
    </>
  );
}
