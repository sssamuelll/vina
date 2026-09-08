import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { addPiece, addSeam, addInternalLine, setInternalLine, updateInternalLine, updatePiece, batchSetSeamAllowance, addEdgeSeamAllowanceSpan, updateEdgeSeamAllowanceSpan, setEdgesSeamAllowance, updateReferenceImage } from '../../store/projectSlice';
import { batchUndo, beginUndoBatch, endUndoBatch, withUndoBatchToken, isUndoBatchTokenActive, type UndoBatchToken } from '../../store/undoMiddleware';
import { activate2DTool, SEWING_TOOL_IDS } from '../../store/toolActivation';
import { unfoldPiece, offsetInternalLine, optimizePieceCurves } from '../../utils/patternOps';
import { selectPiece, selectSeam, selectSaEdges, selectSaVertices, selectInternalLine, setZoom2D, setPan2D, computeFitView, setCalibrationPoint1, cancelCalibration } from '../../store/editorSlice';
import { selectPieces, selectSeams, selectEditor, selectToolOptions } from '../../store/selectors';
import type { RootState } from '../../store';
import { PatternPiece, Seam, InternalLine, InternalLineType, PathCommand } from '../../types/types';
import { usePenTool } from './usePenTool';
import { useRectangleTool } from './useRectangleTool';
import { useCircleTool } from './useCircleTool';
import { useTriangleTool } from './useTriangleTool';
import { CotasLayer, type CotasLayerHandle } from './cotas/CotasLayer';
import CotaLines from './cotas/CotaLines';
import { cotasDelSujeto, faltaSujeto } from './cotas/sujeto';
import { puntoUnicoSeleccionado } from './cotas/nodo';
import { cajasDeAsas } from './cotas/cotasGeometry';
import { resizePieceTo } from './pieceResize';
import ToolStrip2D from './ToolStrip2D';
import { suscribirNoPasoNada } from './noPasoNada';
import FilaDeCapas from './FilaDeCapas';
import type { Cota } from './cotas/cotas';
import { useFreeSewingTool } from './useFreeSewingTool';
import { getEdgeEndpoints } from '../../utils/geometry/path';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { resolveSeamAllowanceClick } from '../../utils/seam/edgeHitTest';
import { useNotchTool } from './useNotchTool';
import { usePointTool } from './usePointTool';
import { useSeamAllowanceTool } from './useSeamAllowanceTool';
import { useNotchMirrorPreview } from './useNotchMirrorPreview';
import SeamAllowanceSelectionOverlay from './renderers/overlays/SeamAllowanceSelectionOverlay';
import { showUndoToast, showInfoToast } from '../../store/copilotUISlice';
import { useTrimTool } from './useTrimTool';
import { newId } from '../../utils/ids';
import { useGrainlineTool } from './useGrainlineTool';
import { useEditCurve } from './useEditCurve';
import { useEditPattern } from './useEditPattern';
import { patternToPieceLocal } from './pieceTransform';
import { hitTestPieceBBox } from '../../utils/geometry/hitTest';
import { hitTestNode, nearestSegment } from './nodeEditorUtils';
import { useMeasureTool } from './useMeasureTool';
import { useTransformTool, type TransformUpdate } from './useTransformTool';
import { useScissorsTool } from './useScissorsTool';
import { useSlashAndSpreadTool } from './useSlashAndSpreadTool';
import { useMergeTool } from './useMergeTool';
import { useSeamEditTool } from './useSeamEditTool';
import { useTopstitchTool } from './useTopstitchTool';
import { useWalkSeamTool } from './useWalkSeamTool';
import { useOffsetTool } from './useOffsetTool';
import { useExtendTrimTool } from './useExtendTrimTool';
import { usePolyPenTool } from './usePolyPenTool';
import { toPieceLocalPath } from './internalShapePath';
import { usePleatTool } from '../../hooks/usePleatTool';
import { useEditorInteractions } from './useEditorInteractions';
import { useElasticTool } from '../../hooks/useElasticTool';
import { EDGE_HIT_PX } from './gestureConstants';
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
import { notchPlacedMessage } from './notchPrecisionCopy';
import { DEFAULT_NOTCH_OPTIONS } from '../../utils/notches';
import { computePixelsPerMm } from '../../utils/geometry/calibration';
import { useReferenceImages } from './useReferenceImages';
import ContextMenu, { type ContextMenuState } from './ContextMenu';
import { pushJournal } from '../../utils/telemetry/journal';
import FloatingActionBar from './FloatingActionBar';
import { resolveTargetKind, type CurationCtx } from './actionCuration';
import { selectWorkflowStage } from '../../store/selectors';
import './PatternEditor.css';

/** Faja del dock 2D izquierdo, medida en navegador (no calculada): `.dock--left`
 *  da `x=14, ancho=54` — el borde derecho cae en 68. Los 54 salen de
 *  `Dock.css`: 7px de padding + 38px de icono + 7px de padding + 1px de
 *  `--surface-chrome-border` a cada lado (2px). Exportada para que el test
 *  de `handleZoomToFit` use el mismo valor en vez de repetirlo. */
export const DOCK_WIDTH_PX = 68;

/** Lo que dura en la tira el desenlace de un gesto que no pasó nada (#1117):
 *  suficiente para leerlo, corto para no quedarse contestando el gesto de antes. */
const DESENLACE_MS = 4000;

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
  const { activeTool, zoom2D, pan2D, showSeamAllowance, showGrainlines, showNotches, showPieceNames, showSewingLines, showLineLengths, renderMode2D, gridSize, units, fitViewToken } = editor;
  const selectedPieceIds = editor.selectedPieceIds;
  const toolOptions = useSelector(selectToolOptions);
  const groups = useSelector((s: RootState) => s.project.groups);
  // Sube aquí desde su sitio de más abajo: el hook de margen lo necesita para
  // no escribirle a una pieza bloqueada (#1136), y se declara a 282.
  const layerLocked = useSelector((s: RootState) => s.project.layerLocked);
  const referenceImages = useSelector((s: RootState) => s.project.referenceImages);
  const showReferenceImages = useSelector((s: RootState) => s.editor.showReferenceImages);
  const selectedReferenceImageId = useSelector((s: RootState) => s.editor.selectedReferenceImageId);
  const calibrationMode = useSelector((s: RootState) => s.editor.calibrationMode);
  const stage = useSelector(selectWorkflowStage);
  const clipboard = useSelector((s: RootState) => s.editor.clipboard);

  // El mapa de blob URLs y los seis gestos del panel viven en el hook desde que
  // el panel se mudó a `ContextPanel` (2026-09-05): aquí solo se lee el mapa
  // para pintar. Ver useReferenceImages.ts.
  const { objectUrlMap } = useReferenceImages();

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

  // Contexto de Surface A (barra flotante). Solo pieza/multiPieza (BAR_ENABLED_KINDS);
  // la barra decide el montaje. `properties` de la barra necesita onOpenProperties;
  // el resto son dispatches puros.
  const barCtx: CurationCtx | null = useMemo(() => {
    if (selectedPieceIds.length === 0) return null;
    const firstId = selectedPieceIds[0];
    const piece = pieces.find(p => p.id === firstId) ?? null;
    const targetKind = resolveTargetKind({
      seamId: null,
      pieceId: firstId,
      pieceCount: selectedPieceIds.length,
      internalLineType: null,
      altitude: 'body',
    });
    return {
      dispatch, targetKind, stage, altitude: 'body',
      pieceId: firstId, piece, selectedPieceIds,
      seamId: null, seam: null,
      internalLineId: null, internalLineType: null, internalLine: null,
      segmentIndex: undefined, segmentIsCurve: undefined,
      clipboard, groups, pieces,
      cb: { onOpenProperties: (id: string) => { dispatch(selectPiece(id)); onOpenPanel?.('Properties'); } },
      onClose: () => {},
    };
  }, [selectedPieceIds, pieces, dispatch, stage, clipboard, groups, onOpenPanel]);

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
    return fullPiece.id;
  }, [dispatch]);

  // Solo lo que se dibuja puede prometer una lectura o recibir el clic. El
  // orden ascendente es el de PieceRenderer; el hook lo invierte una sola vez.
  const hiddenLayerIds = useSelector((s: RootState) => s.simulation.hiddenLayerIds);
  const drawablePieces = useMemo(
    () => [...pieces]
      .filter(p => !hiddenLayerIds.includes(p.layer ?? 1))
      .sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0)),
    [pieces, hiddenLayerIds],
  );

  const pen = usePenTool(zoom2D, pan2D, handlePieceComplete, drawablePieces);
  const rectTool = useRectangleTool(zoom2D, pan2D, handlePieceComplete);
  // El círculo nace de la misma puerta que la pluma y el rectángulo (#1111).
  const circleTool = useCircleTool(zoom2D, pan2D, handlePieceComplete);
  // El triángulo, el otro hermano que pidió el mismo issue (#1111, tanda 8).
  const triangleTool = useTriangleTool(zoom2D, pan2D, handlePieceComplete);

  const handleSeamComplete = useCallback((seam: Omit<Seam, 'id'>) => {
    const fullSeam: Seam = { ...seam, id: newId() };
    dispatch(addSeam(fullSeam));
    dispatch(selectSeam(fullSeam.id));
  }, [dispatch]);

  const seamTool = useFreeSewingTool(zoom2D, pan2D, pieces, handleSeamComplete);

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
    dispatch(showInfoToast(notchPlacedMessage(notchAnchor.distanceMm)));
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
  // hook; el clic al cuerpo conserva el escalar ratificado de la pieza.
  // Overwriting a deliberate custom width gets an undo toast (review finding:
  // an accidental click in SA mode must not silently reset María's 8mm to 10).
  const handleApplySeamAllowance = useCallback((pieceId: string, widthMm: number, prevWidthMm: number) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;
    dispatch(updatePiece({ ...piece, seamAllowance: widthMm, updatedAt: Date.now() }));
    if (prevWidthMm > 0 && prevWidthMm !== widthMm) {
      dispatch(showUndoToast(
        `Margen de costura ${prevWidthMm}mm → ${widthMm}mm`,
        updatePiece({ ...piece, seamAllowance: prevWidthMm, updatedAt: Date.now() }),
      ));
    }
  }, [pieces, dispatch]);
  // Drag-to-all: apply the editor default to every touched piece in ONE batched
  // action. batchUndo wraps the single bulk dispatch so the undo middleware
  // clones the tree once (not per piece) and Ctrl+Z reverts the whole gesture.
  const handleApplySeamAllowanceAll = useCallback((pieceIds: string[], widthMm: number) => {
    if (pieceIds.length === 0) return;
    batchUndo(dispatch, `Aplicar margen de costura de ${widthMm} mm a ${pieceIds.length} ${pieceIds.length === 1 ? 'pieza' : 'piezas'}`, () => {
      dispatch(batchSetSeamAllowance({ pieceIds, width: widthMm }));
    });
  }, [dispatch]);
  const seamAllowanceTool = useSeamAllowanceTool(drawablePieces, zoom2D, pan2D, {
    onApply: handleApplySeamAllowance,
    onApplyAll: handleApplySeamAllowanceAll,
    onApplySpan: (pieceId, edgeId, range, width) => {
      dispatch(addEdgeSeamAllowanceSpan({
        pieceId,
        edgeId,
        span: { tStart: range[0], tEnd: range[1], width },
      }));
    },
    // El borde ya NO abre el panel de Propiedades por su cuenta (spec 2026-09-02
    // § 6): su número se escribe en el chip sobre el lienzo, y abrir el panel
    // empujaba el lienzo y dejaba el chip recién abierto bajo la tira (medido
    // en las capturas de la entrega 33). Si el panel está abierto, se
    // actualiza igual; "Usar el de la pieza" y los tramos siguen viviendo ahí.
    // La esquina sí lo abre: su tipo no tiene otra puerta.
    onSelectEdge: (pieceId, edgeId, additive) => { dispatch(selectSaEdges({ items: [{ pieceId, edgeId }], additive })); },
    onSelectVertex: (pieceId, vertexIndex) => { dispatch(selectSaVertices({ pieceId, vertexIndex })); onOpenPanel?.('Properties'); },
  }, activeTool === 'seamAllowance', layerLocked);

  const trimTool = useTrimTool(zoom2D, pan2D, pieces, dispatch);

  const handleGrainlineSet = useCallback((pieceId: string, grainline: InternalLine) => {
    dispatch(setInternalLine({ pieceId, line: grainline }));
  }, [dispatch]);

  const grainlineTool = useGrainlineTool(zoom2D, pan2D, pieces, handleGrainlineSet);
  const nodeEditor = useEditCurve(zoom2D, pan2D);
  const editPatternTool = useEditPattern(zoom2D, pan2D);
  const { isEditing: isPatternEditing, editingPieceId: patternEditingPieceId, exitEdit: exitPatternEdit } = editPatternTool;
  const [anchorReferencePieceId, setAnchorReferencePieceId] = useState<string | null>(null);
  const isNodeEditing = nodeEditor.isEditing && (activeTool === 'select' || activeTool === 'editCurve');

  // Al volver a Seleccionar, las anclas siguen sirviendo de referencia
  // (maria-194), pero la sesión de Q termina: ni su selección ni un arrastre
  // pendiente pueden sobrevivir a la herramienta. Solo conservamos el ID
  // visual; la referencia se dibuja desde el contorno actual de la pieza.
  useEffect(() => {
    if (activeTool !== 'editPattern' && isPatternEditing) {
      setAnchorReferencePieceId(activeTool === 'select' ? patternEditingPieceId : null);
      exitPatternEdit();
    } else if (activeTool !== 'select') {
      setAnchorReferencePieceId(null);
    }
  }, [activeTool, isPatternEditing, patternEditingPieceId, exitPatternEdit]);
  // Tool Punto (maria-203): despacha los tres verbos de useEditPattern — una
  // puerta común con el menú contextual, mismo candado, mismo re-anclaje.
  const pointToolHook = usePointTool(zoom2D, pan2D, pieces, {
    addPointOnSegment: editPatternTool.addPointOnSegment,
    convertSegment: editPatternTool.convertSegment,
    convertSegmentToPoints: editPatternTool.convertSegmentToPoints,
  });

  /**
   * maria-203: tras convertir un lado desde el clic derecho, además de mutar
   * el outline hay que ENSEÑAR el resultado — editor de nodos abierto sobre la
   * pieza y el dock en "Edit Curve Points". Sin esto los puntos nuevos existían
   * pero ningún overlay los pintaba y María veía "ningún cambio". También
   * desde Q hay que pasar a editar curvas: su overlay muestra anclas, pero
   * los manejadores Bézier y su arrastre pertenecen al editor de curvas.
   */
  const showConvertedPoints = useCallback((pieceId?: string) => {
    if (!pieceId) return;
    nodeEditor.enterEdit(pieceId);
    if (activeTool !== 'editCurve') activate2DTool(dispatch, 'editCurve');
  }, [nodeEditor, activeTool, dispatch]);
  const scissorsTool = useScissorsTool(zoom2D, pan2D);
  const slashAndSpreadTool = useSlashAndSpreadTool(zoom2D, pan2D);
  const mergeTool = useMergeTool(zoom2D, pan2D);
  const measureTool = useMeasureTool(zoom2D, pan2D);
  const seamEditTool = useSeamEditTool(
    zoom2D,
    pan2D,
    pieces,
    seams,
    activeTool === 'seam' || activeTool === 'seamEdit',
  );
  const topstitchTool = useTopstitchTool(zoom2D, pan2D, pieces);
  const walkSeamTool = useWalkSeamTool(zoom2D, pan2D);
  const offsetTool = useOffsetTool(zoom2D, pan2D);
  const extendTrimTool = useExtendTrimTool(zoom2D, pan2D);

  // ─── Línea interna (spec 2026-08-29 § 4) ─────────────────────────────────
  const internalLineType = (toolOptions?.internalShape?.lineType as InternalLineType | undefined) ?? 'reference';
  const internalNodeType = (toolOptions?.internalShape?.nodeType as 'straight' | 'curvePoints' | undefined) ?? 'straight';

  const handleInternalShapeComplete = useCallback((hostId: string, path: PathCommand[]) => {
    // La anfitriona la fijó el primer press; aquí se resuelve por id en el
    // instante del commit — si desapareció a mitad de trazo (undo, Supr), el
    // trazo se descarta con aviso en vez de caer en silencio.
    const host = pieces.find(p => p.id === hostId);
    if (!host) {
      dispatch(showInfoToast('La pieza ya no existe: el trazo se descartó.'));
      return;
    }
    // El motor dibuja en espacio de PATRÓN; los internals se guardan locales
    // y `toPieceLocalPath` deshace posición y giro (#1068).
    const lineId = newId();
    dispatch(addInternalLine({
      pieceId: host.id,
      line: { id: lineId, type: internalLineType, path: toPieceLocalPath(path, host) },
    }));
    dispatch(selectInternalLine({ pieceId: host.id, lineId }));
  }, [pieces, dispatch, internalLineType]);

  const handleInternalShapeLockedPress = useCallback(() => {
    dispatch(showInfoToast('Pieza bloqueada: se puede mover, pero no editar. Desbloquéala con clic derecho.'));
  }, [dispatch]);

  const internalShapeTool = usePolyPenTool(zoom2D, pan2D, {
    nodeType: internalNodeType,
    pieces: drawablePieces,
    onComplete: handleInternalShapeComplete,
    onLockedPress: handleInternalShapeLockedPress,
  });
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
    // Bitácora: el menú suprimido por un gesto vivo es mudo para Redux
    // (spec caja-negra § 3.5); `tool` ya dice qué gesto lo suprimió.
    const suppressed = () => pushJournal('ui', 'contextmenu', { tool: activeTool, opened: false });

    // Botón derecho con un gesto de borde vivo: cancela y no abre menú. Sin
    // esto el menú se abre a mitad de gesto y hay que navegarlo con el botón
    // izquierdo apretado — un cuasi-modo dentro de otro (spec § 3.5).
    if (activeTool === 'seam' && seamTool.isArmed()) {
      suppressed();
      seamTool.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
      e.preventDefault();
      return;
    }
    if (activeTool === 'notch' && notchTool.isArmed()) {
      suppressed();
      notchTool.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
      e.preventDefault();
      return;
    }
    if (activeTool === 'seamAllowance' && seamAllowanceTool.isArmed()) {
      suppressed();
      seamAllowanceTool.cancel();
      return;
    }
    // Línea interna con trazo vivo: el botón derecho no hace nada y el menú
    // no se abre (spec 2026-08-29 § 4.3). Sin trazo, el menú de siempre.
    if (activeTool === 'internalShape' && internalShapeTool.isTracing()) {
      suppressed();
      return;
    }
    // Rectángulo a mitad de arrastre: cancela y suprime el menú (spec § 6).
    if (activeTool === 'rectangle' && rectTool.isArmed()) {
      suppressed();
      rectTool.cancel();
      return;
    }
    // Círculo: la misma ley que su hermano el rectángulo (#1111).
    if (activeTool === 'circle' && circleTool.isArmed()) {
      suppressed();
      circleTool.cancel();
      return;
    }
    // Triángulo: la misma ley que sus hermanos (#1111, tanda 8).
    if (activeTool === 'triangle' && triangleTool.isArmed()) {
      suppressed();
      triangleTool.cancel();
      return;
    }
    // Pluma con trazo vivo: el botón derecho no hace nada y el menú no se
    // abre (spec § 5), igual que en la línea interna.
    if (activeTool === 'pen' && pen.nodes.length > 0) {
      suppressed();
      return;
    }
    pushJournal('ui', 'contextmenu', { tool: activeTool, opened: true });

    // Determine which piece (if any) is under the cursor
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const { x: canvasX, y: canvasY } = screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);

    const seamAllowanceTarget = activeTool === 'seamAllowance'
      ? resolveSeamAllowanceClick(
          pieces,
          { x: canvasX, y: canvasY },
          screenToPatternLength(10, zoom2D),
          screenToPatternLength(EDGE_HIT_PX, zoom2D),
        )
      : null;
    const hitSaEdgeId = seamAllowanceTarget?.kind === 'edge'
      ? seamAllowanceTarget.edgeId
      : null;

    // Per-edge width and corner type are edited via left-click selection + the
    // Properties panel (Direction A), so right-click is always the general piece
    // menu — one gesture, one meaning, no proximity guessing.

    // Hit-test: find piece whose bounding box contains the point.
    // Vía `hitTestPieceBBox` y no con una copia local del bucle: era la misma
    // caja calculada dos veces, y la de aquí se quedó midiendo contra el
    // fantasma sin girar cuando #1033 volvió el giro declarativo (#1064).
    let hitPiece: typeof pieces[0] | null =
      hitTestPieceBBox({ x: canvasX, y: canvasY }, pieces.filter(p => p.outline?.length))
      ?? null;
    // Un borde se puede alcanzar unos píxeles por fuera del bbox. En ese caso
    // el hit preciso sigue siendo dueño del menú, no la ausencia del body-hit.
    if (seamAllowanceTarget?.kind === 'edge') {
      hitPiece = pieces.find(piece => piece.id === seamAllowanceTarget.pieceId) ?? hitPiece;
    }

    // Hit-test seams: check proximity to seam connection lines and edge highlights
    let hitSeamId: string | null = null;
    const SEAM_THRESHOLD = screenToPatternLength(8, zoom2D);
    for (const seam of hitSaEdgeId ? [] : seams) {
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
    if (hitPiece && !hitSeamId && !hitSaEdgeId) {
      const IL_THRESHOLD = screenToPatternLength(6, zoom2D);
      let nearestDist = Infinity;
      // Las internas viven en el marco local de la pieza, así que el cursor
      // tiene que llegar hasta ahí por el mismo transform del renderizador
      // — con giro, restar solo la posición apunta fuera de la pieza (#1064).
      const { x: localX, y: localY } = patternToPieceLocal(
        { x: canvasX, y: canvasY }, hitPiece,
      );
      for (const line of hitPiece.internals) {
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
    // Nota de María #197: "¿cómo hago curva una recta? No encuentro herramienta".
    // El verbo existía pero solo se alcanzaba DENTRO de "Editar patrón". El
    // hit-test corre ahora sobre cualquier pieza bajo el cursor; el ítem lo
    // esconde el gate de `convertSegment` cuando el clic cae lejos del contorno.
    if (hitPiece) {
      const localPt = patternToPieceLocal({ x: canvasX, y: canvasY }, hitPiece);
      const segHit = nearestSegment(localPt, hitPiece.outline);
      if (segHit && segHit.distance <= screenToPatternLength(8, zoom2D)) {
        segmentIndex = segHit.commandIndex;
        const cmd = hitPiece.outline[segHit.commandIndex];
        segmentIsCurve = cmd?.type === 'C' || cmd?.type === 'Q';
      }
    }

    // ¿El clic derecho cayó sobre el punto que está elegido? Sin esta
    // pregunta, «Mover exacto…» salía con CUALQUIER clic derecho estando en
    // modo nodo —lienzo vacío incluido, porque `resolveTargetKind` decide la
    // altitud antes de mirar nada— y abría el chip del punto elegido, que
    // podía estar al otro lado de la pieza. Ella pediría mover B y se movería A.
    const elegido = puntoUnicoSeleccionado(
      pieces.find(p => p.id === editPatternTool.editingPieceId),
      editPatternTool.selectedNodes,
    );
    let derechoSobreElPuntoElegido = false;
    if (elegido && hitPiece?.id === editPatternTool.editingPieceId) {
      const localPt = patternToPieceLocal({ x: canvasX, y: canvasY }, hitPiece);
      const golpe = hitTestNode(localPt, editPatternTool.nodes, screenToPatternLength(8, zoom2D));
      derechoSobreElPuntoElegido = !!golpe && editPatternTool.selectedNodes.has(golpe.commandIndex);
    }

    setCtxMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      pieceId: hitSeamId ? null : (hitPiece?.id ?? null),
      pieceName: hitSeamId ? undefined : hitPiece?.name,
      seamId: hitSeamId,
      saEdgeId: hitSaEdgeId,
      segmentIndex,
      segmentIsCurve,
      activeTool,
      internalLineId: hitInternalLineId,
      internalLineType: hitInternalLineType,
      isEditingNodes: editPatternTool.isEditing,
      derechoSobreElPuntoElegido,
    });
  }, [pieces, seams, pan2D, zoom2D, activeTool, editPatternTool.isEditing, editPatternTool.selectedNodes, editPatternTool.editingPieceId, editPatternTool.nodes, seamTool, notchTool, seamAllowanceTool, internalShapeTool, rectTool, circleTool, triangleTool, pen.nodes.length]);

  const handleTransform = useCallback((updates: TransformUpdate[]) => {
    for (const u of updates) {
      const piece = pieces.find(p => p.id === u.id);
      if (piece) {
        dispatch(updatePiece({
          ...piece,
          outline: u.outline,
          position: u.position,
          // El giro va por `rotation` desde #1033 — el mismo canal que el menú
          // del clic derecho. Al estirar viaja sin cambios.
          rotation: u.rotation,
          // The internals ride the same transform (nota de María #171): a
          // scaled outline over un-scaled grainlines and piquetes is the
          // stranding bug wearing a different handle.
          internals: u.internals,
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

  const cotasRef = useRef<CotasLayerHandle>(null);
  const { svgRef, handleWheel, handleDoubleClick, handleMouseDown: editorHandleMouseDown, handleMouseMove: editorHandleMouseMove, handleMouseUp, handleMouseLeave, handlePointerCancel, getCursor, selectMarquee, showTransformBox, isDraggingPiece, isDraggingEndpoint } =
    useEditorInteractions(activeTool, zoom2D, pan2D, pieces, {
      pen, rectTool, circleTool, triangleTool, seamTool, notchTool, pointTool: pointToolHook, seamAllowanceTool, trimTool, grainlineTool, measureTool, nodeEditor, transformTool, editPattern: editPatternTool, scissorsTool, slashAndSpreadTool, mergeTool, topstitchTool, walkSeamTool, seamEditTool, offsetTool, extendTrimTool, internalShapeTool, pleatTool, elasticTool, cotas: cotasRef,
    });

  // ── Cotas vivas (spec 2026-08-30 § 3, § 5): la pieza nueva o seleccionada
  // muestra Ancho/Alto sobre el lienzo y se editan ahí mismo. ────────────────
  // La figura que la cabina del círculo tiene puesta. La necesita `aplicarCota`
  // para no romper la promesa de la herramienta al escribir una sola medida.
  const figuraDelCirculo = useSelector(
    (s: RootState) => String(s.tools.toolOptions?.circle?.shapeType ?? 'circle'),
  );
  const defaultRect = useSelector((s: RootState) => ({
    width: Number(s.tools.toolOptions?.rectangle?.width ?? 100),
    height: Number(s.tools.toolOptions?.rectangle?.height ?? 100),
  }), shallowEqual);
  const { hotId: rectHotId, enfriar: enfriarRect } = rectTool;
  const { hotId: circleHotId, enfriar: enfriarCircle } = circleTool;
  const { hotId: triangleHotId, enfriar: enfriarTriangle } = triangleTool;
  // Solo una herramienta está activa a la vez, y cada una enfría la suya en
  // cuanto deja de serlo: el sujeto caliente es el de la herramienta en curso.
  const hotId = activeTool === 'circle' ? circleHotId : activeTool === 'triangle' ? triangleHotId : rectHotId;
  // Refs para que `aplicarCota` no se recree en cada render de la pluma: la
  // rama del tramo en curso necesita la herramienta viva, no una copia vieja.
  const penRef = useRef(pen);
  penRef.current = pen;
  const internalShapeRef = useRef(internalShapeTool);
  internalShapeRef.current = internalShapeTool;
  const editPatternRef = useRef(editPatternTool);
  editPatternRef.current = editPatternTool;

  // El tramo congelado con Tab, venga de la pluma o de la línea interna: las
  // dos son la misma gramática y solo una puede estar viva a la vez (#1129).
  const tramoEnCurso = activeTool === 'pen'
    ? pen.nextPoint
    : activeTool === 'internalShape'
      ? internalShapeTool.nextPoint
      : null;
  const tramoSeq = activeTool === 'pen'
    ? pen.nextPointSeq
    : activeTool === 'internalShape'
      ? internalShapeTool.nextPointSeq
      : -1;

  // El punto en edición, solo cuando hay UNO — que no es lo mismo que un
  // índice de comando.
  //
  // Un clic sobre un nodo selecciona el GRUPO de anclas coincidentes
  // (`useEditPattern.ts:367`), porque CLO duplica el vértice en cada esquina y
  // moverlas por separado rompería el contorno en una púa. En el DXF de María
  // eso significa `selectedNodes.size === 2` para UN SOLO punto: con la
  // condición ingenua (`length !== 1`), los chips y el menú de #1112 se
  // apagaban en silencio **justo sobre los datos para los que se hicieron**.
  // El e2e no lo veía porque su rectángulo sintético tiene anclas únicas.
  //
  // Con dos o más PUNTOS distintos sigue sin haber cotas: lo único que
  // comparten es su desplazamiento, y esa es otra cota que no está hecha.
  const nodoSeleccionado = useMemo(
    () => puntoUnicoSeleccionado(
      activeTool === 'editPattern' ? pieces.find(p => p.id === editPatternTool.editingPieceId) : undefined,
      editPatternTool.selectedNodes,
    ),
    [activeTool, editPatternTool.editingPieceId, editPatternTool.selectedNodes, pieces],
  );

  const sujeto = useMemo(() => cotasDelSujeto({
    activeTool, pieces, selectedPieceIds, selectedInternalLine: editor.selectedInternalLine,
    hotId, isDragging: isDraggingPiece || transformTool.isDragging || isDraggingEndpoint,
    contextMenuOpen: ctxMenu.visible, calibrationActive: calibrationMode !== null,
    hiddenLayerIds, layerLocked, saSelection: editor.saSelection,
    saAncla: seamAllowanceTool.ancla, saHover: seamAllowanceTool.hover,
    tramoEnCurso, nodoSeleccionado,
  }, defaultRect), [activeTool, pieces, selectedPieceIds, editor.selectedInternalLine, editor.saSelection, hotId, isDraggingPiece, isDraggingEndpoint, transformTool.isDragging, ctxMenu.visible, calibrationMode, defaultRect, hiddenLayerIds, layerLocked, seamAllowanceTool.ancla, seamAllowanceTool.hover, tramoEnCurso, nodoSeleccionado]);
  // Las cuatro herramientas que toman el sujeto de la selección lo dicen en la
  // tira antes del clic, en vez de morirse mudas (#1117).
  const falta = faltaSujeto(activeTool, selectedPieceIds);

  // El desenlace de un gesto que se armó y no dejó nada (#1117, hallazgo G).
  // Va a la tira y no a un toast: el mismo gesto se repite cinco veces en tres
  // segundos y serían cinco toasts encima del lienzo.
  const [desenlace, setDesenlace] = useState<string | null>(null);
  useEffect(() => {
    let borrado: ReturnType<typeof setTimeout> | undefined;
    const cancelar = suscribirNoPasoNada((aviso) => {
      setDesenlace(aviso.texto);
      clearTimeout(borrado);
      borrado = setTimeout(() => setDesenlace(null), DESENLACE_MS);
    });
    return () => { cancelar(); clearTimeout(borrado); };
  }, []);
  // La tira pinta el nombre de la herramienta activa en su cabecera. Sin esto,
  // fallar un piquete y pasarse a Hilo dentro de los 4 s deja «Hilo» arriba y
  // el mensaje del piquete debajo: el aviso queda atribuido a la herramienta
  // equivocada. Es el mismo defecto que este canal vino a arreglar, al reves.
  useEffect(() => setDesenlace(null), [activeTool]);

  const abrirChipVisto = useRef(0);
  useEffect(() => {
    if (abrirChipVisto.current === seamAllowanceTool.abrirChip) return;
    abrirChipVisto.current = seamAllowanceTool.abrirChip;
    const ancla = seamAllowanceTool.ancla;
    if (!ancla) return;
    if (cotasRef.current?.abrirPrimero()) {
      pushJournal('gesture', 'sa:chip:abre', { pieceId: ancla.pieceId, edgeId: ancla.edgeId });
    }
  }, [seamAllowanceTool.abrirChip, seamAllowanceTool.ancla]);

  // Congelar con Tab abre el chip de Largo (spec de cotas vivas § 5.4). El
  // chip no existe hasta el render siguiente, así que se espera a que el
  // `tramoEnCurso` esté puesto y entonces se enfoca — no se puede enfocar lo
  // que todavía no está en el DOM.
  const tramoVisto = useRef<number>(-1);
  useEffect(() => {
    // La marca es la SECUENCIA del Tab, no la posición del tramo. Con la
    // posición, pulsar Tab una segunda vez sin haber colocado nada dejaba la
    // marca igual, el efecto salía temprano y el chip no se reabría — y como el
    // router ya había hecho `preventDefault`, el Tab nativo tampoco navegaba.
    // Tecla muerta, encontrada por la revisión adversarial del 06-09.
    if (tramoVisto.current === tramoSeq) return;
    tramoVisto.current = tramoSeq;
    if (!tramoEnCurso) return;
    if (cotasRef.current?.abrirPrimero()) {
      pushJournal('gesture', 'tramo:congelado', { largo: tramoEnCurso.lengthMm, angulo: tramoEnCurso.angleDeg });
    }
  }, [tramoSeq, tramoEnCurso]);

  // Enfriamiento irreversible (spec § 3.1): en cuanto la selección deja de ser
  // la pieza nueva, cambia la herramienta o la pieza desaparece, se enfría y
  // no vuelve a calentarse sola.
  useEffect(() => {
    if (!rectHotId) return;
    const viva = pieces.some(p => p.id === rectHotId);
    if (activeTool !== 'rectangle' || selectedPieceIds.length !== 1 || selectedPieceIds[0] !== rectHotId || !viva) enfriarRect();
  }, [activeTool, selectedPieceIds, pieces, rectHotId, enfriarRect]);
  useEffect(() => {
    if (!circleHotId) return;
    const viva = pieces.some(p => p.id === circleHotId);
    if (activeTool !== 'circle' || selectedPieceIds.length !== 1 || selectedPieceIds[0] !== circleHotId || !viva) enfriarCircle();
  }, [activeTool, selectedPieceIds, pieces, circleHotId, enfriarCircle]);
  useEffect(() => {
    if (!triangleHotId) return;
    const viva = pieces.some(p => p.id === triangleHotId);
    if (activeTool !== 'triangle' || selectedPieceIds.length !== 1 || selectedPieceIds[0] !== triangleHotId || !viva) enfriarTriangle();
  }, [activeTool, selectedPieceIds, pieces, triangleHotId, enfriarTriangle]);

  const aplicarCota = useCallback((cota: Cota, valueMm: number, token?: UndoBatchToken, motivo: 'enter' | 'tab' = 'enter') => {
    // Un círculo escrito por UNA sola cota dejaba de ser círculo. La cota de una
    // pieza es su caja (2rx × 2ry), así que escribir el Ancho estiraba solo la
    // X: dibujar 120×120 en modo «Círculo», escribir 200 en Ancho y quedarse con
    // 200×120 —un óvalo— mientras el selector seguía diciendo «Círculo». Medido
    // en Chrome el 2026-09-05 por la revisión adversarial. Con la figura puesta
    // en Círculo, la medida escrita manda en las dos dimensiones; en Elipse cada
    // cota sigue siendo suya, que es lo que una elipse significa.
    const circuloVivo = activeTool === 'circle' && figuraDelCirculo === 'circle'
      && (cota.kind === 'ancho' || cota.kind === 'alto');
    const piezaDeLaCota = circuloVivo ? pieces.find(p => p.id === sujeto.piece?.id) : undefined;
    const uniforme = piezaDeLaCota ? resizePieceTo(piezaDeLaCota, valueMm, valueMm) : null;
    const update = uniforme ? { kind: 'piece' as const, ...uniforme } : cota.apply(valueMm);
    if (!update) return;
    // Liveness: si el sujeto murió (undo, borrado), no se escribe nada.
    if (update.kind === 'margen') {
      const piece = pieces.find(p => p.id === update.pieceId);
      const edge = piece?.edges?.find(candidate => candidate.id === update.edgeId);
      if (!piece || !edge) return;
      if (update.fuente === 'tramo') {
        if (update.spanIndex == null) return;
        const span = edge.seamAllowanceSpans?.[update.spanIndex];
        if (!span) return;
        const action = updateEdgeSeamAllowanceSpan({
          pieceId: update.pieceId,
          edgeId: update.edgeId,
          spanIndex: update.spanIndex,
          span: { ...span, width: update.width },
        });
        dispatch(token ? withUndoBatchToken(action, token) : action);
      } else {
        const action = setEdgesSeamAllowance({
          items: [{ pieceId: update.pieceId, edgeId: update.edgeId }],
          width: update.width,
        });
        dispatch(token ? withUndoBatchToken(action, token) : action);
      }
    } else if (update.kind === 'piece') {
      const piece = pieces.find(p => p.id === update.id);
      if (!piece) return;
      const accion = updatePiece({
        ...piece, outline: update.outline, position: update.position, rotation: update.rotation,
        internals: update.internals, updatedAt: Date.now(),
      });
      dispatch(token ? withUndoBatchToken(accion, token) : accion);
    } else if (update.kind === 'tramoEnCurso') {
      // El único `CotaUpdate` que no toca Redux: no hay objeto que mutar
      // todavía. Enter coloca el punto; Tab solo reescribe el par pendiente y
      // salta al otro chip (#1129, spec de cotas vivas § 5.4).
      const herramienta = activeTool === 'pen' ? penRef.current
        : activeTool === 'internalShape' ? internalShapeRef.current
          : null;
      if (!herramienta) return;
      if (motivo === 'tab') herramienta.setNextPointValues(update.largoMm, update.anguloDeg);
      else herramienta.placePolar(update.largoMm, update.anguloDeg);
    } else if (update.kind === 'nodo') {
      // Lo escribe `useEditPattern`, no este archivo: es quien ya mueve nodos
      // en el arrastre, con compensación de pivote, re-anclado de piquetes y
      // lote de deshacer. Dos escritores del mismo hecho se desincronizan.
      editPatternRef.current.moveNodeTo(update.pieceId, update.commandIndex, update.destino);
    } else {
      const piece = pieces.find(p => p.id === update.pieceId);
      if (!piece) return;
      if (!piece.internals.some(line => line.id === update.lineId)) return;
      const accion = updateInternalLine({ pieceId: update.pieceId, lineId: update.lineId, path: update.path });
      dispatch(token ? withUndoBatchToken(accion, token) : accion);
    }
  }, [pieces, dispatch, activeTool, figuraDelCirculo, sujeto.piece?.id]);
  const aplicarRef = useRef(aplicarCota);
  aplicarRef.current = aplicarCota;

  // Aquí vivía `escribirDefault`: editar la cota de una pieza recién nacida
  // reescribía el tamaño del próximo clic (el "Adjust Last Operation" de
  // Blender). Se retira por la reunión del 07-09. Ese patrón es correcto para
  // un modelador —que repite operaciones— y equivocado para una patronista:
  // "en verdad no es una acción repetitiva, cada rectángulo va a ser de un
  // tamaño distinto" [01:49].
  //
  // Lo que se va es la escritura IMPLÍCITA, no la barra: si ella escribe una
  // medida ahí, el clic la sigue respetando.
  //
  // `sujeto.caliente` SOBREVIVE y no es código muerto: sostiene el rótulo
  // "Editando: la pieza nueva" y va en la bitácora de cada commit de cota.

  const handleCotaCommit = useCallback((cota: Cota, valueMm: number, motivo: 'enter' | 'tab' = 'enter') => {
    aplicarCota(cota, valueMm, undefined, motivo);
    pushJournal('gesture', 'cota:commit', {
      id: cota.id,
      kind: cota.kind,
      prev: cota.valueMm,
      value: valueMm,
      caliente: sujeto.caliente,
      motivo,
    });
  }, [aplicarCota, sujeto.caliente]);

  // Scrub: un batch de deshacer con token (una entrada), un despacho por frame
  // como máximo, cada valor derivado del snapshot de la cota de partida. Todos
  // los terminales cierran el batch; un undo ajeno que invalide el token lo
  // termina sin escribir más (spec § 5.3).
  const scrubRef = useRef<{ token: UndoBatchToken; cota: Cota; v0: number; valor: number; raf: number | null } | null>(null);
  const cerrarScrub = useCallback(() => {
    const s = scrubRef.current;
    if (!s) return;
    scrubRef.current = null;
    if (s.raf !== null) cancelAnimationFrame(s.raf);
    if (isUndoBatchTokenActive(s.token)) endUndoBatch(dispatch, s.token);
  }, [dispatch]);
  const handleCotaScrubStart = useCallback((cota: Cota) => {
    cerrarScrub();
    scrubRef.current = { token: beginUndoBatch(dispatch, `Ajustar ${cota.label.toLowerCase()}`), cota, v0: cota.valueMm, valor: cota.valueMm, raf: null };
  }, [cerrarScrub, dispatch]);
  const handleCotaScrub = useCallback((_cota: Cota, valueMm: number) => {
    const s = scrubRef.current;
    if (!s) return;
    s.valor = valueMm;
    if (s.raf !== null) return;
    s.raf = requestAnimationFrame(() => {
      const t = scrubRef.current;
      if (!t) return;
      t.raf = null;
      if (!isUndoBatchTokenActive(t.token)) { scrubRef.current = null; return; }
      aplicarRef.current(t.cota, t.valor, t.token);
    });
  }, []);
  const handleCotaScrubEnd = useCallback((_cota: Cota, valueMm: number) => {
    const s = scrubRef.current;
    if (!s) return;
    if (s.raf !== null) { cancelAnimationFrame(s.raf); s.raf = null; }
    if (isUndoBatchTokenActive(s.token)) aplicarRef.current(s.cota, valueMm, s.token);
    const { cota } = s;
    cerrarScrub();
    pushJournal('gesture', 'cota:scrub', { id: cota.id, value: valueMm, caliente: sujeto.caliente });
  }, [cerrarScrub, sujeto.caliente]);
  // Cancelar (pointercancel, desmontaje del chip): la pieza vuelve al valor de
  // partida dentro del mismo batch y el batch se cierra. Sin clic fantasma.
  const handleCotaScrubCancel = useCallback((_cota: Cota) => {
    const s = scrubRef.current;
    if (!s) return;
    if (s.raf !== null) { cancelAnimationFrame(s.raf); s.raf = null; }
    if (isUndoBatchTokenActive(s.token)) aplicarRef.current(s.cota, s.v0, s.token);
    cerrarScrub();
    pushJournal('gesture', 'cota:scrub', { id: s.cota.id, outcome: 'cancel' });
  }, [cerrarScrub]);
  // Cambia el sujeto o la herramienta, o se desmonta el editor, con un scrub
  // vivo: se cierra aquí. La herramienta va aparte porque rectangle → select
  // conserva el mismo id de pieza y el contrato pide cerrar igual.
  const sujetoId = sujeto.piece?.id ?? null;
  useEffect(() => () => cerrarScrub(), [sujetoId, activeTool, cerrarScrub]);

  /* Los tiradores del transform box son estorbos para los chips de cota.
   *
   * Sin esto se pisaban, y no de forma inocua: medido el 2026-09-04, el chip
   * del alto tapaba entero el asa `e` y el del ancho la de giro, así que
   * `elementFromPoint` sobre los dos devolvia `button.cota`. El gesto no se
   * perdia — se convertia en un scrub del chip —, o sea que tirar del "asa
   * este" para ensanchar le subia el ALTO a Maria: su queja de #198 entrando
   * por otra puerta. Es tambien la causa real del e2e
   * `maria-198-resize-con-ancla` en rojo, que se leia como matematica de
   * resize rota cuando la matematica estaba bien.
   *
   * Solo estorban mientras la caja se pinta: `showTransformBox` gobierna el
   * hit-test de los tiradores, asi que es la misma condicion. */
  const estorbosDeLasAsas = useMemo(
    () => (showTransformBox ? cajasDeAsas(transformTool.handles, pan2D, zoom2D) : undefined),
    [showTransformBox, transformTool.handles, pan2D, zoom2D],
  );

  /* Durante el arrastre el grupo de la pieza se mueve por DOM directo
   * (`useEditorInteractions.ts:818`), mientras TODA superficie que se coloque
   * sumando `piece.position` —la posición de REDUX— se queda clavada en el
   * sitio viejo. Es el "recuerdo con los puntos" que María fotografió (#194),
   * y la segunda mitad de su #218: "las líneas se ven discontinuas trasladadas
   * en otro sitio".
   *
   * El #194 tapó los overlays de anclas UNO A UNO y dejó nueve hermanos con la
   * misma exposición; `POMOverlay` es el que se ve porque se monta sin
   * condición de herramienta. Por eso el candado ya no se pone por overlay: se
   * pone donde se monta `ToolOverlay`, que es el árbol donde viven todos, y así
   * una superficie nueva nace tapada en vez de nacer rota.
   *
   * `showTransformBox` conserva su propio `!isDraggingPiece` a propósito: no es
   * solo pintura, gobierna el hit-test de los tiradores y la barra flotante,
   * que viven fuera de este árbol. */

  // Mouse capture fallback for gestures that leave the SVG. Keep the latest
  // release authorities in refs so the global listeners stay stable across
  // drag-driven renders. Edit Pattern owns its primary gesture from mousedown
  // to release even if a shortcut changes activeTool in between.
  const mouseInteractionActiveRef = useRef(false);
  const handleMouseUpRef = useRef(handleMouseUp);
  handleMouseUpRef.current = handleMouseUp;
  const editPatternMouseUpRef = useRef(editPatternTool.handleMouseUp);
  editPatternMouseUpRef.current = editPatternTool.handleMouseUp;
  const capturedMouseOwnerRef = useRef<'editPattern' | null>(null);

  const finishMouseInteraction = useCallback((e?: React.MouseEvent<SVGSVGElement>) => {
    if (!mouseInteractionActiveRef.current) return;
    mouseInteractionActiveRef.current = false;
    const owner = capturedMouseOwnerRef.current;
    capturedMouseOwnerRef.current = null;
    if (owner === 'editPattern') {
      editPatternMouseUpRef.current();
      return;
    }
    handleMouseUpRef.current(e);
  }, []);

  useEffect(() => {
    const finishGlobalMouseInteraction = () => finishMouseInteraction();
    window.addEventListener('mouseup', finishGlobalMouseInteraction);
    window.addEventListener('blur', finishGlobalMouseInteraction);
    return () => {
      window.removeEventListener('mouseup', finishGlobalMouseInteraction);
      window.removeEventListener('blur', finishGlobalMouseInteraction);
      finishMouseInteraction();
    };
  }, [finishMouseInteraction]);

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
    // El dock 2D flota (no reserva espacio real, § 2.1), así que el encuadre
    // tiene que descontar su faja a mano (ver DOCK_WIDTH_PX arriba). Se resta
    // del ancho Y se desplaza el paneo por lo mismo — encuadrar en
    // [DOCK, ancho], no en [0, ancho-DOCK]. Restar sin desplazar corre el
    // patrón HACIA el dock, que es lo contrario.
    const fit = computeFitView(pieces, Math.max(0, rect.width - DOCK_WIDTH_PX), rect.height);
    if (fit) {
      dispatch(setZoom2D(fit.zoom));
      dispatch(setPan2D({ x: fit.pan.x + DOCK_WIDTH_PX, y: fit.pan.y }));
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
    if (e.button === 0 || e.button === 1) {
      mouseInteractionActiveRef.current = true;
    }
    capturedMouseOwnerRef.current =
      !calibrationMode && e.button === 0 && activeTool === 'editPattern'
        ? 'editPattern'
        : null;
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
  }, [activeTool, calibrationMode, pan2D, zoom2D, dispatch, svgRef, editorHandleMouseDown]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // If release happened outside the browser window, mouseup may be absent;
    // the first buttonless re-entry must close instead of replaying the drag.
    if (mouseInteractionActiveRef.current && e.buttons === 0) {
      finishMouseInteraction();
      return;
    }
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
  }, [pan2D, zoom2D, svgRef, calibrationMode, editorHandleMouseMove, finishMouseInteraction]);

  const handleHostMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    finishMouseInteraction(e);
  }, [finishMouseInteraction]);

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
        onMouseUp={handleHostMouseUp}
        onMouseLeave={handleMouseLeave}
        onPointerCancel={handlePointerCancel}
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
            showNotches={showNotches}
            showPieceNames={showPieceNames}
            renderMode2D={renderMode2D}
            showLineLengths={showLineLengths}
            piezaConPuntosDeCurva={
              // María [11:38]: «los de curva igual no, porque son muchos
              // puntos… solo deberían verse cuando uno clica como el menú
              // curva». Los dos modos de editar nodos cuentan como ese menú:
              // en los dos los puntos de curva son manipulables (#1103).
              //
              // Va el ID, no un booleano: encenderlo global suelta cientos de
              // puntos sobre piezas que nadie está tocando.
              isNodeEditing
                ? nodeEditor.editingPieceId
                : (activeTool === 'editPattern' ? editPatternTool.editingPieceId : null)
            }
            units={units}
            groupColors={groupColors}
            selectedInternalLine={editor.selectedInternalLine}
            editingPieceNameId={editingPieceNameId}
            onPieceNameDoubleClick={handlePieceNameDoubleClick}
            onPieceNameSave={handlePieceNameSave}
            onPieceNameCancel={handlePieceNameCancel}
          />
          <CotaLines cotas={sujeto.cotas} zoom2D={zoom2D} />
          <ConstructionOverlay zoom2D={zoom2D} pieces={pieces} />
          {/* `showSewingLines` sigue siendo el interruptor maestro del usuario
              (menú del logo → "Líneas de costura"); lo que se le suma es el
              contexto: las costuras se pintan cuando estás en el menú de
              costuras o tienes una seleccionada, no mientras dibujas el patrón
              (#210). Medido antes: con la flecha activa se pintaban 2 resaltes
              y el hover sacaba la info a opacidad 1. */}
          {showSewingLines && (SEWING_TOOL_IDS.has(activeTool) || editor.selectedSeamId != null) && (
            <SeamRenderer
              seams={seams}
              pieces={pieces}
              zoom2D={zoom2D}
              selectedSeamId={editor.selectedSeamId}
              emphasis={activeTool === 'seam' ? 'muted' : 'full'}
              hoveredSeamIds={activeTool === 'seam' || activeTool === 'seamEdit'
                ? seamEditTool.hoveredSeamIds
                : undefined}
            />
          )}
          <ElasticRenderer zoom2D={zoom2D} selectedElasticId={elasticTool.selectedElasticId} />
          <TrimRenderer zoom2D={zoom2D} />
          {activeTool === 'seamAllowance' && (
            <SeamAllowanceSelectionOverlay
              saSelection={editor.saSelection}
              hoverEdge={sujeto.bordeLeido}
              pieces={pieces}
              zoom={zoom2D}
            />
          )}
          {/* UN candado para todas las superficies que se colocan con Redux.
              Ver el comentario de `isDraggingPiece` arriba: dentro de este
              árbol viven los overlays que suman `piece.position`, y ninguno
              puede seguir a la pieza mientras el arrastre la mueve por DOM.
              Estaba puesto a mano en dos de ellos; el resto quedó fuera. */}
          {!isDraggingPiece && (
          <ToolOverlay
            activeTool={activeTool}
            zoom2D={zoom2D}
            pieces={pieces}
            units={units}
            penNodes={pen.nodes}
            previewPath={pen.previewPath}
            guidePath={pen.guidePath}
            penDistance={pen.lastPointDistance}
            penWillClose={pen.willClose}
            penVertices={pen.verticesDePiezas}
            penSnapHover={pen.hover}
            rectPreview={rectTool.previewRect}
            rectDimensions={rectTool.rectDimensions}
            circlePreview={circleTool.previewRect}
            circleDimensions={circleTool.circleDimensions}
            trianglePoints={triangleTool.trianglePoints}
            triangleDimensions={triangleTool.triangleDimensions}
            seamSegmentA={seamTool.segmentA}
            seamHoveredTarget={seamTool.hoveredTarget}
            seamActiveTarget={seamTool.activeTarget}
            seamLiveRange={seamTool.liveRange}
            notchHoveredPoint={notchTool.hoveredPoint}
            notchDragPreview={notchTool.dragPreview}
            notchDragSegment={notchTool.dragSegment}
            pointToolHover={pointToolHook.hover}
            pointToolMode={pointToolHook.mode}
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
            nodeEditorIsEditing={isNodeEditing}
            nodeEditorEditingPieceId={nodeEditor.editingPieceId}
            nodeEditorNodes={nodeEditor.nodes}
            selectedNode={nodeEditor.selectedNode}
            hoveredNode={nodeEditor.hoveredNode}
            showTransformBox={showTransformBox}
            transformBbox={transformTool.bbox}
            transformHandles={transformTool.handles}
            transformPreview={transformTool.preview}
            editPatternIsEditing={editPatternTool.isEditing}
            anchorReferencePieceId={anchorReferencePieceId}
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
            offsetPreviewOutline={offsetTool.previewOutline}
            offsetPreviewPiecePosition={
              editor.selectedPieceIds.length === 1
                ? pieces.find(p => p.id === editor.selectedPieceIds[0])?.position ?? null
                : null
            }
            trimHoveredEdge={trimTool.hoveredEdge}
            selectMarquee={selectMarquee}
          />
          )}
          {activeTool === 'internalShape' && (
            <PolyPenToolOverlay
              nodes={internalShapeTool.nodes}
              previewPoint={internalShapeTool.previewPoint}
              pressPoint={internalShapeTool.pressPoint}
              isDragging={internalShapeTool.isDragging}
              dragHandle={internalShapeTool.dragHandle}
              hover={internalShapeTool.hover}
              nodeType={internalNodeType}
              closeArmed={internalShapeTool.closeArmed}
              zoom2D={zoom2D}
              units={units}
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
          nodeEditorIsEditing={isNodeEditing}
          seamPhase={seamTool.phase}
          topstitchMode={topstitchTool.mode}
          walkSeamPhase={walkSeamTool.mobileEdge ? 'walking' : walkSeamTool.stationaryEdge ? 'stationary' : 'idle'}
          slashPhase={slashAndSpreadTool.phase}
          saDefaultWidthMm={seamAllowanceTool.widthMm}
          internalShapeNodesLength={internalShapeTool.nodes.length}
          cotasVisibles={sujeto.cotas.length > 0}
          hasSeams={seams.length > 0}
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
      <FloatingActionBar
        show={showTransformBox}
        bbox={transformTool.bbox}
        pan2D={pan2D}
        zoom2D={zoom2D}
        isDragging={transformTool.isDragging}
        contextMenuOpen={ctxMenu.visible}
        calibrationActive={calibrationMode !== null}
        ctx={barCtx}
      />
      <CotasLayer
        ref={cotasRef}
        cotas={sujeto.cotas}
        lectura={sujeto.lectura}
        lecturaApagada={sujeto.lecturaApagada}
        pan2D={pan2D}
        zoom2D={zoom2D}
        estorbos={estorbosDeLasAsas}
        disabled={sujeto.disabled}
        onCommit={handleCotaCommit}
        onScrubStart={handleCotaScrubStart}
        onScrub={handleCotaScrub}
        onScrubEnd={handleCotaScrubEnd}
        onScrubCancel={handleCotaScrubCancel}
      />
      {/* La tira ya no cede la esquina a nadie. La cedía porque `NextPointPanel`
          vivía en ella; los chips del tramo en curso viven sobre el trazo, que
          es donde está el gesto, así que no hay nada que esquivar (#1129). */}
      <ToolStrip2D
        lineaDeSujeto={sujeto.lineaDeSujeto}
        falta={falta}
        desenlace={desenlace}
        /* El modal de piquete no usa portal ni atrapa el foco, y la tira vive
           en su misma esquina: se declara inerte mientras esté abierto (#1125). */
        inerte={Boolean(notchTool.refining?.notch.notchAnchor)}
      />
      <FilaDeCapas />
      {shouldShowEmptyState(pieces.length, activeTool) && (
        <EmptyState2D onImportDXF={onImportDXF} />
      )}
      <ContextMenu
        menu={ctxMenu}
        onClose={() => setCtxMenu(m => ({ ...m, visible: false }))}
        onRename={(id) => setEditingPieceNameId(id)}
        onConvertSegment={(idx, toCurve, pieceId) => {
          editPatternTool.convertSegment(idx, toCurve, pieceId);
          showConvertedPoints(pieceId);
        }}
        onConvertSegmentToPoints={(idx, pieceId) => {
          editPatternTool.convertSegmentToPoints(idx, pieceId);
          showConvertedPoints(pieceId);
        }}
        onZoomToFit={handleZoomToFit}
        onUnfold={handleUnfold}
        onOffsetInternalLine={handleOffsetInternalLine}
        onOptimizeCurves={handleOptimizeCurves}
        onRefineNotch={notchTool.refineExisting}
        onMoverPuntoExacto={() => {
          // No abre nada nuevo: lleva el foco al chip que ya está en pantalla.
          // El caso en que NO hay chip también se registra: un verbo que no
          // hace nada Y no deja rastro es la salida muda que el repo persigue.
          const abrio = cotasRef.current?.abrirPrimero() ?? false;
          pushJournal('gesture', 'nodo:moverExacto', { via: 'menu', abrio });
        }}
        onOpenSeamAllowanceProperties={() => onOpenPanel?.('Properties')}
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
    </div>
  );
}
