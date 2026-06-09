import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { addPiece, addSeam, addInternalLine, setInternalLine, updateInternalLine, updatePiece, batchSetSeamAllowance, addReferenceImage, removeReferenceImage, updateReferenceImage } from '../../store/projectSlice';
import { batchUndo } from '../../store/undoMiddleware';
import { unfoldPiece, offsetInternalLine, optimizePieceCurves } from '../../utils/patternOps';
import { selectPiece, selectSeam, selectSaEdges, selectSaVertices, setZoom2D, setPan2D, computeFitView, startCalibration, setCalibrationPoint1, cancelCalibration } from '../../store/editorSlice';
import { selectPieces, selectSeams, selectEditor, selectToolOptions } from '../../store/selectors';
import type { RootState } from '../../store';
import { PatternPiece, Seam, InternalLine, Point2D } from '../../types/types';
import { usePenTool } from './usePenTool';
import { useRectangleTool } from './useRectangleTool';
import { useLineTool } from './useLineTool';
import { useFreeSewingTool } from './useFreeSewingTool';
import { getEdgeEndpoints } from '../../utils/geometry/path';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { useNotchTool } from './useNotchTool';
import { useSeamAllowanceTool } from './useSeamAllowanceTool';
import { useNotchMirrorPreview } from './useNotchMirrorPreview';
import SeamAllowanceSelectionOverlay from './renderers/overlays/SeamAllowanceSelectionOverlay';
import { showUndoToast } from '../../store/copilotUISlice';
import { useTrimTool } from './useTrimTool';
import { newId } from '../../utils/ids';
import { useGrainlineTool } from './useGrainlineTool';
import { useEditCurve } from './useEditCurve';
import { useEditPattern } from './useEditPattern';
import { nearestSegment } from './nodeEditorUtils';
import { useMeasureTool } from './useMeasureTool';
import { useTransformTool } from './useTransformTool';
import { useScissorsTool } from './useScissorsTool';
import { useSlashAndSpreadTool } from './useSlashAndSpreadTool';
import { useMergeTool } from './useMergeTool';
import { useSegmentSewingTool } from './useSegmentSewingTool';
import { useTopstitchTool } from './useTopstitchTool';
import { useWalkSeamTool } from './useWalkSeamTool';
import { useOffsetTool } from './useOffsetTool';
import { useExtendTrimTool } from './useExtendTrimTool';
import { usePolyPenTool } from './usePolyPenTool';
import { usePleatTool } from '../../hooks/usePleatTool';
import { useEditorInteractions } from './useEditorInteractions';
import { useElasticTool } from '../../hooks/useElasticTool';
import PolyPenToolOverlay from './renderers/overlays/PolyPenToolOverlay';
import GridLayer from './renderers/GridLayer';
import RulerLayer from './renderers/RulerLayer';
import PieceRenderer from './renderers/PieceRenderer';
import SeamRenderer from './renderers/SeamRenderer';
import ElasticRenderer from './renderers/ElasticRenderer';
import TrimRenderer from './renderers/TrimRenderer';
import ToolOverlay from './renderers/ToolOverlay';
import HintText from './renderers/HintText';
import EmptyState2D, { shouldShowEmptyState } from './EmptyState2D';
import ConstructionOverlay from './renderers/ConstructionOverlay';
import ReferenceImageLayer from './renderers/ReferenceImageLayer';
import CalibrationOverlay from './renderers/overlays/CalibrationOverlay';
import CalibrationModal from './CalibrationModal';
import NotchPrecisionModal from './NotchPrecisionModal';
import { DEFAULT_NOTCH_OPTIONS } from '../../utils/notches';
import ReferenceImageSettings from './ReferenceImageSettings';
import { computePixelsPerMm } from '../../utils/geometry/calibration';
import { importReferenceImage } from '../../utils/import/imageImporter';
import { storeImageBlob, loadImageBlob } from '../../utils/import/referenceImageStore';
import ContextMenu, { type ContextMenuState } from './ContextMenu';
import './PatternEditor.css';

// Module-level map: imageId → blob URL (outside Redux for non-serializable data)
const objectUrlMap = new Map<string, string>();

interface PatternEditorProps {
  /** Opens the DXF file picker; wired by AppShell to its hidden <input>. */
  onImportDXF?: () => void;
  /** Opens a named ContextPanel (e.g. 'Properties'); wired by AppShell. */
  onOpenPanel?: (name: string) => void;
}

export default function PatternEditor({ onImportDXF, onOpenPanel }: PatternEditorProps) {
  const dispatch = useDispatch();
  const pieces = useSelector(selectPieces);
  const seams = useSelector(selectSeams);
  const editor = useSelector(selectEditor);
  const { activeTool, zoom2D, pan2D, showSeamAllowance, showGrainlines, showPieceNames, showSewingLines, showLineLengths, renderMode2D, gridSize, units, fitViewToken } = editor;
  const selectedPieceIds = editor.selectedPieceIds;
  const toolOptions = useSelector(selectToolOptions);
  const groups = useSelector((s: RootState) => s.project.groups);
  const referenceImages = useSelector((s: RootState) => s.project.referenceImages);
  const showReferenceImages = useSelector((s: RootState) => s.editor.showReferenceImages);
  const selectedReferenceImageId = useSelector((s: RootState) => s.editor.selectedReferenceImageId);
  const calibrationMode = useSelector((s: RootState) => s.editor.calibrationMode);

  // Hydrate objectUrlMap from IndexedDB for images loaded from autosave / project file
  useEffect(() => {
    for (const img of referenceImages) {
      if (!objectUrlMap.has(img.id)) {
        loadImageBlob(img.id).then(blob => {
          if (blob && !objectUrlMap.has(img.id)) {
            objectUrlMap.set(img.id, URL.createObjectURL(blob));
          }
        }).catch(() => {});
      }
    }
  }, [referenceImages]);

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
  
  // Calibration modal local state
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [calibrationPixelDist, setCalibrationPixelDist] = useState(0);
  const [calibrationSecondPoint, setCalibrationSecondPoint] = useState<{ x: number; y: number } | null>(null);

  // Cursor position for CalibrationOverlay (in SVG/pattern space, tracked via ref to avoid re-renders)
  const cursorPositionRef = useRef<{ x: number; y: number } | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);

  // State for inline piece name editing
  const [editingPieceNameId, setEditingPieceNameId] = useState<string | null>(null);

  // Viewport size (px) for the screen-space ruler layer.
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({
    visible: false, x: 0, y: 0, pieceId: null,
  });

  const handlePieceComplete = useCallback((piece: Omit<PatternPiece, 'id' | 'createdAt' | 'updatedAt'>) => {
    const fullPiece: PatternPiece = {
      ...piece,
      id: newId(),
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
    const fullSeam: Seam = { ...seam, id: newId() };
    dispatch(addSeam(fullSeam));
    dispatch(selectSeam(fullSeam.id));
  }, [dispatch]);

  const seamTool = useFreeSewingTool(zoom2D, pan2D, pieces, handleSeamComplete, 'free');

  const handleNotchAdd = useCallback((pieceId: string, notch: InternalLine) => {
    dispatch(addInternalLine({ pieceId, line: notch }));
  }, [dispatch]);

  // Precision modal confirm (notch-precision F3): re-position the committed
  // notch at the exact distance/depth — path + anchor + options move together.
  const handleNotchUpdate = useCallback((
    pieceId: string,
    lineId: string,
    path: InternalLine['path'],
    notchAnchor: NonNullable<InternalLine['notchAnchor']>,
    options: NonNullable<InternalLine['notchOptions']>,
  ) => {
    dispatch(updateInternalLine({ pieceId, lineId, path, notchAnchor, notchOptions: options }));
  }, [dispatch]);

  const notchTool = useNotchTool(zoom2D, pan2D, pieces, handleNotchAdd, undefined, handleNotchUpdate);

  // F3: ghost preview of the corresponding (mirror) notch. Derived from the
  // selected notch + the shared sense toggle; the helper returns the point in
  // PAIRED-piece local coords, so add the paired piece position for world.
  const notchMirror = useNotchMirrorPreview();
  const notchMirrorGhost = useMemo(() => {
    if (!notchMirror) return null;
    const mapped = notchMirror.mapped;
    if (!mapped.ok) return null;
    const paired = pieces.find(p => p.id === mapped.pairedPieceId);
    if (!paired) return null;
    const ox = paired.position?.x ?? 0;
    const oy = paired.position?.y ?? 0;
    return {
      pointWorld: { x: mapped.point.x + ox, y: mapped.point.y + oy },
      normal: mapped.normal,
      options: notchMirror.notch.notchOptions,
    };
  }, [notchMirror, pieces]);

  // Explicit apply-SA command (pieces are born net; this puts allowance back
  // on purpose). Width comes from editor.defaultSeamAllowanceWidth inside the
  // hook; per-piece scalar is the ratified model — per-edge is future work.
  // Overwriting a deliberate custom width gets an undo toast (review finding:
  // an accidental click in SA mode must not silently reset María's 8mm to 10).
  const handleApplySeamAllowance = useCallback((pieceId: string, widthMm: number, prevWidthMm: number) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;
    dispatch(updatePiece({ ...piece, seamAllowance: widthMm, updatedAt: Date.now() }));
    if (prevWidthMm > 0 && prevWidthMm !== widthMm) {
      dispatch(showUndoToast(
        `Seam allowance ${prevWidthMm}mm → ${widthMm}mm`,
        updatePiece({ ...piece, seamAllowance: prevWidthMm, updatedAt: Date.now() }),
      ));
    }
  }, [pieces, dispatch]);
  // Drag-to-all: apply the editor default to every touched piece in ONE batched
  // action. batchUndo wraps the single bulk dispatch so the undo middleware
  // clones the tree once (not per piece) and Ctrl+Z reverts the whole gesture.
  const handleApplySeamAllowanceAll = useCallback((pieceIds: string[], widthMm: number) => {
    if (pieceIds.length === 0) return;
    batchUndo(dispatch, `Apply ${widthMm}mm seam allowance to ${pieceIds.length} piece(s)`, () => {
      dispatch(batchSetSeamAllowance({ pieceIds, width: widthMm }));
    });
  }, [dispatch]);
  const seamAllowanceTool = useSeamAllowanceTool(pieces, zoom2D, pan2D, {
    onApply: handleApplySeamAllowance,
    onApplyAll: handleApplySeamAllowanceAll,
    // Selecting an edge/vertex opens the Properties panel — its docked home for
    // editing the width / corner type (CLO3D's persistent Property Editor).
    onSelectEdge: (pieceId, edgeId, additive) => { dispatch(selectSaEdges({ items: [{ pieceId, edgeId }], additive })); onOpenPanel?.('Properties'); },
    onSelectVertex: (pieceId, vertexIndex) => { dispatch(selectSaVertices({ pieceId, vertexIndex })); onOpenPanel?.('Properties'); },
  });

  const trimTool = useTrimTool(zoom2D, pan2D, pieces, dispatch);

  const handleGrainlineSet = useCallback((pieceId: string, grainline: InternalLine) => {
    dispatch(setInternalLine({ pieceId, line: grainline }));
  }, [dispatch]);

  const grainlineTool = useGrainlineTool(zoom2D, pan2D, pieces, handleGrainlineSet);
  const nodeEditor = useEditCurve(zoom2D, pan2D);
  const editPatternTool = useEditPattern(zoom2D, pan2D);
  const scissorsTool = useScissorsTool(zoom2D, pan2D);
  const slashAndSpreadTool = useSlashAndSpreadTool(zoom2D, pan2D);
  const mergeTool = useMergeTool(zoom2D, pan2D);
  const measureTool = useMeasureTool(zoom2D, pan2D);
  const segmentSewingTool = useSegmentSewingTool(zoom2D, pan2D, pieces);
  const topstitchTool = useTopstitchTool(zoom2D, pan2D, pieces);
  const walkSeamTool = useWalkSeamTool(zoom2D, pan2D);
  const offsetTool = useOffsetTool(zoom2D, pan2D);
  const extendTrimTool = useExtendTrimTool(zoom2D, pan2D);
  const freeSewingMode = (toolOptions?.freesewing?.sewingType as 'free' | 'point') ?? 'free';
  const freeSewingTool = useFreeSewingTool(zoom2D, pan2D, pieces, handleSeamComplete, freeSewingMode);

  // PolyPen tool options
  const polyPenMode = (toolOptions?.polyPen?.mode as 'piece' | 'internalLine') ?? 'piece';
  const polyPenLineType = (toolOptions?.polyPen?.lineType as import('../../types/types').InternalLineType) ?? 'fold';

  const handlePolyPenCompleteInternalLine = useCallback((path: import('../../types/types').PathCommand[], lineType: import('../../types/types').InternalLineType) => {
    // Attach to the first selected piece, or the last piece if none selected
    const targetPieceId = selectedPieceIds[0] ?? pieces[pieces.length - 1]?.id;
    if (!targetPieceId) return;
    const line: InternalLine = {
      id: newId(),
      type: lineType,
      path,
    };
    dispatch(addInternalLine({ pieceId: targetPieceId, line }));
  }, [selectedPieceIds, pieces, dispatch]);

  const polyPenTool = usePolyPenTool(zoom2D, pan2D, handlePieceComplete, handlePolyPenCompleteInternalLine, polyPenMode, polyPenLineType);
  const pleatTool = usePleatTool(zoom2D, pan2D);
  const elasticTool = useElasticTool(zoom2D, pan2D, pieces);

  // Context menu handlers for patternOps
  const handleUnfold = useCallback((pieceId: string, foldLineId: string, outlineOnly?: boolean) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;
    try {
      const result = unfoldPiece(piece, foldLineId, { outlineOnly });
      dispatch(updatePiece({ ...result, id: pieceId, updatedAt: Date.now() }));
    } catch (err) {
      console.warn('[PatternEditor] unfoldPiece failed:', err);
    }
  }, [pieces, dispatch]);

  const handleOffsetInternalLine = useCallback((pieceId: string, lineId: string) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;
    try {
      const result = offsetInternalLine(piece, lineId, { count: 1, distance: 10 });
      dispatch(updatePiece({ ...result, id: pieceId, updatedAt: Date.now() }));
    } catch (err) {
      console.warn('[PatternEditor] offsetInternalLine failed:', err);
    }
  }, [pieces, dispatch]);

  const handleOptimizeCurves = useCallback((pieceId: string, lineId?: string) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;
    try {
      const result = optimizePieceCurves(piece, lineId ? { target: { internalLineId: lineId } } : { target: 'all' });
      dispatch(updatePiece({ ...result, id: pieceId, updatedAt: Date.now() }));
    } catch (err) {
      console.warn('[PatternEditor] optimizePieceCurves failed:', err);
    }
  }, [pieces, dispatch]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Determine which piece (if any) is under the cursor
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const { x: canvasX, y: canvasY } = screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);

    // Per-edge width and corner type are edited via left-click selection + the
    // Properties panel (Direction A), so right-click is always the general piece
    // menu — one gesture, one meaning, no proximity guessing.

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
    const SEAM_THRESHOLD = screenToPatternLength(8, zoom2D);
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

    // Hit-test internal lines on the hit piece
    let hitInternalLineId: string | null = null;
    let hitInternalLineType: string | null = null;
    if (hitPiece && !hitSeamId) {
      const IL_THRESHOLD = screenToPatternLength(6, zoom2D);
      let nearestDist = Infinity;
      for (const line of hitPiece.internals) {
        const localX = canvasX - (hitPiece.position?.x ?? 0);
        const localY = canvasY - (hitPiece.position?.y ?? 0);
        let prevX = 0, prevY = 0;
        for (const cmd of line.path) {
          if (cmd.type === 'M') {
            prevX = cmd.values[0]; prevY = cmd.values[1];
          } else if (cmd.type === 'L') {
            const dx = cmd.values[0] - prevX, dy = cmd.values[1] - prevY;
            const lenSq = dx * dx + dy * dy;
            let dist = Infinity;
            if (lenSq > 0) {
              let t = ((localX - prevX) * dx + (localY - prevY) * dy) / lenSq;
              t = Math.max(0, Math.min(1, t));
              dist = Math.hypot(localX - (prevX + t * dx), localY - (prevY + t * dy));
            } else {
              dist = Math.hypot(localX - prevX, localY - prevY);
            }
            if (dist < IL_THRESHOLD && dist < nearestDist) {
              nearestDist = dist;
              hitInternalLineId = line.id;
              hitInternalLineType = line.type;
            }
            prevX = cmd.values[0]; prevY = cmd.values[1];
          } else if (cmd.type === 'C') {
            // Approximate with endpoint distance for context menu purposes
            const dist = Math.hypot(localX - cmd.values[4], localY - cmd.values[5]);
            if (dist < IL_THRESHOLD && dist < nearestDist) {
              nearestDist = dist;
              hitInternalLineId = line.id;
              hitInternalLineType = line.type;
            }
            prevX = cmd.values[4]; prevY = cmd.values[5];
          }
        }
      }
    }

    let segmentIndex: number | undefined;
    let segmentIsCurve: boolean | undefined;
    if (editPatternTool.isEditing && editPatternTool.editingPieceId && hitPiece?.id === editPatternTool.editingPieceId) {
      const localPt = { x: canvasX - (hitPiece.position?.x ?? 0), y: canvasY - (hitPiece.position?.y ?? 0) };
      const segHit = nearestSegment(localPt, hitPiece.outline);
      if (segHit && segHit.distance <= screenToPatternLength(8, zoom2D)) {
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
      internalLineId: hitInternalLineId,
      internalLineType: hitInternalLineType,
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

  const { svgRef, handleWheel, handleDoubleClick, handleMouseDown: editorHandleMouseDown, handleMouseMove: editorHandleMouseMove, handleMouseUp, getCursor, selectMarquee } =
    useEditorInteractions(activeTool, zoom2D, pan2D, pieces, {
      pen, rectTool, lineTool, seamTool, notchTool, seamAllowanceTool, trimTool, grainlineTool, measureTool, nodeEditor, transformTool, editPattern: editPatternTool, scissorsTool, slashAndSpreadTool, mergeTool, segmentSewingTool, topstitchTool, walkSeamTool, freeSewingTool, offsetTool, extendTrimTool, polyPenTool, pleatTool, elasticTool,
    });

  // Track SVG viewport size for the ruler layer (screen-space ticks/labels).
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r) setSvgSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [svgRef]);

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

  // Auto fit-to-content: an import bumps fitViewToken; frame the pattern once
  // the viewport size and pieces are both available. The early return leaves
  // lastFitTokenRef untouched until a real fit happens, so a token that arrives
  // before the SVG is measured still fits on the next dependency change. The
  // token guard ensures we fit once per request — never on subsequent edits.
  const lastFitTokenRef = useRef(0);
  useEffect(() => {
    if (fitViewToken === lastFitTokenRef.current) return;
    if (pieces.length === 0 || svgSize.width === 0) return; // not ready — retry on next render
    lastFitTokenRef.current = fitViewToken;
    handleZoomToFit();
  }, [fitViewToken, pieces.length, svgSize.width, svgSize.height, handleZoomToFit]);

  // ─── Reference image import ───────────────────────────────────────────────
  const handleImageImport = useCallback(async (file: File) => {
    const result = await importReferenceImage(file);
    const id = newId();
    // Store blob URL in module-level map for rendering
    objectUrlMap.set(id, result.objectUrl);
    // Persist blob to IndexedDB
    await storeImageBlob(id, result.imageBlob);
    // Add to Redux state
    dispatch(addReferenceImage({
      id,
      filename: result.filename,
      width: result.width,
      height: result.height,
      position: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
      opacity: 0.5,
      locked: false,
      visible: true,
      pixelsPerMm: null,
    }));
  }, [dispatch]);

  // ─── Reference image action callbacks ────────────────────────────────────
  const handleCalibrate = useCallback((imageId: string) => {
    dispatch(startCalibration({ imageId }));
  }, [dispatch]);

  const handleToggleVisible = useCallback((imageId: string) => {
    const img = referenceImages.find(i => i.id === imageId);
    if (img) dispatch(updateReferenceImage({ id: imageId, visible: !img.visible }));
  }, [referenceImages, dispatch]);

  const handleToggleLocked = useCallback((imageId: string) => {
    const img = referenceImages.find(i => i.id === imageId);
    if (img) dispatch(updateReferenceImage({ id: imageId, locked: !img.locked }));
  }, [referenceImages, dispatch]);

  const handleOpacityChange = useCallback((imageId: string, opacity: number) => {
    dispatch(updateReferenceImage({ id: imageId, opacity }));
  }, [dispatch]);

  const handleRemoveImage = useCallback((imageId: string) => {
    // Do NOT revoke objectUrl or delete from map here — undo may restore the image.
    // Cleanup is deferred to garbageCollect() on NEW_PROJECT / loadProject.
    dispatch(removeReferenceImage(imageId));
  }, [dispatch]);

  // ─── Calibration modal confirm ────────────────────────────────────────────
  const handleCalibrationConfirm = useCallback((realWorldMm: number) => {
    if (!calibrationMode || !calibrationMode.point1 || !calibrationSecondPoint) return;
    const pxPerMm = computePixelsPerMm(calibrationMode.point1, calibrationSecondPoint, realWorldMm);
    dispatch(updateReferenceImage({ id: calibrationMode.imageId, pixelsPerMm: pxPerMm }));
    dispatch(cancelCalibration());
    setShowCalibrationModal(false);
    setCalibrationSecondPoint(null);
  }, [calibrationMode, calibrationSecondPoint, dispatch]);

  const handleCalibrationCancel = useCallback(() => {
    dispatch(cancelCalibration());
    setShowCalibrationModal(false);
    setCalibrationSecondPoint(null);
  }, [dispatch]);

  // ─── Wrapped mouse handlers with calibration intercept ───────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (calibrationMode) {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const pt = screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);

      if (!calibrationMode.point1) {
        // First click: set point1
        dispatch(setCalibrationPoint1(pt));
      } else {
        // Second click: compute pixel distance, show modal
        const dx = pt.x - calibrationMode.point1.x;
        const dy = pt.y - calibrationMode.point1.y;
        const pixelDist = Math.sqrt(dx * dx + dy * dy);
        setCalibrationPixelDist(pixelDist);
        setCalibrationSecondPoint(pt);
        setShowCalibrationModal(true);
      }
      return; // don't pass to tool handlers
    }
    editorHandleMouseDown(e);
  }, [calibrationMode, pan2D, zoom2D, dispatch, svgRef, editorHandleMouseDown]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Track cursor position in pattern space for CalibrationOverlay
    const svgEl = svgRef.current;
    if (svgEl) {
      const rect = svgEl.getBoundingClientRect();
      const pos = screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
      cursorPositionRef.current = pos;
      if (calibrationMode) {
        setCursorPosition(pos);
      }
    }
    editorHandleMouseMove(e);
  }, [pan2D, zoom2D, svgRef, calibrationMode, editorHandleMouseMove]);

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
          <ReferenceImageLayer
            referenceImages={referenceImages}
            showReferenceImages={showReferenceImages}
            selectedReferenceImageId={selectedReferenceImageId}
            objectUrlMap={objectUrlMap}
          />
          <PieceRenderer
            pieces={pieces}
            selectedPieceIds={selectedPieceIds}
            zoom2D={zoom2D}
            showSeamAllowance={showSeamAllowance}
            showGrainlines={showGrainlines}
            showPieceNames={showPieceNames}
            renderMode2D={renderMode2D}
            showLineLengths={showLineLengths}
            units={units}
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
          <ElasticRenderer zoom2D={zoom2D} />
          <TrimRenderer zoom2D={zoom2D} />
          {activeTool === 'seamAllowance' && (
            <SeamAllowanceSelectionOverlay
              saSelection={editor.saSelection}
              pieces={pieces}
              zoom={zoom2D}
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
            notchRefineMarker={notchTool.refining ? { refWorld: notchTool.refining.refWorld, notchWorld: notchTool.refining.notchWorld, previewWorld: notchTool.refining.previewWorld } : null}
            notchMirrorGhost={notchMirrorGhost}
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
            ssPhase={slashAndSpreadTool.phase}
            ssTargetPieceId={slashAndSpreadTool.targetPieceId}
            ssStartPoint={slashAndSpreadTool.startPoint}
            ssEndPoint={slashAndSpreadTool.endPoint}
            ssHalfA={slashAndSpreadTool.halfA}
            ssHalfB={slashAndSpreadTool.halfB}
            ssSelectedHalf={slashAndSpreadTool.selectedHalf}
            ssHoveredHalf={slashAndSpreadTool.hoveredHalf}
            ssPivotPoint={slashAndSpreadTool.pivotPoint}
            ssSpreadAmount={slashAndSpreadTool.spreadAmount}
            ssPreviewPiece={slashAndSpreadTool.previewPiece}
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
            trimHoveredEdge={trimTool.hoveredEdge}
            selectMarquee={selectMarquee}
          />
          {activeTool === 'polyPen' && (
            <PolyPenToolOverlay
              nodes={polyPenTool.nodes}
              previewPoint={polyPenTool.previewPoint}
              isDragging={polyPenTool.isDragging}
              dragHandle={polyPenTool.dragHandle}
              zoom2D={zoom2D}
            />
          )}
          {calibrationMode && (
            <CalibrationOverlay
              zoom2D={zoom2D}
              calibrationMode={calibrationMode}
              cursorPosition={cursorPosition}
            />
          )}
        </g>

        <HintText
          activeTool={activeTool}
          pieces={pieces}
          penNodesLength={pen.nodes.length}
          nodeEditorIsEditing={nodeEditor.isEditing}
          segmentSewingPhase={segmentSewingTool.phase}
          topstitchMode={topstitchTool.mode}
          walkSeamPhase={walkSeamTool.mobileEdge ? 'walking' : walkSeamTool.stationaryEdge ? 'stationary' : 'idle'}
          seamHasFirstEdge={activeTool === 'seam' ? !!seamTool.firstEdge : !!freeSewingTool.firstEdge}
          saDefaultWidthMm={seamAllowanceTool.widthMm}
        />

        <RulerLayer
          zoom2D={zoom2D}
          pan2D={pan2D}
          gridSize={gridSize}
          units={units}
          width={svgSize.width}
          height={svgSize.height}
        />
      </svg>
      {shouldShowEmptyState(pieces.length, activeTool) && (
        <EmptyState2D onImportDXF={onImportDXF} />
      )}
      <ContextMenu
        menu={ctxMenu}
        onClose={() => setCtxMenu(m => ({ ...m, visible: false }))}
        onRename={(id) => setEditingPieceNameId(id)}
        onConvertSegment={(idx, toCurve) => editPatternTool.convertSegment(idx, toCurve)}
        onZoomToFit={handleZoomToFit}
        onUnfold={handleUnfold}
        onOffsetInternalLine={handleOffsetInternalLine}
        onOptimizeCurves={handleOptimizeCurves}
        onOpenProperties={(pieceId) => {
          dispatch(selectPiece(pieceId));
          onOpenPanel?.('Properties');
        }}
      />
      {showCalibrationModal && (
        <CalibrationModal
          pixelDistance={calibrationPixelDist}
          onConfirm={handleCalibrationConfirm}
          onCancel={handleCalibrationCancel}
        />
      )}
      {notchTool.refining?.notch.notchAnchor && (
        <NotchPrecisionModal
          initialDistanceMm={notchTool.refining.notch.notchAnchor.distanceMm}
          initialDepthMm={notchTool.refining.notch.notchOptions?.length ?? DEFAULT_NOTCH_OPTIONS.length}
          maxDistanceMm={notchTool.refining.maxDistanceMm}
          onPreview={notchTool.previewRefine}
          onConfirm={notchTool.confirmRefine}
          onCancel={notchTool.cancelRefine}
        />
      )}
      <ReferenceImageSettings
        referenceImages={referenceImages}
        onImport={handleImageImport}
        onCalibrate={handleCalibrate}
        onToggleVisible={handleToggleVisible}
        onToggleLocked={handleToggleLocked}
        onOpacityChange={handleOpacityChange}
        onRemove={handleRemoveImage}
      />
    </div>
  );
}
