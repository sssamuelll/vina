import { PatternPiece, Point2D, Tool2D } from '../../../types/types';
import { NodeRef } from '../nodeEditorUtils';
import type { EditableNode } from '../nodeEditorUtils';
import SeamToolOverlay from './overlays/SeamToolOverlay';
import NotchToolOverlay from './overlays/NotchToolOverlay';
import GrainlineToolOverlay from './overlays/GrainlineToolOverlay';
import PenToolOverlay from './overlays/PenToolOverlay';
import LineToolOverlay from './overlays/LineToolOverlay';
import RectangleToolOverlay from './overlays/RectangleToolOverlay';
import MeasureToolOverlay from './overlays/MeasureToolOverlay';
import NodeEditorOverlay from './overlays/NodeEditorOverlay';
import EditPatternOverlay from './overlays/EditPatternOverlay';
import TransformHandlesOverlay from './overlays/TransformHandlesOverlay';
import ScissorsOverlay from './overlays/ScissorsOverlay';
import MergeOverlay from './overlays/MergeOverlay';
import type { BBox, HandlePosition } from '../transformUtils';
import type { TransformPreview } from '../useTransformTool';

interface PenNode {
  anchor: Point2D;
  handleIn: Point2D | null;
  handleOut: Point2D | null;
}

interface SeamEdge {
  pieceId: string;
  edgeIndex: number;
  midpoint: Point2D;
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

interface Measurement {
  id: string;
  startPoint: Point2D;
  endPoint: Point2D;
  distance: number;
  isPathMeasurement: boolean;
  pathPoints?: Point2D[];
  angle?: number;
}

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
  firstEdge: SeamEdge | null;
  hoveredEdge: SeamEdge | null;
  notchHoveredPoint: NotchHover | null;
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
  // Scissors
  scissorsTargetPieceId: string | null;
  scissorsStartPoint: Point2D | null;
  scissorsEndPoint: Point2D | null;
  scissorsHoveredEdgePoint: Point2D | null;
  scissorsPreviewValid: boolean;
  // Merge
  mergePieceIdA: string | null;
  mergePieceIdB: string | null;
  mergeSharedEdgeFound: boolean;
  mergeError: string | null;
}

export default function ToolOverlay(props: ToolOverlayProps) {
  const { activeTool, zoom2D, pieces, units } = props;

  return (
    <>
      {activeTool === 'seam' && (
        <SeamToolOverlay zoom2D={zoom2D} pieces={pieces} firstEdge={props.firstEdge} hoveredEdge={props.hoveredEdge} />
      )}

      {activeTool === 'notch' && props.notchHoveredPoint && (
        <NotchToolOverlay zoom2D={zoom2D} notchHoveredPoint={props.notchHoveredPoint} />
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

      {activeTool === 'measure' && (
        <MeasureToolOverlay zoom2D={zoom2D} measurements={props.measurements} currentStart={props.currentStart} cursorPos={props.cursorPos} hoveredSnapPoint={props.measureHoveredSnapPoint ?? null} formatDistance={props.formatDistance} showAngle={props.measureShowAngle} />
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
    </>
  );
}
