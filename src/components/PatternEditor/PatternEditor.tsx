import { useCallback, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { addPiece, addSeam, addInternalLine, setInternalLine, updatePiece } from '../../store/projectSlice';
import { selectPiece, selectSeam } from '../../store/editorSlice';
import { PatternPiece, Seam, InternalLine } from '../../types/types';
import { usePenTool } from './usePenTool';
import { useRectangleTool } from './useRectangleTool';
import { useLineTool } from './useLineTool';
import { useSeamTool } from './useSeamTool';
import { useNotchTool } from './useNotchTool';
import { useGrainlineTool } from './useGrainlineTool';
import { useNodeEditor } from './useNodeEditor';
import { useMeasureTool } from './useMeasureTool';
import { useEditorInteractions } from './useEditorInteractions';
import GridLayer from './renderers/GridLayer';
import PieceRenderer from './renderers/PieceRenderer';
import SeamRenderer from './renderers/SeamRenderer';
import ToolOverlay from './renderers/ToolOverlay';
import HintText from './renderers/HintText';
import './PatternEditor.css';

export default function PatternEditor() {
  const dispatch = useDispatch();
  const { pieces, seams } = useSelector((s: RootState) => s.project);
  const editor = useSelector((s: RootState) => s.editor);
  const { activeTool, zoom2D, pan2D, showSeamAllowance, showGrainlines, gridSize, units } = editor;
  const selectedPieceIds = editor.selectedPieceIds;
  
  // State for inline piece name editing
  const [editingPieceNameId, setEditingPieceNameId] = useState<string | null>(null);

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

  const seamTool = useSeamTool(zoom2D, pan2D, pieces, handleSeamComplete);

  const handleNotchAdd = useCallback((pieceId: string, notch: InternalLine) => {
    dispatch(addInternalLine({ pieceId, line: notch }));
  }, [dispatch]);

  const notchTool = useNotchTool(zoom2D, pan2D, pieces, handleNotchAdd);

  const handleGrainlineSet = useCallback((pieceId: string, grainline: InternalLine) => {
    dispatch(setInternalLine({ pieceId, line: grainline }));
  }, [dispatch]);

  const grainlineTool = useGrainlineTool(zoom2D, pan2D, pieces, handleGrainlineSet);
  const nodeEditor = useNodeEditor(zoom2D, pan2D);
  const measureTool = useMeasureTool(zoom2D, pan2D);
  
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

  const { svgRef, handleWheel, handleDoubleClick, handleMouseDown, handleMouseMove, handleMouseUp, getCursor } =
    useEditorInteractions(activeTool, zoom2D, pan2D, pieces, {
      pen, rectTool, lineTool, seamTool, notchTool, grainlineTool, measureTool, nodeEditor,
    });

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
        onContextMenu={e => e.preventDefault()}
      >
        <GridLayer zoom2D={zoom2D} pan2D={pan2D} gridSize={gridSize} />

        <g transform={`translate(${pan2D.x}, ${pan2D.y}) scale(${zoom2D})`}>
          <PieceRenderer
            pieces={pieces}
            selectedPieceIds={selectedPieceIds}
            zoom2D={zoom2D}
            showSeamAllowance={showSeamAllowance}
            showGrainlines={showGrainlines}
            editingPieceNameId={editingPieceNameId}
            onPieceNameDoubleClick={handlePieceNameDoubleClick}
            onPieceNameSave={handlePieceNameSave}
            onPieceNameCancel={handlePieceNameCancel}
          />
          <SeamRenderer
            seams={seams}
            pieces={pieces}
            zoom2D={zoom2D}
            selectedSeamId={editor.selectedSeamId}
          />
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
            firstEdge={seamTool.firstEdge}
            hoveredEdge={seamTool.hoveredEdge}
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
            nodeEditorIsEditing={nodeEditor.isEditing}
            nodeEditorEditingPieceId={nodeEditor.editingPieceId}
            nodeEditorNodes={nodeEditor.nodes}
            selectedNode={nodeEditor.selectedNode}
            hoveredNode={nodeEditor.hoveredNode}
          />
        </g>

        <HintText
          activeTool={activeTool}
          pieces={pieces}
          penNodesLength={pen.nodes.length}
          seamFirstEdge={!!seamTool.firstEdge}
          nodeEditorIsEditing={nodeEditor.isEditing}
          measurementsLength={measureTool.measurements.length}
          measureCurrentStart={!!measureTool.currentStart}
        />
      </svg>
    </div>
  );
}
