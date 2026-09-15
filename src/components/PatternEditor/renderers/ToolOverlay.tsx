import { PatternPiece, PathCommand, Point2D, Tool2D } from '../../../types/types';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';
import { extractNodes, NodeRef } from '../nodeEditorUtils';
import { classifyEditableAnchors } from '../anchorRoles';
import { EXTREMOS } from './PuntosDelContorno';
import type { SnapTarget } from '../snapIndex';
import type { EditableNode } from '../nodeEditorUtils';
import POMOverlay from './overlays/POMOverlay';
import EdgePairOverlay from './overlays/EdgePairOverlay';
import NotchToolOverlay from './overlays/NotchToolOverlay';
import NotchMirrorOverlay from './overlays/NotchMirrorOverlay';
import GrainlineToolOverlay from './overlays/GrainlineToolOverlay';
import PenToolOverlay from './overlays/PenToolOverlay';
import ShapeToolOverlay from './overlays/ShapeToolOverlay';
import MeasureToolOverlay from './overlays/MeasureToolOverlay';
import NodeEditorOverlay from './overlays/NodeEditorOverlay';
import EditPatternOverlay from './overlays/EditPatternOverlay';
import TransformHandlesOverlay from './overlays/TransformHandlesOverlay';
import ScissorsOverlay from './overlays/ScissorsOverlay';
import SlashAndSpreadOverlay from './overlays/SlashAndSpreadOverlay';
import MergeOverlay from './overlays/MergeOverlay';
import TopstitchOverlay from './overlays/TopstitchOverlay';
import WalkSeamOverlay from './overlays/WalkSeamOverlay';
import OffsetPreviewOverlay from './overlays/OffsetPreviewOverlay';
import TrimToolOverlay from './overlays/TrimToolOverlay';
import type { TrimHover } from '../useTrimTool';
import type { SegmentSelection } from '../useSegmentSewingTool';
import type { WalkSeamEdge, GhostTransform, MismatchSample, WalkSeamMetrics } from '../useWalkSeamTool';
import type { EdgeTarget } from '../edgeGesture';
import type { BBox, HandlePosition } from '../../../utils/geometry/transform';
import type { TransformPreview } from '../useTransformTool';
import type { SlashAndSpreadPhase } from '../useSlashAndSpreadTool';
import type { AngleReference } from '../angleReference';

interface PenNode {
  anchor: Point2D;
  handleIn: Point2D | null;
  handleOut: Point2D | null;
}


interface NotchHover {
  point: Point2D;
  normal: Point2D;
}

interface EditorNode {
  position: Point2D;
  cp1?: Point2D;
  ref: NodeRef;
}

import type { Measurement, SelectedEdgeInfo, CurveComparison } from '../useMeasureTool';

interface ToolOverlayProps {
  activeTool: Tool2D;
  zoom2D: number;
  pieces: PatternPiece[];
  units: string;
  penNodes: PenNode[];
  previewPath: string;
  guidePath: string | null;
  penDistance: {
    distance: number;
    position: Point2D;
    angleDeg?: number;
    reference?: AngleReference;
  } | null;
  precisionHint?: boolean;
  penWillClose: boolean;
  /** #1102: los puntos de las piezas y lo que el próximo clic enganchará. */
  penVertices?: Point2D[];
  penSnapHover?: SnapTarget | null;
  rectPreview: { x: number; y: number; width: number; height: number } | null;
  rectDimensions: { width: number; height: number; center: Point2D } | null;
  /** Círculo (#1111): la caja de la elipse en curso, no la del arrastre. */
  circlePreview: { x: number; y: number; width: number; height: number } | null;
  circleDimensions: { width: number; height: number; center: Point2D } | null;
  /** Triángulo (#1111, tanda 8): los tres vértices en curso, no una caja. */
  trianglePoints: [Point2D, Point2D, Point2D] | null;
  triangleDimensions: { width: number; height: number; center: Point2D } | null;
  seamSegmentA: SegmentSelection | null;
  seamHoveredTarget: EdgeTarget | null;
  /** El borde del press mientras el gesto de coser sigue vivo, y el tramo que
   *  lleva marcado el arrastre — el tramo en vivo que sustituye al hover. */
  seamActiveTarget: EdgeTarget | null;
  seamLiveRange: [number, number] | null;
  notchHoveredPoint: NotchHover | null;
  notchDragPreview?: import('../useNotchTool').NotchDragPreview | null;
  notchDragSegment?: SegmentSelection | null;
  /** Tool Punto (maria-203): preview solo cuando reason === 'ok'. */
  pointToolHover?: import('../usePointTool').PointToolHover | null;
  pointToolMode?: import('../usePointTool').PointToolMode;
  notchRefineMarker?: import('./overlays/NotchToolOverlay').NotchRefineMarker | null;
  /** F3 mirror-notch ghost — shown whenever a notch is selected and maps to a
   *  paired edge, regardless of activeTool (gated by presence, not tool). */
  notchMirrorGhost?: import('./overlays/NotchMirrorOverlay').NotchMirrorGhost | null;
  trimHoveredEdge: TrimHover | null;
  grainlineIsDragging: boolean;
  grainlineStartPoint: Point2D | null;
  grainlineEndPoint: Point2D | null;
  grainlinePieceId: string | null;
  measurements: Measurement[];
  currentStart: Point2D | null;
  cursorPos: Point2D | null;
  formatDistance: (d: number) => string;
  measureHoveredSnapPoint?: Point2D | null;
  measureShowAngle?: boolean;
  measureMode?: 'point-to-point' | 'along-curve' | 'compare';
  measureSelectedEdge?: SelectedEdgeInfo | null;
  measureHoverDistance?: number | null;
  measureCompareEdgeA?: SelectedEdgeInfo | null;
  measureComparison?: CurveComparison | null;
  nodeEditorIsEditing: boolean;
  nodeEditorEditingPieceId: string | null;
  nodeEditorHoveredPieceId: string | null;
  nodeEditorNodes: EditorNode[];
  selectedNode: NodeRef | null;
  hoveredNode: NodeRef | null;
  showTransformBox: boolean;
  transformBbox: BBox | null;
  transformHandles: HandlePosition[];
  transformPreview: TransformPreview | null;
  // Edit Pattern
  editPatternIsEditing: boolean;
  anchorReferencePieceId?: string | null;
  editPatternEditingPieceId: string | null;
  editPatternHoveredPieceId: string | null;
  editPatternNodes: EditableNode[];
  editPatternSelectedNodes: Set<number>;
  editPatternSelectedSegments: Set<number>;
  editPatternHoveredNode: number | null;
  editPatternHoveredSegment: number | null;
  editPatternAddPointPreview: Point2D | null;
  editPatternMarquee: { start: Point2D; current: Point2D } | null;
  // Select marquee (piece box-select)
  selectMarquee: { start: Point2D; current: Point2D } | null;
  // Scissors
  scissorsTargetPieceId: string | null;
  scissorsStartPoint: Point2D | null;
  scissorsEndPoint: Point2D | null;
  scissorsHoveredEdgePoint: Point2D | null;
  scissorsPreviewValid: boolean;
  // Slash and Spread
  ssPhase: SlashAndSpreadPhase;
  ssTargetPieceId: string | null;
  ssStartPoint: Point2D | null;
  ssEndPoint: Point2D | null;
  ssHalfA: PathCommand[] | null;
  ssHalfB: PathCommand[] | null;
  ssSelectedHalf: 'A' | 'B' | null;
  ssHoveredHalf: 'A' | 'B' | null;
  ssPivotPoint: Point2D | null;
  ssSpreadAmount: number;
  ssPreviewPiece: PatternPiece | null;
  // Merge
  mergePieceIdA: string | null;
  mergePieceIdB: string | null;
  mergeSharedEdgeFound: boolean;
  mergeError: string | null;
  // Topstitch
  topstitchMode: string;
  topstitchHoveredEdge: { pieceId: string; edgeIndex: number; start: Point2D; end: Point2D } | null;
  topstitchSegSnapA: { point: Point2D; edgeIndex: number; t: number; pieceId: string } | null;
  topstitchSegHover: { point: Point2D } | null;
  topstitchFreePieceId: string | null;
  topstitchFreePoints: Point2D[];
  topstitchFreeCursor: Point2D | null;
  topstitchHoveredSnapPoint: Point2D | null;
  // Walk Seam
  walkSeamStationaryEdge: WalkSeamEdge | null;
  walkSeamMobileEdge: WalkSeamEdge | null;
  walkSeamWalkDistance: number;
  walkSeamGhostTransform: GhostTransform | null;
  walkSeamGhostOpacity: number;
  walkSeamMismatchSamples: MismatchSample[];
  walkSeamMetrics: WalkSeamMetrics | null;
  walkSeamFormatDistance: (d: number) => string;
  walkSeamHoveredSnapPoint: Point2D | null;
  // Offset Preview
  offsetPreviewOutline: PathCommand[] | null;
  offsetPreviewPiecePosition: Point2D | null;
  // Extend/Trim Preview (#1178: se calculaba y no tenía consumidor)
  extendTrimPreviewOutline: PathCommand[] | null;
  extendTrimPreviewPiecePosition: Point2D | null;
}

export default function ToolOverlay(props: ToolOverlayProps) {
  const { activeTool, zoom2D, pieces, units } = props;
  const nodeEditorPieceId = props.nodeEditorIsEditing
    ? props.nodeEditorEditingPieceId
    : activeTool === 'editCurve'
      ? props.nodeEditorHoveredPieceId
      : null;
  const referencePiece = activeTool === 'select' && !props.nodeEditorIsEditing
    ? pieces.find(p => p.id === props.anchorReferencePieceId)
    : undefined;

  const poms = useSelector((s: RootState) => s.project.poms);
  const selectedPOMId = useSelector((s: RootState) => s.editor.selectedPOMId);

  return (
    <>
      {/* POM dimension annotations — always visible */}
      <POMOverlay poms={poms} pieces={pieces} zoom2D={zoom2D} selectedPOMId={selectedPOMId} />

      {activeTool === 'seam' && (
        <EdgePairOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          segmentA={props.seamSegmentA}
          hoveredTarget={props.seamHoveredTarget}
          activeTarget={props.seamActiveTarget}
          liveRange={props.seamLiveRange}
        />
      )}

      {/* El modal de una línea existente puede abrirse desde Seleccionar: su
          referencia sigue siendo necesaria aunque Piquete no esté activo. */}
      {(props.notchRefineMarker || (activeTool === 'notch' && (props.notchHoveredPoint || props.notchDragPreview))) && (
        <NotchToolOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          notchHoveredPoint={activeTool === 'notch' ? props.notchHoveredPoint : null}
          refineMarker={props.notchRefineMarker}
          dragPreview={activeTool === 'notch' ? props.notchDragPreview : null}
          dragSegment={activeTool === 'notch' ? props.notchDragSegment : null}
        />
      )}

      {/* Mirror-notch ghost (F3) — gated by presence, not activeTool. */}
      <NotchMirrorOverlay ghost={props.notchMirrorGhost ?? null} zoom={zoom2D} />

      {/* Tool Punto: el preview delata la granularidad del chip ANTES del
          clic — un punto en la proyección (chip 'point') vs el lado completo
          iluminado (chips de conversión). Sin preview cuando el contexto
          niega (ancla / curva con chip de conversión / bloqueada). */}
      {activeTool === 'point' && props.pointToolHover?.reason === 'ok' && props.pointToolHover.target && (
        <g className="point-tool-preview" pointerEvents="none">
          {props.pointToolMode === 'point' ? (
            <circle
              cx={props.pointToolHover.target.world.x}
              cy={props.pointToolHover.target.world.y}
              r={4 / zoom2D}
              fill="#4a9eff"
              stroke="#fff"
              strokeWidth={1.2 / zoom2D}
            />
          ) : (
            props.pointToolHover.target.sideEnds && (
              <line
                x1={props.pointToolHover.target.sideEnds[0].x}
                y1={props.pointToolHover.target.sideEnds[0].y}
                x2={props.pointToolHover.target.sideEnds[1].x}
                y2={props.pointToolHover.target.sideEnds[1].y}
                stroke="#4a9eff"
                strokeWidth={3 / zoom2D}
                strokeLinecap="round"
                opacity={0.6}
              />
            )
          )}
        </g>
      )}

      {activeTool === 'trimPlace' && props.trimHoveredEdge && (
        <TrimToolOverlay zoom2D={zoom2D} hoveredEdge={props.trimHoveredEdge} />
      )}

      {activeTool === 'grainline' && props.grainlineIsDragging && props.grainlineStartPoint && props.grainlineEndPoint && props.grainlinePieceId && (
        <GrainlineToolOverlay zoom2D={zoom2D} pieces={pieces} grainlineStartPoint={props.grainlineStartPoint} grainlineEndPoint={props.grainlineEndPoint} grainlinePieceId={props.grainlinePieceId} />
      )}

      {activeTool === 'pen' && (
        <PenToolOverlay zoom2D={zoom2D} units={units} penNodes={props.penNodes} previewPath={props.previewPath} guidePath={props.guidePath} penDistance={props.penDistance} penWillClose={props.penWillClose} verticesDePiezas={props.penVertices} snapHover={props.penSnapHover} precisionHint={props.precisionHint} />
      )}

      {activeTool === 'rectangle' && (
        <ShapeToolOverlay zoom2D={zoom2D} units={units} preview={props.rectPreview} dimensions={props.rectDimensions} />
      )}

      {activeTool === 'circle' && (
        <ShapeToolOverlay figura="elipse" zoom2D={zoom2D} units={units} preview={props.circlePreview} dimensions={props.circleDimensions} />
      )}

      {activeTool === 'triangle' && (
        <ShapeToolOverlay figura="triangulo" zoom2D={zoom2D} units={units} preview={null} puntos={props.trianglePoints} dimensions={props.triangleDimensions} />
      )}

      {(activeTool === 'measure' || activeTool === 'measureCurve' || activeTool === 'compareCurves') && (
        <MeasureToolOverlay
          zoom2D={zoom2D}
          measurements={props.measurements}
          currentStart={props.currentStart}
          cursorPos={props.cursorPos}
          hoveredSnapPoint={props.measureHoveredSnapPoint ?? null}
          formatDistance={props.formatDistance}
          showAngle={props.measureShowAngle}
          measureMode={props.measureMode}
          selectedEdge={props.measureSelectedEdge}
          hoverDistance={props.measureHoverDistance}
          compareEdgeA={props.measureCompareEdgeA}
          comparison={props.measureComparison}
        />
      )}

      {props.showTransformBox && props.transformBbox && (
        <TransformHandlesOverlay
          zoom2D={zoom2D}
          bbox={props.transformBbox}
          handles={props.transformHandles}
          preview={props.transformPreview}
        />
      )}

      {activeTool === 'editPattern'
        && ((props.editPatternIsEditing && props.editPatternEditingPieceId) || props.editPatternHoveredPieceId)
        && (
        <EditPatternOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          editingPieceId={props.editPatternEditingPieceId}
          hoveredPieceId={props.editPatternHoveredPieceId}
          nodes={props.editPatternNodes}
          selectedNodes={props.editPatternSelectedNodes}
          selectedSegments={props.editPatternSelectedSegments}
          hoveredNode={props.editPatternHoveredNode}
          hoveredSegment={props.editPatternHoveredSegment}
          addPointPreview={props.editPatternAddPointPreview}
          marquee={props.editPatternMarquee}
        />
      )}

      {/* Las anclas de referencia sobreviven al cambio Q → Seleccionar
          (maria-194), sin conservar una sesión ni estados de interacción.
          Leer el modelo aquí evita que undo o mover la pieza dejen puntos
          pegados a una geometría anterior. Como en PuntosDelContorno, fuera
          de edición solo se muestran extremos, nunca muestras de curva. */}
      {referencePiece && (
        <EditPatternOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          editingPieceId={referencePiece.id}
          hoveredPieceId={null}
          nodes={classifyEditableAnchors(referencePiece, extractNodes(referencePiece))
            .filter(({ role }) => EXTREMOS.has(role))
            .map(({ node }) => node)}
          selectedNodes={new Set<number>()}
          selectedSegments={new Set<number>()}
          hoveredNode={null}
          hoveredSegment={null}
          addPointPreview={null}
          marquee={null}
        />
      )}

      {(activeTool === 'select' || activeTool === 'editCurve') && nodeEditorPieceId && (
        <NodeEditorOverlay zoom2D={zoom2D} units={units} pieces={pieces} nodeEditorEditingPieceId={nodeEditorPieceId} nodeEditorNodes={props.nodeEditorNodes} selectedNode={props.selectedNode} hoveredNode={props.hoveredNode} />
      )}

      {activeTool === 'scissors' && (
        <ScissorsOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          targetPieceId={props.scissorsTargetPieceId}
          startPoint={props.scissorsStartPoint}
          endPoint={props.scissorsEndPoint}
          hoveredEdgePoint={props.scissorsHoveredEdgePoint}
          previewValid={props.scissorsPreviewValid}
        />
      )}

      {activeTool === 'slashAndSpread' && (
        <SlashAndSpreadOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          phase={props.ssPhase}
          targetPieceId={props.ssTargetPieceId}
          startPoint={props.ssStartPoint}
          endPoint={props.ssEndPoint}
          halfA={props.ssHalfA}
          halfB={props.ssHalfB}
          selectedHalf={props.ssSelectedHalf}
          hoveredHalf={props.ssHoveredHalf}
          pivotPoint={props.ssPivotPoint}
          spreadAmount={props.ssSpreadAmount}
          previewPiece={props.ssPreviewPiece}
        />
      )}

      {activeTool === 'merge' && (
        <MergeOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          pieceIdA={props.mergePieceIdA}
          pieceIdB={props.mergePieceIdB}
          sharedEdgeFound={props.mergeSharedEdgeFound}
          error={props.mergeError}
        />
      )}

      {(activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree') && (
        <TopstitchOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          mode={props.topstitchMode}
          hoveredEdge={props.topstitchHoveredEdge}
          segSnapA={props.topstitchSegSnapA}
          segHover={props.topstitchSegHover}
          freePieceId={props.topstitchFreePieceId}
          freePoints={props.topstitchFreePoints}
          freeCursor={props.topstitchFreeCursor}
          hoveredSnapPoint={props.topstitchHoveredSnapPoint}
        />
      )}

      {activeTool === 'walkSeam' && (
        <WalkSeamOverlay
          zoom2D={zoom2D}
          stationaryEdge={props.walkSeamStationaryEdge}
          mobileEdge={props.walkSeamMobileEdge}
          walkDistance={props.walkSeamWalkDistance}
          ghostTransform={props.walkSeamGhostTransform}
          ghostOpacity={props.walkSeamGhostOpacity}
          mismatchSamples={props.walkSeamMismatchSamples}
          metrics={props.walkSeamMetrics}
          formatDistance={props.walkSeamFormatDistance}
          hoveredSnapPoint={props.walkSeamHoveredSnapPoint}
        />
      )}

      {activeTool === 'offsetOutline' && props.offsetPreviewOutline && props.offsetPreviewPiecePosition && (
        <OffsetPreviewOverlay
          previewOutline={props.offsetPreviewOutline}
          piecePosition={props.offsetPreviewPiecePosition}
          zoom2D={zoom2D}
        />
      )}

      {/* Mismo componente que Offset: el preview es genérico —contorno +
          posición + zoom—, sin nada específico de una herramienta. Extender y
          Recortar no pintaban absolutamente nada en toda su vida (#1178). */}
      {activeTool === 'extendTrim' && props.extendTrimPreviewOutline && props.extendTrimPreviewPiecePosition && (
        <OffsetPreviewOverlay
          previewOutline={props.extendTrimPreviewOutline}
          piecePosition={props.extendTrimPreviewPiecePosition}
          zoom2D={zoom2D}
        />
      )}

      {/* Select tool marquee rectangle */}
      {props.selectMarquee && (
        <rect
          x={Math.min(props.selectMarquee.start.x, props.selectMarquee.current.x)}
          y={Math.min(props.selectMarquee.start.y, props.selectMarquee.current.y)}
          width={Math.abs(props.selectMarquee.current.x - props.selectMarquee.start.x)}
          height={Math.abs(props.selectMarquee.current.y - props.selectMarquee.start.y)}
          fill="rgba(74, 158, 255, 0.1)"
          stroke="#4A9EFF"
          strokeWidth={1 / zoom2D}
          strokeDasharray={`${4 / zoom2D}`}
          pointerEvents="none"
        />
      )}
    </>
  );
}
