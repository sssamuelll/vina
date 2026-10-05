/**
 * SeamRenderer — Renders sewing connections between pattern pieces.
 *
 * CLO3D parity:
 * - Dotted connection lines between sewn edges
 * - Directional arrows showing sewing order
 * - Length mismatch warnings (red highlight when edges differ >5%)
 * - Selected seam highlighted
 */

import { PatternPiece, Point2D, Seam } from '../../../types/types';
import { getEdgeEndpoints, getEdgePathD, getRangePathD } from '../../../utils/geometry/path';
import { rangoMedibleDeBorde } from '../../../utils/semanticEdges';
import { resolveEdgePolyline, edgeNToCommandIndex, slicePolylineByT } from '../../../utils/seam/index';
import { samplePolyline, perpendicular } from '../../../utils/pleatGeometry';
import { seamPairColor, seamMismatchMm, layoutMismatchLabels, SEAM_MISMATCH_THRESHOLD_MM } from './seamVisuals';
import { largosDeCostura } from '../../../utils/seam/largoCosido';

interface SeamRendererProps {
  seams: Seam[];
  pieces: PatternPiece[];
  zoom2D: number;
  selectedSeamId: string | null;
  /** 'full' en la herramienta de editar (las costuras son la capa protagonista);
   *  'muted' en la de crear, donde estorban. Spec § 4.3. */
  emphasis?: 'full' | 'muted';
  hoveredSeamIds?: readonly string[];
}

const NO_HOVERED_SEAMS: readonly string[] = [];

/**
 * Directional notch (CLO3D parity, Fase 5): a short tick perpendicular to
 * the edge near its START (t≈0.05). The point near the tick is the start
 * point; the far one is the end point — same convention as CLO3D's
 * Directional Notch. Returns an SVG path, or null for degenerate edges.
 */
function directionTick(pts: Point2D[], zoom: number): string | null {
  if (pts.length < 2) return null;
  const { point, tangent } = samplePolyline(pts, 0.05);
  const perp = perpendicular(tangent);
  const s = 5 / zoom;
  return `M${point.x - perp.x * s},${point.y - perp.y * s} L${point.x + perp.x * s},${point.y + perp.y * s}`;
}

export default function SeamRenderer({
  seams, pieces, zoom2D, selectedSeamId, emphasis = 'full',
  hoveredSeamIds = NO_HOVERED_SEAMS,
}: SeamRendererProps) {
  // Pre-pass (Fase1-H1): resolver la geometría de todos los seams ANTES de
  // renderizar, para que los labels de mismatch puedan hacer layout
  // anticolisión entre seams (anclados al mismo punto se apilaban ilegibles).
  const entries = seams.flatMap((seam) => {
        const pieceA = pieces.find(p => p.id === seam.pieceA.pieceId);
        const pieceB = pieces.find(p => p.id === seam.pieceB.pieceId);
        if (!pieceA || !pieceB) return [];

        // Resolve semantic edge name to its command range (with edge-N
        // fallback). Traducido: el tramo de cierre se rotula con la `M`, que no
        // dibuja, y una costura sobre él no se pintaba (#1143).
        const semEdgeA = pieceA.edges?.find(e => e.name === seam.pieceA.edgeName);
        const semEdgeB = pieceB.edges?.find(e => e.name === seam.pieceB.edgeName);
        const comandosA = semEdgeA ? rangoMedibleDeBorde(pieceA.outline, semEdgeA.segmentRange) : null;
        const comandosB = semEdgeB ? rangoMedibleDeBorde(pieceB.outline, semEdgeB.segmentRange) : null;
        let segIdxA = comandosA?.[0] ?? -1;
        let segIdxB = comandosB?.[0] ?? -1;
        // Fallback: legacy "edge-N" IS a command index already (the
        // resolveEdgeName producer contract — edgeNToCommandIndex). The old
        // `N + 1` here read one edge past the one the user clicked, and
        // disagreed with what the solver sewed.
        if (segIdxA < 0) {
          segIdxA = edgeNToCommandIndex(pieceA.outline, seam.pieceA.edgeName) ?? 1;
        }
        if (segIdxB < 0) {
          segIdxB = edgeNToCommandIndex(pieceB.outline, seam.pieceB.edgeName) ?? 1;
        }

        const epA = getEdgeEndpoints(pieceA.outline, segIdxA);
        const epB = getEdgeEndpoints(pieceB.outline, segIdxB);
        if (!epA || !epB) return [];

        const offA = pieceA.position;
        const offB = pieceB.position;

        // Rango parcial cosido (#1022): el render pinta el SUB-TRAMO, no el
        // borde entero. El rango de B se aplica sobre la polilínea ya
        // invertida por `reversed` — vive en dirección de cosido, igual que
        // el filtro del solver (convención seamRange.ts).
        const rangeA = seam.pieceA.tStart != null && seam.pieceA.tEnd != null
          ? [seam.pieceA.tStart, seam.pieceA.tEnd] as [number, number] : null;
        const rangeB = seam.pieceB.tStart != null && seam.pieceB.tEnd != null
          ? [seam.pieceB.tStart, seam.pieceB.tEnd] as [number, number] : null;

        // ─── Direction-aware geometry (Fase 5) ───
        // Resolve each half's sub-polyline in TRAVERSAL order (B honors
        // `reversed`), same resolution pipeline as the solver. Falls back
        // to the legacy midpoint connection when an edge can't resolve.
        const toCanvas = (pts: Point2D[], off: { x: number; y: number }) =>
          pts.map(p => ({ x: p.x + off.x, y: p.y + off.y }));
        const fullPolyA = resolveEdgePolyline(pieceA.outline, pieceA.edges, seam.pieceA.edgeName);
        const fullPolyB = resolveEdgePolyline(pieceB.outline, pieceB.edges, seam.pieceB.edgeName, seam.pieceB.reversed === true);
        const polyA = toCanvas(rangeA ? slicePolylineByT(fullPolyA, rangeA[0], rangeA[1]) : fullPolyA, offA);
        const polyB = toCanvas(rangeB ? slicePolylineByT(fullPolyB, rangeB[0], rangeB[1]) : fullPolyB, offB);
        const hasDirection = polyA.length >= 2 && polyB.length >= 2;

        // SVG path data following curves (not straight lines). Un half con
        // rango parcial usa su polilínea recortada (misma resolución que el
        // solver) en vez del path exacto del comando completo.
        const polyToPathD = (pts: Point2D[]): string =>
          'M' + pts.map(p => `${p.x},${p.y}`).join(' L');
        // Una costura entera pinta su borde ENTERO: el primer comando solo era,
        // en las curvas del DXF de María, un resalte de 2,4 mm. Un rango vacío
        // ([i, i]) dibuja su primer comando, como lo cose el motor
        // (`commandRangeToFlattened`).
        const pathDA = rangeA && polyA.length >= 2
          ? polyToPathD(polyA)
          : (comandosA && getRangePathD(pieceA.outline, comandosA, offA.x, offA.y)) || getEdgePathD(pieceA.outline, segIdxA, offA.x, offA.y);
        const pathDB = rangeB && polyB.length >= 2
          ? polyToPathD(polyB)
          : (comandosB && getRangePathD(pieceB.outline, comandosB, offB.x, offB.y)) || getEdgePathD(pieceB.outline, segIdxB, offB.x, offB.y);

        // Los largos y la etiqueta de desajuste van en el medio del tramo
        // cosido, no en el del primer comando del borde.
        const midA = polyA.length >= 2 ? samplePolyline(polyA, 0.5).point : {
          x: (epA.start.x + epA.end.x) / 2 + offA.x,
          y: (epA.start.y + epA.end.y) / 2 + offA.y,
        };
        const midB = polyB.length >= 2 ? samplePolyline(polyB, 0.5).point : {
          x: (epB.start.x + epB.end.x) / 2 + offB.x,
          y: (epB.start.y + epB.end.y) / 2 + offB.y,
        };

        // Length validation. Use ARC length (samples curves), not the chord:
        // autoSew pairs edges by arc length, so a chord-based mismatch wildly
        // over-reports curved seams (armholes, caps, necklines) — a correctly
        // matched curved seam would otherwise show a huge false mismatch.
        // Mismatch in ABSOLUTE mm, red above 1mm (Fase 6 / CLO3D parity):
        // 5% relative hid a 19mm error on a 400mm side seam and cried wolf
        // at 0.6mm on a 10mm notch seam. The craft works in mm.
        // Largo COSIDO (sewnLengthMm): un half parcial compara su sub-tramo,
        // no el borde entero — si no, todo seam parcial gritaba mismatch.
        // Una sola medida (spec 2026-10-05): el borde ENTERO por la fracción
        // cosida. `getEdgeArcLength(outline, segmentRange[0])` medía solo el
        // primer comando, y el DXF de María trae bordes de 14-20.
        const { a: lenA, b: lenB } = largosDeCostura(seam, pieces);
        const mismatchMm = lenA != null && lenB != null ? seamMismatchMm(lenA, lenB) : 0;
        const hasMismatch = mismatchMm > SEAM_MISMATCH_THRESHOLD_MM;

        // El hover de coser/editar enciende igual que la selección. La lista
        // conserva todos los pares cuando un mismo borde lleva varias costuras.
        const isLit = selectedSeamId === seam.id || hoveredSeamIds.includes(seam.id);
        const isInactive = seam.active === false;
        // One channel per concern (Fase 6, Iris N3): the pair color is
        // IDENTITY and never changes under interaction — selection shows as
        // weight (wider stroke + accent glow halo behind), mismatch as the
        // red label only. Inactive is the one state that mutes the color
        // (the pair is out of the simulation). var() tokens must be applied
        // via `style` (SVG presentation attrs can't read CSS variables).
        const baseColor = isInactive ? 'var(--ink-on-light-3)' : seamPairColor(seam.id);
        // Type-specific line styles (CLO3D parity)
        const z = zoom2D;
        let edgeDash: string | undefined;
        if (isInactive) {
          edgeDash = `${4 / z} ${3 / z}`;
        } else {
          switch (seam.type) {
            case 'french': edgeDash = `${6 / z} ${3 / z}`; break;                       // dashed
            case 'overlock': edgeDash = `${2 / z} ${2 / z} ${6 / z} ${2 / z}`; break;   // dash-dot (zigzag feel)
            case 'flat-felled': edgeDash = `${8 / z} ${2 / z} ${2 / z} ${2 / z}`; break; // long-short-short
            default: edgeDash = undefined; break;                                         // solid (standard)
          }
        }
        const edgeWidth = (isLit ? 4 : seam.taped ? 4 : 2.5) / zoom2D;

        // Directional notches (perpendicular tick near each start, t≈0.05)
        const tickA = hasDirection ? directionTick(polyA, zoom2D) : null;
        const tickB = hasDirection ? directionTick(polyB, zoom2D) : null;

        return [{
          seam, epA, epB, offA, offB, pathDA, pathDB, midA, midB, lenA, lenB,
          mismatchMm, hasMismatch, isLit, isInactive, baseColor, edgeDash,
          edgeWidth, polyA, polyB, hasDirection, tickA, tickB,
        }];
  });

  // Layout global de labels de mismatch: mismos anclajes → apilado vertical.
  const labelFont = 9 / zoom2D;
  const labelPos = layoutMismatchLabels(
    entries
      .filter(e => e.hasMismatch)
      .map(e => ({
        id: e.seam.id,
        x: (e.midA.x + e.midB.x) / 2,
        y: (e.midA.y + e.midB.y) / 2 - 8 / zoom2D,
        text: `⚠ ${e.mismatchMm.toFixed(1)}mm de diferencia`,
      })),
    labelFont,
  );

  return (
    <>
      {entries.map(({
        seam, epA, epB, offA, offB, pathDA, pathDB, midA, midB, lenA, lenB,
        mismatchMm, hasMismatch, isLit, isInactive, baseColor, edgeDash,
        edgeWidth, polyA, polyB, hasDirection, tickA, tickB,
      }) => {
        return (
          <g
            key={seam.id}
            className={`seam-connection${isLit ? ' seam-connection--selected' : ''}`}
            // 'muted' en la herramienta de crear (Coser): las costuras están
            // ahí de referencia, no son la capa protagonista — spec § 4.3.
            opacity={(isInactive ? 0.5 : 1) * (emphasis === 'muted' ? 0.45 : 1)}
          >
            {/* Selection glow (wider semi-transparent halo BEHIND the pair
                color — selection is weight, never recolor, Fase 6). The class
                lets E2E specs separate the halo from the edge highlights. */}
            {isLit && pathDA && (
              <path className="seam-selection-glow" d={pathDA} fill="none" style={{ stroke: 'var(--accent-2d)' }} strokeWidth={edgeWidth * 3} strokeLinecap="round" opacity={0.2} />
            )}
            {isLit && pathDB && (
              <path className="seam-selection-glow" d={pathDB} fill="none" style={{ stroke: 'var(--accent-2d)' }} strokeWidth={edgeWidth * 3} strokeLinecap="round" opacity={0.2} />
            )}
            {/* Edge A highlight (follows curves) */}
            {pathDA ? (
              <path
                d={pathDA}
                fill="none"
                style={{ stroke: baseColor }}
                strokeWidth={edgeWidth}
                strokeLinecap="round"
                strokeDasharray={edgeDash}
              />
            ) : (
              <line
                x1={epA.start.x + offA.x} y1={epA.start.y + offA.y}
                x2={epA.end.x + offA.x} y2={epA.end.y + offA.y}
                style={{ stroke: baseColor }} strokeWidth={edgeWidth} strokeLinecap="round" strokeDasharray={edgeDash}
              />
            )}
            {/* Edge B highlight (follows curves) */}
            {pathDB ? (
              <path
                d={pathDB}
                fill="none"
                style={{ stroke: baseColor }}
                strokeWidth={edgeWidth}
                strokeLinecap="round"
                strokeDasharray={edgeDash}
              />
            ) : (
              <line
                x1={epB.start.x + offB.x} y1={epB.start.y + offB.y}
                x2={epB.end.x + offB.x} y2={epB.end.y + offB.y}
                style={{ stroke: baseColor }} strokeWidth={edgeWidth} strokeLinecap="round" strokeDasharray={edgeDash}
              />
            )}
            {/* Detail markers (connection, dots, arrows) — hover/selection only
                (Iris cut 3): with several seams the always-on markers turned
                the canvas into noise. The edge highlights remain the ambient
                signal; details appear on demand via CSS (.seam-detail). */}
            <g className="seam-detail">
              {hasDirection ? (
                <>
                  {/* Connection lines start→start + end→end (Fase 5). When
                      the halves are aligned the two lines are roughly
                      parallel; a reversed half makes them CROSS — the X is
                      the pre-simulation error signal CLO3D shows, fixed by
                      Ctrl+B (Reverse Sewing). */}
                  <line
                    x1={polyA[0].x} y1={polyA[0].y}
                    x2={polyB[0].x} y2={polyB[0].y}
                    style={{ stroke: baseColor }}
                    strokeWidth={1 / zoom2D}
                    strokeDasharray={`${5 / zoom2D} ${3 / zoom2D}`}
                    opacity={0.6}
                  />
                  <line
                    x1={polyA[polyA.length - 1].x} y1={polyA[polyA.length - 1].y}
                    x2={polyB[polyB.length - 1].x} y2={polyB[polyB.length - 1].y}
                    style={{ stroke: baseColor }}
                    strokeWidth={1 / zoom2D}
                    strokeDasharray={`${5 / zoom2D} ${3 / zoom2D}`}
                    opacity={0.6}
                  />
                  {/* Start anchors */}
                  <circle cx={polyA[0].x} cy={polyA[0].y} r={3 / zoom2D} style={{ fill: baseColor }} />
                  <circle cx={polyB[0].x} cy={polyB[0].y} r={3 / zoom2D} style={{ fill: baseColor }} />
                  {/* Directional notches (perpendicular tick at t≈0.05 from
                      each start — the CLO3D direction language). The class
                      lets E2E specs separate ticks from edge highlights. */}
                  {tickA && <path className="seam-direction-tick" d={tickA} style={{ stroke: baseColor }} strokeWidth={2 / zoom2D} fill="none" opacity={0.9} />}
                  {tickB && <path className="seam-direction-tick" d={tickB} style={{ stroke: baseColor }} strokeWidth={2 / zoom2D} fill="none" opacity={0.9} />}
                </>
              ) : (
                <>
                  {/* Legacy fallback: edge unresolvable (Fase 4 surfaces it
                      in sim) — midpoint connection keeps the seam visible. */}
                  <line
                    x1={midA.x} y1={midA.y}
                    x2={midB.x} y2={midB.y}
                    style={{ stroke: baseColor }}
                    strokeWidth={1 / zoom2D}
                    strokeDasharray={`${5 / zoom2D} ${3 / zoom2D}`}
                    opacity={0.6}
                  />
                  <circle cx={midA.x} cy={midA.y} r={3 / zoom2D} style={{ fill: baseColor }} />
                  <circle cx={midB.x} cy={midB.y} r={3 / zoom2D} style={{ fill: baseColor }} />
                </>
              )}
              {/* Mismatch y tensión viven AQUÍ dentro (maria-201): escritos
                  fijos en pantalla estorbaban al transformar el patrón. El
                  hover del tramo cosido los enseña, como CLO3D. El layout
                  anticolisión se conserva para cuando hover y selección
                  muestren varios a la vez. */}
              {hasMismatch && (
                <text
                  x={labelPos.get(seam.id)?.x ?? (midA.x + midB.x) / 2}
                  y={labelPos.get(seam.id)?.y ?? (midA.y + midB.y) / 2 - 8 / zoom2D}
                  fontSize={labelFont}
                  textAnchor="middle"
                  fontWeight={600}
                  style={{ fill: 'var(--piece-error-2d)', fontFamily: 'var(--font-mono-2d)' }}
                >
                  ⚠ {mismatchMm.toFixed(1)}mm de diferencia
                </text>
              )}
              {seam.tension !== 100 && !isInactive && (
                <text
                  x={(midA.x + midB.x) / 2}
                  y={(midA.y + midB.y) / 2 + (hasMismatch ? 14 : -8) / zoom2D}
                  fontSize={8 / zoom2D}
                  textAnchor="middle"
                  fontWeight={600}
                  style={{ fill: seam.tension < 100 ? 'var(--seam-tension-gather-2d)' : 'var(--seam-tension-ease-2d)', fontFamily: 'var(--font-mono-2d)' }}
                >
                  {seam.tension}%{seam.tension < 100 ? ' fruncido' : ' embebido'}
                </text>
              )}
            </g>

            {/* Length labels (on selected/hovered) */}
            {isLit && (
              <>
                <text
                  x={midA.x} y={midA.y - 8 / zoom2D}
                  fontSize={8 / zoom2D} textAnchor="middle"
                  style={{ fill: 'var(--ink-on-light-2)', fontFamily: 'var(--font-mono-2d)' }}
                >
                  {lenA != null ? `${lenA.toFixed(1)}mm` : '—'}
                </text>
                <text
                  x={midB.x} y={midB.y - 8 / zoom2D}
                  fontSize={8 / zoom2D} textAnchor="middle"
                  style={{ fill: 'var(--ink-on-light-2)', fontFamily: 'var(--font-mono-2d)' }}
                >
                  {lenB != null ? `${lenB.toFixed(1)}mm` : '—'}
                </text>
              </>
            )}
          </g>
        );
      })}
    </>
  );
}
