import { PatternPiece, PathCommand, Point2D, Tool2D } from '../../../types/types';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';
import { NodeRef } from '../nodeEditorUtils';
import type { EditableNode } from '../nodeEditorUtils';
import POMOverlay from './overlays/POMOverlay';
import EdgePairOverlay from './overlays/EdgePairOverlay';
import NotchToolOverlay from './overlays/NotchToolOverlay';
import NotchMirrorOverlay from './overlays/NotchMirrorOverlay';
import GrainlineToolOverlay from './overlays/GrainlineToolOverlay';
import PenToolOverlay from './overlays/PenToolOverlay';
import LineToolOverlay from './overlays/LineToolOverlay';
import RectangleToolOverlay from './overlays/RectangleToolOverlay';
import MeasureToolOverlay from './overlays/MeasureToolOverlay';
import NodeEditorOverlay from './overlays/NodeEditorOverlay';
import EditPatternOverlay from './overlays/EditPatternOverlay';
import TransformHandlesOverlay from './overlays/TransformHandlesOverlay';
import ScissorsOverlay from './overlays/ScissorsOverlay';
import SlashAndSpreadOverlay from './overlays/SlashAndSpreadOverlay';
import MergeOverlay from './overlays/MergeOverlay';
import SegmentSewingOverlay from './overlays/SegmentSewingOverlay';
import TopstitchOverlay from './overlays/TopstitchOverlay';
import WalkSeamOverlay from './overlays/WalkSeamOverlay';
import OffsetPreviewOverlay from './overlays/OffsetPreviewOverlay';
import TrimToolOverlay from './overlays/TrimToolOverlay';
import type { TrimHover } from '../useTrimTool';
import type { SegmentSelection, SnapResult } from '../useSegmentSewingTool';
import type { WalkSeamEdge, GhostTransform, MismatchSample, WalkSeamMetrics } from '../useWalkSeamTool';
import type { FreeEdgeSelection } from '../sewingUtils';
import type { BBox, HandlePosition } from '../../../utils/geometry/transform';
import type { TransformPreview } from '../useTransformTool';
import type { SlashAndSpreadPhase } from '../useSlashAndSpreadTool';

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
  penDistance: { distance: number; position: Point2D } | null;
  rectPreview: { x: number; y: number; width: number; height: number } | null;
  rectDimensions: { width: number; height: number; center: Point2D } | null;
  lineStart: Point2D | null;
  lineCursor: Point2D | null;
  lineLength: { length: number; midpoint: Point2D } | null;
  seamFirstEdge: FreeEdgeSelection | null;
  seamHoveredEdge: FreeEdgeSelection | null;
  seamMode: 'free' | 'point';
  notchHoveredPoint: NotchHover | null;
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
  nodeEditorNodes: EditorNode[];
  selectedNode: NodeRef | null;
  hoveredNode: NodeRef | null;
  transformBbox: BBox | null;
  transformHandles: HandlePosition[];
  transformPreview: TransformPreview | null;
  // Edit Pattern
  editPatternIsEditing: boolean;
  editPatternEditingPieceId: string | null;
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
  // Segment Sewing
  segmentSewingPhase: string;
  segmentSewingSegmentA: SegmentSelection | null;
  segmentSewingSegmentB: SegmentSelection | null;
  segmentSewingPendingSnap: SnapResult | null;
  segmentSewingHoveredSnap: SnapResult | null;
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
  // Free Sewing
  freeSewingFirstEdge: FreeEdgeSelection | null;
  freeSewingHoveredEdge: FreeEdgeSelection | null;
  freeSewingMode: 'free' | 'point';
  // Offset Preview
  offsetPreviewOutline: PathCommand[] | null;
  offsetPreviewPiecePosition: Point2D | null;
}

export default function ToolOverlay(props: ToolOverlayProps) {
  const { activeTool, zoom2D, pieces, units } = props;

  const poms = useSelector((s: RootState) => s.project.poms);
  const selectedPOMId = useSelector((s: RootState) => s.editor.selectedPOMId);

  return (
    <>
      {/* POM dimension annotations — always visible */}
      <POMOverlay poms={poms} pieces={pieces} zoom2D={zoom2D} selectedPOMId={selectedPOMId} />

      {activeTool === 'seam' && (
        <EdgePairOverlay zoom2D={zoom2D} firstEdge={props.seamFirstEdge} hoveredEdge={props.seamHoveredEdge} mode={props.seamMode} />
      )}

      {activeTool === 'notch' && (props.notchHoveredPoint || props.notchRefineMarker) && (
        <NotchToolOverlay
          zoom2D={zoom2D}
          notchHoveredPoint={props.notchHoveredPoint}
          refineMarker={props.notchRefineMarker}
        />
      )}

      {/* Mirror-notch ghost (F3) — gated by presence, not activeTool. */}
      <NotchMirrorOverlay ghost={props.notchMirrorGhost ?? null} zoom={zoom2D} />

      {activeTool === 'trimPlace' && props.trimHoveredEdge && (
        <TrimToolOverlay zoom2D={zoom2D} hoveredEdge={props.trimHoveredEdge} />
      )}

      {activeTool === 'grainline' && props.grainlineIsDragging && props.grainlineStartPoint && props.grainlineEndPoint && props.grainlinePieceId && (
        <GrainlineToolOverlay zoom2D={zoom2D} pieces={pieces} grainlineStartPoint={props.grainlineStartPoint} grainlineEndPoint={props.grainlineEndPoint} grainlinePieceId={props.grainlinePieceId} />
      )}

      {activeTool === 'pen' && (
        <PenToolOverlay zoom2D={zoom2D} units={units} penNodes={props.penNodes} previewPath={props.previewPath} guidePath={props.guidePath} penDistance={props.penDistance} />
      )}

      {activeTool === 'line' && props.lineStart && (
        <LineToolOverlay zoom2D={zoom2D} units={units} lineStart={props.lineStart} lineCursor={props.lineCursor} lineLength={props.lineLength} />
      )}

      {activeTool === 'rectangle' && (
        <RectangleToolOverlay zoom2D={zoom2D} units={units} rectPreview={props.rectPreview} rectDimensions={props.rectDimensions} />
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

      {activeTool === 'transform' && props.transformBbox && (
        <TransformHandlesOverlay
          zoom2D={zoom2D}
          bbox={props.transformBbox}
          handles={props.transformHandles}
          preview={props.transformPreview}
        />
      )}

      {props.editPatternIsEditing && props.editPatternEditingPieceId && (
        <EditPatternOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          editingPieceId={props.editPatternEditingPieceId}
          nodes={props.editPatternNodes}
          selectedNodes={props.editPatternSelectedNodes}
          selectedSegments={props.editPatternSelectedSegments}
          hoveredNode={props.editPatternHoveredNode}
          hoveredSegment={props.editPatternHoveredSegment}
          addPointPreview={props.editPatternAddPointPreview}
          marquee={props.editPatternMarquee}
        />
      )}

      {props.nodeEditorIsEditing && props.nodeEditorEditingPieceId && (
        <NodeEditorOverlay zoom2D={zoom2D} units={units} pieces={pieces} nodeEditorEditingPieceId={props.nodeEditorEditingPieceId} nodeEditorNodes={props.nodeEditorNodes} selectedNode={props.selectedNode} hoveredNode={props.hoveredNode} />
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

      {activeTool === 'segmentSewing' && (
        <SegmentSewingOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          phase={props.segmentSewingPhase}
          segmentA={props.segmentSewingSegmentA}
          segmentB={props.segmentSewingSegmentB}
          pendingSnap={props.segmentSewingPendingSnap}
          hoveredSnap={props.segmentSewingHoveredSnap}
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

      {activeTool === 'freesewing' && (
        <EdgePairOverlay
          zoom2D={zoom2D}
          firstEdge={props.freeSewingFirstEdge}
          hoveredEdge={props.freeSewingHoveredEdge}
          mode={props.freeSewingMode}
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
