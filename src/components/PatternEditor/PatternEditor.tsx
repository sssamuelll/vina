import { useCallback, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { addPiece, addSeam, addInternalLine, setInternalLine, updatePiece } from '../../store/projectSlice';
import { selectPiece, selectSeam, setZoom2D, setPan2D, computeFitView } from '../../store/editorSlice';
import { selectPieces, selectSeams, selectEditor, selectToolOptions } from '../../store/selectors';
import type { RootState } from '../../store';
import { PatternPiece, Seam, InternalLine, Point2D } from '../../types/types';
import { usePenTool } from './usePenTool';
import { useRectangleTool } from './useRectangleTool';
import { useLineTool } from './useLineTool';
import { useFreeSewingTool } from './useFreeSewingTool';
import { getEdgeEndpoints } from '../../utils/geometry/path';
import { useNotchTool } from './useNotchTool';
import { useGrainlineTool } from './useGrainlineTool';
import { useEditCurve } from './useEditCurve';
import { useEditPattern } from './useEditPattern';
import { nearestSegment } from './nodeEditorUtils';
import { useMeasureTool } from './useMeasureTool';
import { useTransformTool } from './useTransformTool';
import { useScissorsTool } from './useScissorsTool';
import { useMergeTool } from './useMergeTool';
import { useSegmentSewingTool } from './useSegmentSewingTool';
import { useTopstitchTool } from './useTopstitchTool';
import { useWalkSeamTool } from './useWalkSeamTool';
import { useOffsetTool } from './useOffsetTool';
import { useExtendTrimTool } from './useExtendTrimTool';
import { useEditorInteractions } from './useEditorInteractions';
import GridLayer from './renderers/GridLayer';
import PieceRenderer from './renderers/PieceRenderer';
import SeamRenderer from './renderers/SeamRenderer';
import ToolOverlay from './renderers/ToolOverlay';
import HintText from './renderers/HintText';
import ConstructionOverlay from './renderers/ConstructionOverlay';
import ContextMenu, { type ContextMenuState } from './ContextMenu';
import './PatternEditor.css';

export default function PatternEditor() {
  const dispatch = useDispatch();
  const pieces = useSelector(selectPieces);
  const seams = useSelector(selectSeams);
  const editor = useSelector(selectEditor);
  const { activeTool, zoom2D, pan2D, showSeamAllowance, showGrainlines, showPieceNames, showSewingLines, renderMode2D, gridSize, units } = editor;
  const selectedPieceIds = editor.selectedPieceIds;
  const toolOptions = useSelector(selectToolOptions);
  const groups = useSelector((s: RootState) => s.project.groups);

  // Compute piece ID -> group color mapping for 2D visual indicators
  const groupColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const group of groups) {
      for (const pid of group.pieceIds) {
        if (!map[pid]) map[pid] = group.color; // first group wins
      }
    }
    return map;
  }, [groups]);
  
  // State for inline piece name editing
  const [editingPieceNameId, setEditingPieceNameId] = useState<string | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({
    visible: false, x: 0, y: 0, pieceId: null,
  });

  const handlePieceComplete = useCallback((piece: Omit<PatternPiece, 'id' | 'createdAt' | 'updatedAt'>) => {
    const fullPiece: PatternPiece = {
      ...piece,
      id: `piece-${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    dispatch(addPiece(fullPiece));
    dispatch(selectPiece(fullPiece.id));
  }, [dispatch]);

  const pen = usePenTool(zoom2D, pan2D, handlePieceComplete);
  const rectTool = useRectangleTool(zoom2D, pan2D, handlePieceComplete);

  const handleInternalLineAdd = useCallback((pieceId: string, line: InternalLine) => {
    dispatch(addInternalLine({ pieceId, line }));
  }, [dispatch]);

  const lineTool = useLineTool(zoom2D, pan2D, pieces, handleInternalLineAdd);

  const handleSeamComplete = useCallback((seam: Omit<Seam, 'id'>) => {
    const fullSeam: Seam = { ...seam, id: `seam-${Date.now()}` };
    dispatch(addSeam(fullSeam));
    dispatch(selectSeam(fullSeam.id));
  }, [dispatch]);

  const seamTool = useFreeSewingTool(zoom2D, pan2D, pieces, handleSeamComplete, 'free');

  const handleNotchAdd = useCallback((pieceId: string, notch: InternalLine) => {
    dispatch(addInternalLine({ pieceId, line: notch }));
  }, [dispatch]);

  const notchTool = useNotchTool(zoom2D, pan2D, pieces, handleNotchAdd);

  const handleGrainlineSet = useCallback((pieceId: string, grainline: InternalLine) => {
    dispatch(setInternalLine({ pieceId, line: grainline }));
  }, [dispatch]);

  const grainlineTool = useGrainlineTool(zoom2D, pan2D, pieces, handleGrainlineSet);
  const nodeEditor = useEditCurve(zoom2D, pan2D);
  const editPatternTool = useEditPattern(zoom2D, pan2D);
  const scissorsTool = useScissorsTool(zoom2D, pan2D);
  const mergeTool = useMergeTool(zoom2D, pan2D);
  const measureTool = useMeasureTool(zoom2D, pan2D);
  const segmentSewingTool = useSegmentSewingTool(zoom2D, pan2D, pieces);
  const topstitchTool = useTopstitchTool(zoom2D, pan2D, pieces);
  const walkSeamTool = useWalkSeamTool(zoom2D, pan2D);
  const offsetTool = useOffsetTool(zoom2D, pan2D);
  const extendTrimTool = useExtendTrimTool(zoom2D, pan2D);
  const freeSewingMode = (toolOptions?.freesewing?.sewingType as 'free' | 'point') ?? 'free';
  const freeSewingTool = useFreeSewingTool(zoom2D, pan2D, pieces, handleSeamComplete, freeSewingMode);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Determine which piece (if any) is under the cursor
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - pan2D.x) / zoom2D;
    const canvasY = (e.clientY - rect.top - pan2D.y) / zoom2D;

    // Hit-test: find piece whose bounding box contains the point
    let hitPiece: typeof pieces[0] | null = null;
    for (const piece of pieces) {
      if (!piece.outline?.length) continue;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const cmd of piece.outline) {
        const v = cmd.values;
        for (let i = 0; i < v.length; i += 2) {
          const px = v[i] + (piece.position?.x ?? 0);
          const py = v[i + 1] + (piece.position?.y ?? 0);
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
      if (canvasX >= minX && canvasX <= maxX && canvasY >= minY && canvasY <= maxY) {
        hitPiece = piece;
        break;
      }
    }

    // Hit-test seams: check proximity to seam connection lines and edge highlights
    let hitSeamId: string | null = null;
    const SEAM_THRESHOLD = 8 / zoom2D;
    for (const seam of seams) {
      const pieceA = pieces.find(p => p.id === seam.pieceA.pieceId);
      const pieceB = pieces.find(p => p.id === seam.pieceB.pieceId);
      if (!pieceA || !pieceB) continue;
      const semEdgeA = pieceA.edges?.find(e => e.name === seam.pieceA.edgeName);
      const semEdgeB = pieceB.edges?.find(e => e.name === seam.pieceB.edgeName);
      const segIdxA = semEdgeA?.segmentRange[0] ?? 1;
      const segIdxB = semEdgeB?.segmentRange[0] ?? 1;
      const epA = getEdgeEndpoints(pieceA.outline, segIdxA);
      const epB = getEdgeEndpoints(pieceB.outline, segIdxB);
      if (!epA || !epB) continue;
      const offA = pieceA.position;
      const offB = pieceB.position;
      const midA = { x: (epA.start.x + epA.end.x) / 2 + offA.x, y: (epA.start.y + epA.end.y) / 2 + offA.y };
      const midB = { x: (epB.start.x + epB.end.x) / 2 + offB.x, y: (epB.start.y + epB.end.y) / 2 + offB.y };
      // Check proximity to connection line (midA to midB)
      const dx = midB.x - midA.x, dy = midB.y - midA.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq > 0) {
        let t = ((canvasX - midA.x) * dx + (canvasY - midA.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const closestX = midA.x + t * dx, closestY = midA.y + t * dy;
        if (Math.hypot(canvasX - closestX, canvasY - closestY) <= SEAM_THRESHOLD) {
          hitSeamId = seam.id;
          break;
        }
      }
      // Check proximity to midpoint dots
      if (Math.hypot(canvasX - midA.x, canvasY - midA.y) <= SEAM_THRESHOLD ||
          Math.hypot(canvasX - midB.x, canvasY - midB.y) <= SEAM_THRESHOLD) {
        hitSeamId = seam.id;
        break;
      }
    }

    let segmentIndex: number | undefined;
    let segmentIsCurve: boolean | undefined;
    if (editPatternTool.isEditing && editPatternTool.editingPieceId && hitPiece?.id === editPatternTool.editingPieceId) {
      const localPt = { x: canvasX - (hitPiece.position?.x ?? 0), y: canvasY - (hitPiece.position?.y ?? 0) };
      const segHit = nearestSegment(localPt, hitPiece.outline);
      if (segHit && segHit.distance <= 8 / zoom2D) {
        segmentIndex = segHit.commandIndex;
        const cmd = hitPiece.outline[segHit.commandIndex];
        segmentIsCurve = cmd?.type === 'C' || cmd?.type === 'Q';
      }
    }

    setCtxMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      pieceId: hitSeamId ? null : (hitPiece?.id ?? null),
      pieceName: hitSeamId ? undefined : hitPiece?.name,
      seamId: hitSeamId,
      segmentIndex,
      segmentIsCurve,
      activeTool,
    });
  }, [pieces, seams, pan2D, zoom2D, activeTool, editPatternTool.isEditing, editPatternTool.editingPieceId]);

  const handleTransform = useCallback((updates: Array<{ id: string; outline: PatternPiece['outline']; position: Point2D }>) => {
    for (const u of updates) {
      const piece = pieces.find(p => p.id === u.id);
      if (piece) {
        dispatch(updatePiece({
          ...piece,
          outline: u.outline,
          position: u.position,
          updatedAt: Date.now(),
        }));
      }
    }
  }, [pieces, dispatch]);

  const transformTool = useTransformTool(zoom2D, pan2D, pieces, selectedPieceIds, handleTransform);

  // Piece name editing callbacks
  const handlePieceNameDoubleClick = useCallback((pieceId: string) => {
    setEditingPieceNameId(pieceId);
  }, []);
  
  const handlePieceNameSave = useCallback((pieceId: string, newName: string) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (piece && newName.trim() && newName !== piece.name) {
      dispatch(updatePiece({ ...piece, name: newName.trim(), updatedAt: Date.now() }));
    }
    setEditingPieceNameId(null);
  }, [pieces, dispatch]);
  
  const handlePieceNameCancel = useCallback(() => {
    setEditingPieceNameId(null);
  }, []);

  const { svgRef, handleWheel, handleDoubleClick, handleMouseDown, handleMouseMove, handleMouseUp, getCursor, selectMarquee } =
    useEditorInteractions(activeTool, zoom2D, pan2D, pieces, {
      pen, rectTool, lineTool, seamTool, notchTool, grainlineTool, measureTool, nodeEditor, transformTool, editPattern: editPatternTool, scissorsTool, mergeTool, segmentSewingTool, topstitchTool, walkSeamTool, freeSewingTool, offsetTool, extendTrimTool,
    });

  const handleZoomToFit = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl || pieces.length === 0) return;
    const rect = svgEl.getBoundingClientRect();
    const fit = computeFitView(pieces, rect.width, rect.height);
    if (fit) {
      dispatch(setZoom2D(fit.zoom));
      dispatch(setPan2D(fit.pan));
    }
  }, [pieces, dispatch, svgRef]);

  return (
    <div className="pattern-editor">
      <svg
        ref={svgRef}
        className="pattern-svg"
        width="100%"
        height="100%"
        style={{ cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      >
        <GridLayer zoom2D={zoom2D} pan2D={pan2D} gridSize={gridSize} />

        <g data-pan-zoom-group transform={`translate(${pan2D.x}, ${pan2D.y}) scale(${zoom2D})`}>
          <PieceRenderer
            pieces={pieces}
            selectedPieceIds={selectedPieceIds}
            zoom2D={zoom2D}
            showSeamAllowance={showSeamAllowance}
            defaultSeamAllowanceWidth={editor.defaultSeamAllowanceWidth}
            showGrainlines={showGrainlines}
            showPieceNames={showPieceNames}
            renderMode2D={renderMode2D}
            groupColors={groupColors}
            selectedInternalLine={editor.selectedInternalLine}
            editingPieceNameId={editingPieceNameId}
            onPieceNameDoubleClick={handlePieceNameDoubleClick}
            onPieceNameSave={handlePieceNameSave}
            onPieceNameCancel={handlePieceNameCancel}
          />
          <ConstructionOverlay zoom2D={zoom2D} pieces={pieces} />
          {showSewingLines && (
            <SeamRenderer
              seams={seams}
              pieces={pieces}
              zoom2D={zoom2D}
              selectedSeamId={editor.selectedSeamId}
            />
          )}
          <ToolOverlay
            activeTool={activeTool}
            zoom2D={zoom2D}
            pieces={pieces}
            units={units}
            penNodes={pen.nodes}
            previewPath={pen.previewPath}
            guidePath={pen.guidePath}
            penDistance={pen.lastPointDistance}
            rectPreview={rectTool.previewRect}
            rectDimensions={rectTool.rectDimensions}
            seamFirstEdge={seamTool.firstEdge}
            seamHoveredEdge={seamTool.hoveredEdge}
            seamMode={seamTool.mode}
            lineStart={lineTool.startPoint}
            lineCursor={lineTool.cursorPos}
            lineLength={lineTool.lineLength}
            notchHoveredPoint={notchTool.hoveredPoint}
            grainlineIsDragging={grainlineTool.isDragging}
            grainlineStartPoint={grainlineTool.startPoint}
            grainlineEndPoint={grainlineTool.endPoint}
            grainlinePieceId={grainlineTool.pieceId}
            measurements={measureTool.measurements}
            currentStart={measureTool.currentStart}
            cursorPos={measureTool.cursorPos}
            formatDistance={measureTool.formatDistance}
            measureHoveredSnapPoint={measureTool.hoveredSnapPoint}
            measureShowAngle={toolOptions?.[activeTool]?.showAngle ?? false}
            measureMode={measureTool.measureMode}
            measureSelectedEdge={measureTool.selectedEdge}
            measureHoverDistance={measureTool.hoverDistance}
            measureCompareEdgeA={measureTool.compareEdgeA}
            measureComparison={measureTool.comparison}
            nodeEditorIsEditing={nodeEditor.isEditing}
            nodeEditorEditingPieceId={nodeEditor.editingPieceId}
            nodeEditorNodes={nodeEditor.nodes}
            selectedNode={nodeEditor.selectedNode}
            hoveredNode={nodeEditor.hoveredNode}
            transformBbox={transformTool.bbox}
            transformHandles={transformTool.handles}
            transformPreview={transformTool.preview}
            editPatternIsEditing={editPatternTool.isEditing}
            editPatternEditingPieceId={editPatternTool.editingPieceId}
            editPatternNodes={editPatternTool.nodes}
            editPatternSelectedNodes={editPatternTool.selectedNodes}
            editPatternSelectedSegments={editPatternTool.selectedSegments}
            editPatternHoveredNode={editPatternTool.hoveredNode}
            editPatternHoveredSegment={editPatternTool.hoveredSegment}
            editPatternAddPointPreview={editPatternTool.addPointPreview}
            editPatternMarquee={editPatternTool.marquee}
            scissorsTargetPieceId={scissorsTool.targetPieceId}
            scissorsStartPoint={scissorsTool.startPoint}
            scissorsEndPoint={scissorsTool.endPoint}
            scissorsHoveredEdgePoint={scissorsTool.hoveredEdgePoint}
            scissorsPreviewValid={scissorsTool.previewValid}
            mergePieceIdA={mergeTool.pieceIdA}
            mergePieceIdB={mergeTool.pieceIdB}
            mergeSharedEdgeFound={mergeTool.sharedEdgeFound}
            mergeError={mergeTool.error}
            segmentSewingPhase={segmentSewingTool.phase}
            segmentSewingSegmentA={segmentSewingTool.segmentA}
            segmentSewingSegmentB={segmentSewingTool.segmentB}
            segmentSewingPendingSnap={segmentSewingTool.pendingSnap}
            segmentSewingHoveredSnap={segmentSewingTool.hoveredSnap}
            topstitchMode={topstitchTool.mode}
            topstitchHoveredEdge={topstitchTool.hoveredEdge}
            topstitchSegSnapA={topstitchTool.segSnapA}
            topstitchSegHover={topstitchTool.segHover}
            topstitchFreePieceId={topstitchTool.freePieceId}
            topstitchFreePoints={topstitchTool.freePoints}
            topstitchFreeCursor={topstitchTool.freeCursor}
            topstitchHoveredSnapPoint={topstitchTool.hoveredSnapPoint}
            walkSeamStationaryEdge={walkSeamTool.stationaryEdge}
            walkSeamMobileEdge={walkSeamTool.mobileEdge}
            walkSeamWalkDistance={walkSeamTool.walkDistance}
            walkSeamGhostTransform={walkSeamTool.ghostTransform}
            walkSeamGhostOpacity={walkSeamTool.ghostOpacity}
            walkSeamMismatchSamples={walkSeamTool.mismatchSamples}
            walkSeamMetrics={walkSeamTool.metrics}
            walkSeamFormatDistance={walkSeamTool.formatDistance}
            walkSeamHoveredSnapPoint={walkSeamTool.hoveredSnapPoint}
            freeSewingFirstEdge={freeSewingTool.firstEdge}
            freeSewingHoveredEdge={freeSewingTool.hoveredEdge}
            freeSewingMode={freeSewingTool.mode}
            offsetPreviewOutline={offsetTool.previewOutline}
            offsetPreviewPiecePosition={
              editor.selectedPieceIds.length === 1
                ? pieces.find(p => p.id === editor.selectedPieceIds[0])?.position ?? null
                : null
            }
            selectMarquee={selectMarquee}
          />
        </g>

        <HintText
          activeTool={activeTool}
          pieces={pieces}
          penNodesLength={pen.nodes.length}
          nodeEditorIsEditing={nodeEditor.isEditing}
          segmentSewingPhase={segmentSewingTool.phase}
          topstitchMode={topstitchTool.mode}
          walkSeamPhase={walkSeamTool.mobileEdge ? 'walking' : walkSeamTool.stationaryEdge ? 'stationary' : 'idle'}
        />
      </svg>
      <ContextMenu
        menu={ctxMenu}
        onClose={() => setCtxMenu(m => ({ ...m, visible: false }))}
        onRename={(id) => setEditingPieceNameId(id)}
        onConvertSegment={(idx, toCurve) => editPatternTool.convertSegment(idx, toCurve)}
        onZoomToFit={handleZoomToFit}
      />
    </div>
  );
}
