
import React, { memo, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store';
import { PatternPiece, PathCommand, UnitSystem } from '../../../types/types';
import LineLengthLabels from './LineLengthLabels';
import PuntosDelContorno from './PuntosDelContorno';
import { pathToSVG } from '../utils';
import { effectiveSeamAllowanceWidth } from '../../../utils/seam';
import {
  generateSeamAllowanceWithCorners,
  hasPositiveEdgeAllowance,
  type MatchLookup,
} from '../../../utils/seam/cornerTypes';
import { buildMatchLookup } from '../../../utils/seam/matchResolver';
import { ANNOTATION_CATEGORY_COLORS } from '../../../utils/annotationTemplates';
import { resolveColorway } from '../../../utils/colorwayResolver';
import { formatPieceLabel } from '../../../utils/pieceLabel';
import { dartApexPoint, internalLineColor } from './internalLineStyle';
import { pieceBodyStyle } from './pieceBodyStyle';
import { PHYSICAL_FABRIC_LIBRARY } from '../../../utils/cloth/physicalFabric';
import { outlineBBoxCenter } from '../../../utils/geometry/transform';
import { grainlineArrowheads } from '../../../utils/grainLine';
import { zoomAwareStroke } from './zoomAwareStroke';

/** Rotation pivot: bbox center of an outline. Shared with edit overlays/hit-tests. */
function getOutlineCenter(outline: PathCommand[]): { cx: number; cy: number } {
  const { x, y } = outlineBBoxCenter(outline);
  return { cx: x, cy: y };
}

interface SinglePieceProps {
  piece: PatternPiece;
  isSelected: boolean;
  zoom2D: number;
  showSeamAllowance: boolean;
  showGrainlines: boolean;
  showNotches: boolean;
  showPieceNames: boolean;
  renderMode2D: 'textured' | 'translucent' | 'wireframe';
  showLineLengths: boolean;
  /** La pieza que se está editando con una herramienta de curva: solo esa enseña sus puntos de curva. Por PIEZA, no global — encenderlo para todas suelta cientos de puntos sobre piezas que nadie toca (#1103). */
  piezaConPuntosDeCurva: string | null;
  units: UnitSystem;
  isInternalLineSelected: boolean;
  selectedLineId?: string;
  isEditingName: boolean;
  /** Stable 0-based piece index, used to derive the displayed number (`· 01`). */
  pieceNumber: number;
  /** Group color for visual indicator (first group the piece belongs to) */
  groupColor?: string;
  /** Whether the piece's layer is locked (reduced opacity + no pointer events) */
  isLayerLocked?: boolean;
  /** Whether the piece has unresolved construction points */
  hasResolutionErrors?: boolean;
  /** Active colorway override color for this piece (from resolveColorway) */
  colorwayColor?: string;
  /** `match` ("Empatada") corner resolution for this piece (parent-memoized). */
  matchLookup?: MatchLookup;
  onPieceNameDoubleClick?: (pieceId: string) => void;
  onPieceNameSave?: (pieceId: string, newName: string) => void;
  onPieceNameCancel?: () => void;
}

const SinglePiece = memo(function SinglePiece({
  piece,
  isSelected,
  zoom2D,
  showSeamAllowance,
  showGrainlines,
  showNotches,
  showPieceNames,
  renderMode2D,
  showLineLengths,
  piezaConPuntosDeCurva,
  units,
  isInternalLineSelected,
  selectedLineId,
  isEditingName,
  pieceNumber,
  groupColor,
  isLayerLocked,
  hasResolutionErrors,
  colorwayColor,
  matchLookup,
  onPieceNameDoubleClick,
  onPieceNameSave,
  onPieceNameCancel,
}: SinglePieceProps) {
  const { cx, cy } = piece.outline?.length ? getOutlineCenter(piece.outline) : { cx: 0, cy: 0 };

  // ── Seam-allowance double-line (design surface 5, P0.1) ──
  // The piece OUTLINE is the stitch/seam line (interior); the outward-offset SA
  // contour is the CUT line (exterior). Same geometry the export pipeline uses —
  // only the styling is the redesign. When SA is hidden, the outline is itself
  // the cut line. The accent is reserved for selection; the band is a faint shade
  // between the two contours.
  // Las piezas siguen naciendo netas y no recuperan un fallback global; un
  // tramo o borde con ancho propio sí cuenta porque también fue pedido de forma
  // explícita por el usuario.
  // Memoized so the partner-SA regen a `match` corner triggers doesn't run every
  // render frame — only when the piece geometry, widths, or its match lookup change.
  const saPath = useMemo(() => {
    const saWidth = effectiveSeamAllowanceWidth(piece);
    const hasExplicitAllowance = saWidth > 0 || hasPositiveEdgeAllowance(piece.edges);
    if (!(showSeamAllowance && hasExplicitAllowance && (piece.outline?.length ?? 0) >= 2)) return [];
    // ALWAYS the edge-walk generator. There used to be a "fast path" here that
    // sent plain pieces (no corner overrides, no per-edge widths — i.e. every
    // freshly drawn rectangle) to Clipper's ClipperOffset instead. That offset is
    // broken in clipper2-js 1.2.4: it returns 6 points for a convex quad and can
    // return LESS area than the input for an outward offset. maria-190.
    return generateSeamAllowanceWithCorners(
      piece.outline, saWidth, piece.defaultCornerType ?? 'mitered', piece.cornerTypes ?? {}, piece.edges, matchLookup,
    );
    // piece is an immutable Redux object — a stable ref until it actually changes.
  }, [showSeamAllowance, piece, matchLookup]);
  const hasSA = saPath.length > 0;
  const outlineD = piece.outline?.length ? pathToSVG(piece.outline) : '';
  const saD = hasSA ? pathToSVG(saPath) : '';
  const cutStroke = isSelected ? 'var(--accent-2d)' : 'var(--ink-on-light)';
  // Hueca + contorno de trazos cuando está bloqueada (nota de María #192).
  const { fill: interiorFill, cutDash } = pieceBodyStyle({
    locked: piece.locked, renderMode2D, colorwayColor, isSelected, zoom2D,
  });

  // Layer-locked: reduce opacity and disable pointer events
  const groupOpacity = piece.active === false ? 0.3 : isLayerLocked ? 0.5 : 1;
  const groupStyle: React.CSSProperties | undefined =
    piece.active === false ? { filter: 'grayscale(100%)' }
    : isLayerLocked ? { pointerEvents: 'none' as const }
    : undefined;

  return (
    <g
      data-piece-id={piece.id}
      transform={`translate(${piece.position.x}, ${piece.position.y}) rotate(${piece.rotation}, ${cx}, ${cy})`}
      className={`pattern-piece ${isSelected ? 'selected' : ''}`}
      opacity={groupOpacity}
      style={groupStyle}
    >
      {/* Layer membership has no canvas indicator (hallazgo #4, María): the
          floating left-border rect read as pattern geometry, not UI chrome.
          Layer color/identity lives in LayerPanel only. */}
      {/* Interior fill — no color on the piece body (ink/accent only, per spec) */}
      <path
        className="piece-fill"
        d={outlineD}
        style={{ fill: interiorFill }}
        stroke="none"
      />

      {/* Sin overlay de hover: María pidió quitarlo (#207) — la iluminación
          persistente al pasar el ratón estorbaba para trabajar encima de la
          pieza. Lo que dice que una pieza está seleccionada es la línea de
          corte en acento + las anclas, no el relleno. */}

      {/* Seam-allowance band: faint shade between cut and seam contours */}
      {hasSA && (
        <path
          d={`${saD} ${outlineD}`}
          fillRule="evenodd"
          style={{ fill: 'var(--ink-on-light)' }}
          opacity={0.06}
          stroke="none"
          pointerEvents="none"
        />
      )}

      {/* Cut line (solid, exterior). With SA it's the offset contour; else the outline. */}
      <path
        data-testid="piece-cut-line"
        d={hasSA ? saD : outlineD}
        fill="none"
        style={{ stroke: cutStroke }}
        strokeWidth={zoomAwareStroke(1.4, zoom2D)}
        strokeLinejoin="round"
        strokeDasharray={cutDash}
        pointerEvents="none"
      />

      {/* Seam line (dashed, interior) — only when SA is shown */}
      {hasSA && (
        <path
          d={outlineD}
          fill="none"
          style={{ stroke: 'var(--ink-on-light-2)' }}
          strokeWidth={zoomAwareStroke(0.8, zoom2D)}
          strokeDasharray={`${zoomAwareStroke(3, zoom2D)} ${zoomAwareStroke(3, zoom2D)}`}
          pointerEvents="none"
        />
      )}

      {groupColor && (
        <path
          d={pathToSVG(piece.outline)}
          fill="none"
          stroke={groupColor}
          strokeWidth={2.5 / zoom2D}
          strokeDasharray={`${6 / zoom2D} ${4 / zoom2D}`}
          opacity={0.7}
          pointerEvents="none"
        />
      )}

      {hasResolutionErrors && (
        <path
          d={pathToSVG(piece.outline)}
          fill="none"
          style={{ stroke: 'var(--piece-error-2d)' }}
          strokeWidth={2 / zoom2D}
          strokeDasharray={`${6 / zoom2D} ${4 / zoom2D}`}
          pointerEvents="none"
        />
      )}

      {piece.internals.map(line => {
        const isNotch = line.type === 'notch';
        if (isNotch && !showNotches) return null;
        const hasFill = isNotch && line.notchOptions?.shape === 'diamond';
        const isLineSelected = isInternalLineSelected && selectedLineId === line.id;

        // Tokenized internal-line colors (design surface 5, P0.3) — see internalLineColor.
        const lineColor = internalLineColor(line, isLineSelected);
        const dartApex = line.type === 'dart' ? dartApexPoint(line.path) : null;
        // Grainline arrowhead (nota de María #169): one head, at the path's end
        // — same single arrow the draw preview shows, pointing the way the
        // piece gets cut. See grainlineArrowheads.
        const grainlineHeads = line.type === 'grainline' && showGrainlines
          ? grainlineArrowheads(line.path, 6 / zoom2D)
          : [];

        // Compute fold direction markers for fold lines with foldOptions
        const foldMarkers: React.ReactElement[] = [];
        if (line.type === 'fold' && line.foldOptions) {
          const firstCmd = line.path[0];
          const lastCmd = line.path[line.path.length - 1];
          if (firstCmd?.type === 'M' && firstCmd.values.length >= 2 &&
              lastCmd?.type === 'L' && lastCmd.values.length >= 2) {
            const x1 = firstCmd.values[0], y1 = firstCmd.values[1];
            const x2 = lastCmd.values[0], y2 = lastCmd.values[1];
            const dx = x2 - x1, dy = y2 - y1;
            const lineLen = Math.sqrt(dx * dx + dy * dy);
            if (lineLen > 0) {
              const isMountain = line.foldOptions.direction === 'mountain';
              const markerColor = isMountain ? 'var(--fold-mountain-2d)' : 'var(--fold-valley-2d)';
              const interval = 20 / zoom2D;
              const triSize = 3 / zoom2D;
              const tx = dx / lineLen, ty = dy / lineLen;   // unit tangent
              const nx = -ty, ny = tx;                       // unit normal (left of direction)
              const sign = isMountain ? -1 : 1;              // mountain: points toward -normal, valley: +normal
              const count = Math.max(1, Math.floor(lineLen / interval));
              for (let i = 1; i <= count; i++) {
                const t = i / (count + 1);
                const mx = x1 + t * dx;
                const my = y1 + t * dy;
                // Equilateral triangle: apex in sign*normal direction, base perpendicular
                const apex = { x: mx + sign * nx * triSize * 1.5, y: my + sign * ny * triSize * 1.5 };
                const base1 = { x: mx - tx * triSize + (-sign) * nx * triSize * 0.5,
                                y: my - ty * triSize + (-sign) * ny * triSize * 0.5 };
                const base2 = { x: mx + tx * triSize + (-sign) * nx * triSize * 0.5,
                                y: my + ty * triSize + (-sign) * ny * triSize * 0.5 };
                foldMarkers.push(
                  <polygon
                    key={`fm-${i}`}
                    points={`${apex.x},${apex.y} ${base1.x},${base1.y} ${base2.x},${base2.y}`}
                    style={{ fill: markerColor }}
                    opacity={0.8}
                    pointerEvents="none"
                  />
                );
              }
            }
          }
        }

        return (
          <g key={line.id}>
            <path
              data-internal-line-type={line.type}
              d={pathToSVG(line.path)}
              style={{ stroke: lineColor, fill: hasFill ? lineColor : 'none' }}
              strokeWidth={isLineSelected ? 2 / zoom2D : 0.8 / zoom2D}
              strokeDasharray={
                line.type === 'fold' ? `${5 / zoom2D} ${3 / zoom2D} ${0.5 / zoom2D} ${3 / zoom2D}` :
                line.type === 'topstitch' ? `${(line.topstitchOptions?.stitchLength ?? 3) / zoom2D} ${1.5 / zoom2D}` :
                line.type === 'reference' ? `${4 / zoom2D} ${4 / zoom2D}` :
                'none'
              }
              opacity={line.type === 'grainline' && !showGrainlines ? 0 : line.type === 'reference' ? 0.6 : isLineSelected ? 1 : 0.8}
            />
            {/* Grainline arrowhead (direction of cut) */}
            {grainlineHeads.map((tri, gi) => (
              <polygon
                key={`gl-arrow-${gi}`}
                points={tri.map(p => `${p.x},${p.y}`).join(' ')}
                style={{ fill: lineColor }}
                opacity={isLineSelected ? 1 : 0.8}
                pointerEvents="none"
              />
            ))}
            {/* Dart apex point marker (P0.3) */}
            {dartApex && (
              <circle
                cx={dartApex.x} cy={dartApex.y} r={2.2 / zoom2D}
                style={{ fill: lineColor }} stroke="none" pointerEvents="none"
              />
            )}
            {foldMarkers.length > 0 && <g className="fold-direction-markers">{foldMarkers}</g>}
            {isLineSelected && (() => {
              const first = line.path[0];
              const last = line.path[line.path.length - 1];
              const points: { x: number; y: number }[] = [];
              if (first?.type === 'M' && first.values.length >= 2) {
                points.push({ x: first.values[0], y: first.values[1] });
              }
              if (last?.type === 'L' && last.values.length >= 2) {
                points.push({ x: last.values[0], y: last.values[1] });
              } else if (last?.type === 'C' && last.values.length >= 6) {
                points.push({ x: last.values[4], y: last.values[5] });
              } else if (last?.type === 'Q' && last.values.length >= 4) {
                points.push({ x: last.values[2], y: last.values[3] });
              }
              return (
                <g className="internal-line-endpoints">
                  {points.map((pt, i) => (
                    <circle
                      key={i}
                      cx={pt.x}
                      cy={pt.y}
                      r={3.5 / zoom2D}
                      fillOpacity={0.7}
                      strokeWidth={1 / zoom2D}
                      style={{ cursor: 'move', fill: 'var(--accent-2d)', stroke: 'var(--accent-2d)' }}
                      pointerEvents="none"
                    />
                  ))}
                </g>
              );
            })()}
          </g>
        );
      })}

      {showPieceNames && (() => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const cmd of piece.outline) {
          for (let i = 0; i < cmd.values.length - 1; i += 2) {
            minX = Math.min(minX, cmd.values[i]);
            minY = Math.min(minY, cmd.values[i + 1]);
            maxX = Math.max(maxX, cmd.values[i]);
            maxY = Math.max(maxY, cmd.values[i + 1]);
          }
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        if (isEditingName) {
          return (
            <foreignObject
              x={cx - 50 / zoom2D}
              y={cy - 8 / zoom2D}
              width={100 / zoom2D}
              height={16 / zoom2D}
              transform={`rotate(${-piece.rotation}, ${cx}, ${cy})`}
            >
              <input
                type="text"
                defaultValue={piece.name}
                autoFocus
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'transparent',
                  // El contorno se quita y se repone: sin esto el unico indicio
                  // de foco era el resaltado de seleccion de `onFocus`, que se
                  // pierde en cuanto se escribe. Mismo par que su hermano
                  // `.layer-inline-rename` (LayerPanel.css:38). El censo de R6
                  // no lo veia: solo miraba CSS, y este estilo va en linea.
                  border: '1px solid var(--accent)',
                  outline: 'none',
                  fontSize: `${11 / zoom2D}px`,
                  fontFamily: 'var(--font-mono-2d)',
                  fontWeight: 600,
                  color: 'var(--ink-on-light)',
                  textAlign: 'center',
                  padding: 0,
                  margin: 0,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onPieceNameSave?.(piece.id, e.currentTarget.value);
                  } else if (e.key === 'Escape') {
                    onPieceNameCancel?.();
                  }
                }}
                onBlur={(e) => {
                  onPieceNameSave?.(piece.id, e.currentTarget.value);
                }}
                onFocus={(e) => {
                  e.currentTarget.select();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              />
            </foreignObject>
          );
        } else {
          // Label block (design surface 5, P0.2): headline name·num + monospace
          // meta lines (CUT ×N / size / fabric / mirror). Derived, no model change.
          const fabricName = PHYSICAL_FABRIC_LIBRARY.find(f => f.id === piece.fabricId)?.nameEs;
          const { name, meta } = formatPieceLabel(piece, pieceNumber, fabricName);
          // Name outranks meta by 13:9 (1.44×), clearing the 1.25× contrast
          // threshold so the headline reads as a headline, not decoration.
          const nameSize = 13 / zoom2D;
          const metaSize = 9 / zoom2D;
          const lineGap = 14 / zoom2D;
          const startY = cy - ((meta.length) * lineGap) / 2;
          return (
            <g transform={`rotate(${-piece.rotation}, ${cx}, ${cy})`} className="piece-label-block">
              <text
                x={cx}
                y={startY}
                fontSize={nameSize}
                fontWeight={600}
                letterSpacing={0.08 * nameSize}
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="auto"
                style={{ fill: 'var(--ink-on-light)', fontFamily: 'var(--font-mono-2d)', cursor: 'pointer' }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onPieceNameDoubleClick?.(piece.id);
                }}
              >
                {name}
              </text>
              {meta.map((m, i) => (
                <text
                  key={i}
                  x={cx}
                  y={startY + (i + 1) * lineGap}
                  fontSize={metaSize}
                  letterSpacing={0.08 * metaSize}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                  style={{ fill: 'var(--ink-on-light-2)', fontFamily: 'var(--font-mono-2d)' }}
                >
                  {m}
                </text>
              ))}
            </g>
          );
        }
      })()}

      {showLineLengths && (
        <LineLengthLabels piece={piece} zoom2D={zoom2D} units={units} />
      )}

      {(piece.annotations || []).map((ann, i) => (
        <text
          key={ann.id}
          x={cx}
          y={cy + (12 + i * 10) / zoom2D}
          fontSize={8 / zoom2D}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
          opacity={0.85}
          style={{ fontFamily: 'var(--font-mono-2d)', fill: ANNOTATION_CATEGORY_COLORS[ann.category] || 'var(--annotation-2d)' }}
        >
          {ann.text}
        </text>
      ))}

      {piece.locked && (() => {
        const { cx, cy } = piece.outline?.length ? getOutlineCenter(piece.outline) : { cx: 0, cy: 0 };
        return (
          <text
            x={cx}
            y={cy + 14 / zoom2D}
            fontSize={10 / zoom2D}
            textAnchor="middle"
            dominantBaseline="middle"
            pointerEvents="none"
            style={{ fontFamily: 'var(--font-mono-2d)', fill: 'var(--piece-locked-2d)' }}
          >
            {/* En español, como el resto de la interfaz — decía `locked` sobre
                menús que dicen "Bloquear"/"Desbloquear" (nota de María #192). */}
            bloqueada
          </text>
        );
      })()}

      {/* Los extremos, SIEMPRE — no solo con la pieza elegida (#1103). El
          bloque de antes pintaba todos los nodos como el mismo círculo, sin
          decir cuál es esquina y cuál de curva, y sin deduplicar el vértice
          repetido que trae el DXF de CLO. */}
      <PuntosDelContorno
        piece={piece}
        zoom2D={zoom2D}
        isSelected={isSelected}
        mostrarPuntosDeCurva={piezaConPuntosDeCurva === piece.id}
      />
    </g>
  );
});

interface PieceRendererProps {
  pieces: PatternPiece[];
  selectedPieceIds: string[];
  zoom2D: number;
  showSeamAllowance: boolean;
  showGrainlines: boolean;
  showNotches: boolean;
  showPieceNames: boolean;
  renderMode2D: 'textured' | 'translucent' | 'wireframe';
  showLineLengths: boolean;
  /** La pieza que se está editando con una herramienta de curva: solo esa enseña sus puntos de curva. Por PIEZA, no global — encenderlo para todas suelta cientos de puntos sobre piezas que nadie toca (#1103). */
  piezaConPuntosDeCurva: string | null;
  units: UnitSystem;
  /** Map of piece ID to group color for visual indicators */
  groupColors?: Record<string, string>;
  selectedInternalLine?: { pieceId: string; lineId: string } | null;
  editingPieceNameId?: string | null;
  onPieceNameDoubleClick?: (pieceId: string) => void;
  onPieceNameSave?: (pieceId: string, newName: string) => void;
  onPieceNameCancel?: () => void;
}

export default function PieceRenderer({
  pieces,
  selectedPieceIds,
  zoom2D,
  showSeamAllowance,
  showGrainlines,
  showNotches,
  showPieceNames,
  renderMode2D,
  showLineLengths,
  piezaConPuntosDeCurva,
  units,
  groupColors,
  selectedInternalLine,
  editingPieceNameId,
  onPieceNameDoubleClick,
  onPieceNameSave,
  onPieceNameCancel
}: PieceRendererProps) {
  // Layer visibility selectors
  const hiddenLayerIds = useSelector((s: RootState) => s.simulation.hiddenLayerIds);
  const layerLocked = useSelector((s: RootState) => s.project.layerLocked);

  // Matched corner ("Empatada") lookups. Built once per [pieces, seams] change —
  // NOT per render frame — so the partner-SA measurement each `match` vertex
  // needs isn't recomputed on unrelated re-renders. Only pieces that actually
  // carry a `match` corner get an entry; the rest stay undefined (no work, and
  // the SinglePiece memo is undisturbed).
  const seams = useSelector((s: RootState) => s.project.seams);
  const matchLookupByPiece = useMemo(() => {
    const m: Record<string, MatchLookup> = {};
    for (const p of pieces) {
      const hasMatch = p.defaultCornerType === 'match'
        || Object.values(p.cornerTypes ?? {}).some((t) => t === 'match');
      if (hasMatch) m[p.id] = buildMatchLookup(p, pieces, seams);
    }
    return m;
  }, [pieces, seams]);

  // Colorway selectors + resolver
  const colorways = useSelector((s: RootState) => s.project.colorways);
  const activeColorwayId = useSelector((s: RootState) => s.project.activeColorwayId);
  const fabricLibraryIds = useMemo(() => new Set(PHYSICAL_FABRIC_LIBRARY.map(f => f.id)), []);
  const baseFabrics = useMemo(() => {
    const map: Record<string, { color: string; fabricId: string }> = {};
    map['SELF'] = { color: '#ffffff', fabricId: 'cotton-poplin' };
    return map;
  }, []);

  // Construction resolution error selectors
  const constructionPoints = useSelector((s: RootState) => s.construction.points);
  const pieceIdentityMap = useSelector((s: RootState) => s.construction.pieceIdentityMap);
  const constructionPieces = useSelector((s: RootState) => s.construction.pieces);

  const hasResolutionErrors = useMemo(() => {
    const errorMap = new Map<string, boolean>();
    for (const [cPieceId, ppId] of Object.entries(pieceIdentityMap)) {
      const cPiece = constructionPieces.find(cp => cp.id === cPieceId);
      if (cPiece) {
        const hasErrors = cPiece.nodes.some(node => {
          const pt = constructionPoints.find(p => p.id === node.pointId);
          return pt?.resolutionError != null;
        });
        errorMap.set(ppId, hasErrors);
      }
    }
    return errorMap;
  }, [constructionPoints, pieceIdentityMap, constructionPieces]);

  const sortedPieces = useMemo(
    () => [...pieces]
      .filter(p => !hiddenLayerIds.includes(p.layer ?? 1))
      .sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0)),
    [pieces, hiddenLayerIds],
  );

  // Stable label numbers from the original piece order (not z-sorted), so a
  // piece keeps its number regardless of stacking.
  const pieceNumberById = useMemo(() => {
    const m: Record<string, number> = {};
    pieces.forEach((p, i) => { m[p.id] = i; });
    return m;
  }, [pieces]);

  return (
    <>
      {sortedPieces.map(piece => (
        <SinglePiece
          key={piece.id}
          piece={piece}
          isSelected={selectedPieceIds.includes(piece.id)}
          zoom2D={zoom2D}
          showSeamAllowance={showSeamAllowance}
          showGrainlines={showGrainlines}
          showNotches={showNotches}
          showPieceNames={showPieceNames}
          renderMode2D={renderMode2D}
          showLineLengths={showLineLengths}
          piezaConPuntosDeCurva={piezaConPuntosDeCurva}
          units={units}
          groupColor={groupColors?.[piece.id]}
          isLayerLocked={!!layerLocked[piece.layer ?? 1]}
          hasResolutionErrors={hasResolutionErrors.get(piece.id) ?? false}
          colorwayColor={(() => {
            if (!activeColorwayId) return undefined;
            const resolved = resolveColorway(piece, colorways, activeColorwayId, baseFabrics, fabricLibraryIds);
            return resolved.isOverridden ? resolved.color : undefined;
          })()}
          isInternalLineSelected={selectedInternalLine?.pieceId === piece.id}
          selectedLineId={selectedInternalLine?.lineId}
          isEditingName={editingPieceNameId === piece.id}
          pieceNumber={pieceNumberById[piece.id] ?? 0}
          matchLookup={matchLookupByPiece[piece.id]}
          onPieceNameDoubleClick={onPieceNameDoubleClick}
          onPieceNameSave={onPieceNameSave}
          onPieceNameCancel={onPieceNameCancel}
        />
      ))}
    </>
  );
}
