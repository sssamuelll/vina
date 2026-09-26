import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import {
  setLayer, setSublayer, renameLayer, deleteLayerName,
  setLayerLocked, addLayer, removeLayer, getLayerDisplayName,
} from '../../store/projectSlice';
import {
  toggleLayerVisibility, toggleHide3D,
  setXrayMode, setLayerOutlineColor, cleanupRemovedLayer,
} from '../../store/simulationSlice';
import { selectPiece } from '../../store/editorSlice';
import LayerColorPicker from './LayerColorPicker';
import { getOutlineColor } from '../../utils/layerColors';
import './LayerPanel.css';

// ─── Component ──────────────────────────────────────────────────────────────

export default function LayerPanel() {
  const dispatch = useDispatch();

  // Redux state
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const layerNames = useSelector((s: RootState) => s.project.layerNames);
  const layerLocked = useSelector((s: RootState) => s.project.layerLocked);
  const hiddenLayerIds = useSelector((s: RootState) => s.simulation.hiddenLayerIds);
  const hiddenPieceIds = useSelector((s: RootState) => s.simulation.hiddenPieceIds);
  const layerOutlineColors = useSelector((s: RootState) => s.simulation.layerOutlineColors);
  const xrayMode = useSelector((s: RootState) => s.simulation.xrayMode);
  const selectedIds = useSelector((s: RootState) => s.editor.selectedPieceIds);

  // Local UI state
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [renamingLayer, setRenamingLayer] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ layer: number; x: number; y: number } | null>(null);
  const [dragOverLayer, setDragOverLayer] = useState<number | null>(null);
  const [dragOverPieceId, setDragOverPieceId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // ─── Derived data ───────────────────────────────────────────────────────────

  const layerMap = useMemo(() => {
    const map = new Map<number, typeof pieces>();
    for (const piece of pieces) {
      const layer = piece.layer ?? 1;
      if (!map.has(layer)) map.set(layer, []);
      map.get(layer)!.push(piece);
    }
    return map;
  }, [pieces]);

  const allLayers = useMemo(() => {
    const layerSet = new Set<number>();
    for (const piece of pieces) layerSet.add(piece.layer ?? 1);
    for (const key of Object.keys(layerNames)) layerSet.add(Number(key));
    for (const key of Object.keys(layerLocked)) layerSet.add(Number(key));
    return [...layerSet].sort((a, b) => b - a);
  }, [pieces, layerNames, layerLocked]);

  // ─── Toolbar handlers ──────────────────────────────────────────────────────

  const handleAddLayer = useCallback(() => {
    const nextLayer = allLayers.length > 0 ? Math.max(...allLayers) + 1 : 1;
    dispatch(addLayer({ layer: nextLayer }));
  }, [dispatch, allLayers]);

  const handleToggleXray = useCallback(() => {
    dispatch(setXrayMode({ enabled: !xrayMode }));
  }, [dispatch, xrayMode]);

  const handleCollapseAll = useCallback(() => {
    const allCollapsed = allLayers.every(l => collapsed[l]);
    const next: Record<number, boolean> = {};
    for (const l of allLayers) next[l] = !allCollapsed;
    setCollapsed(next);
  }, [allLayers, collapsed]);

  // ─── Rename ─────────────────────────────────────────────────────────────────

  const startRename = useCallback((layer: number) => {
    setRenamingLayer(layer);
    setRenameValue(
      getLayerDisplayName({ project: { layerNames } }, layer)
    );
  }, [layerNames]);

  const commitRename = useCallback(() => {
    if (renamingLayer === null) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      dispatch(renameLayer({ layer: renamingLayer, name: trimmed }));
    } else {
      dispatch(deleteLayerName({ layer: renamingLayer }));
    }
    setRenamingLayer(null);
  }, [dispatch, renamingLayer, renameValue]);

  useEffect(() => {
    if (renamingLayer !== null && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingLayer]);

  // ─── Context menu ──────────────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, layer: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ layer, x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  const handleContextRename = useCallback(() => {
    if (!contextMenu) return;
    startRename(contextMenu.layer);
    setContextMenu(null);
  }, [contextMenu, startRename]);

  const handleContextDelete = useCallback(() => {
    if (!contextMenu) return;
    dispatch(removeLayer({ layer: contextMenu.layer }));
    dispatch(cleanupRemovedLayer(contextMenu.layer));
    setContextMenu(null);
  }, [contextMenu, dispatch]);

  const handleContextHide = useCallback(() => {
    if (!contextMenu) return;
    dispatch(toggleLayerVisibility(contextMenu.layer));
    setContextMenu(null);
  }, [contextMenu, dispatch]);

  const handleContextLock = useCallback(() => {
    if (!contextMenu) return;
    const currentlyLocked = !!layerLocked[contextMenu.layer];
    dispatch(setLayerLocked({ layer: contextMenu.layer, locked: !currentlyLocked }));
    setContextMenu(null);
  }, [contextMenu, dispatch, layerLocked]);

  // ─── Drag-and-drop ─────────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, pieceId: string, sourceLayer: number) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ pieceId, sourceLayer }));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOverLayer = useCallback((e: React.DragEvent, layer: number) => {
    e.preventDefault();
    if (layerLocked[layer]) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.dataTransfer.dropEffect = 'move';
    setDragOverLayer(layer);
  }, [layerLocked]);

  const handleDragOverPiece = useCallback((e: React.DragEvent, pieceId: string, layer: number) => {
    e.preventDefault();
    if (layerLocked[layer]) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.dataTransfer.dropEffect = 'move';
    e.stopPropagation();
    setDragOverPieceId(pieceId);
    setDragOverLayer(layer);
  }, [layerLocked]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setDragOverLayer(null);
    setDragOverPieceId(null);
  }, []);

  const handleDropOnLayer = useCallback((e: React.DragEvent, targetLayer: number) => {
    e.preventDefault();
    setDragOverLayer(null);
    setDragOverPieceId(null);
    if (layerLocked[targetLayer]) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      const { pieceId, sourceLayer } = data as { pieceId: string; sourceLayer: number };
      if (sourceLayer !== targetLayer) {
        dispatch(setLayer({ pieceId, layer: targetLayer }));
      }
    } catch {
      // ignore bad drag data
    }
  }, [dispatch, layerLocked]);

  const handleDropOnPiece = useCallback((e: React.DragEvent, targetPieceId: string, targetLayer: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverLayer(null);
    setDragOverPieceId(null);
    if (layerLocked[targetLayer]) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      const { pieceId, sourceLayer } = data as { pieceId: string; sourceLayer: number };
      if (sourceLayer !== targetLayer) {
        dispatch(setLayer({ pieceId, layer: targetLayer }));
      } else {
        const draggedPiece = pieces.find(p => p.id === pieceId);
        const targetPiece = pieces.find(p => p.id === targetPieceId);
        if (draggedPiece && targetPiece && pieceId !== targetPieceId) {
          const dragSublayer = draggedPiece.sublayer ?? 0;
          const targetSublayer = targetPiece.sublayer ?? 0;
          dispatch(setSublayer({ pieceId, sublayer: targetSublayer }));
          dispatch(setSublayer({ pieceId: targetPieceId, sublayer: dragSublayer }));
        }
      }
    } catch {
      // ignore bad drag data
    }
  }, [dispatch, layerLocked, pieces]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="layer-panel">
      {/* Toolbar */}
      <div className="layer-panel-toolbar">
        <button onClick={handleAddLayer} title="Agregar capa">+ Capa</button>
        <button
          className={xrayMode ? 'active' : ''}
          onClick={handleToggleXray}
          title="Modo rayos X"
        >
          Rayos X
        </button>
        <button onClick={handleCollapseAll} title="Contraer/expandir todo">
          {allLayers.every(l => collapsed[l]) ? '\u25B6' : '\u25BC'}
        </button>
      </div>

      {/* Layer groups */}
      {allLayers.length === 0 && (
        <div className="layer-empty">Sin piezas en el proyecto</div>
      )}

      {allLayers.map(layerNum => {
        const layerPieces = (layerMap.get(layerNum) ?? [])
          .slice()
          .sort((a, b) => (b.sublayer ?? 0) - (a.sublayer ?? 0));
        const isCollapsed = !!collapsed[layerNum];
        const isHidden = hiddenLayerIds.includes(layerNum);
        const isLocked = !!layerLocked[layerNum];
        const displayName = getLayerDisplayName({ project: { layerNames } }, layerNum);
        const outlineColor = getOutlineColor(layerNum, layerOutlineColors);
        const isDropTarget = dragOverLayer === layerNum;

        return (
          <div
            key={layerNum}
            className={`layer-group${isDropTarget && !isLocked ? ' drop-target' : ''}${isDropTarget && isLocked ? ' drop-rejected' : ''}`}
          >
            {/* Header */}
            <div
              className="layer-group-header"
              onClick={() => setCollapsed(c => ({ ...c, [layerNum]: !c[layerNum] }))}
              onContextMenu={e => handleContextMenu(e, layerNum)}
              onDragOver={e => handleDragOverLayer(e, layerNum)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDropOnLayer(e, layerNum)}
            >
              <LayerColorPicker
                color={outlineColor}
                onChange={c => dispatch(setLayerOutlineColor({ layer: layerNum, color: c }))}
              />

              {renamingLayer === layerNum ? (
                <input
                  ref={renameInputRef}
                  className="layer-inline-rename"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingLayer(null);
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="layer-group-title"
                  onDoubleClick={e => { e.stopPropagation(); startRename(layerNum); }}
                >
                  {layerNum}: {displayName}
                </span>
              )}

              <span className="layer-group-count">{layerPieces.length}</span>

              <button
                className={`layer-icon-btn${isHidden ? '' : ' active'}`}
                onClick={e => { e.stopPropagation(); dispatch(toggleLayerVisibility(layerNum)); }}
                title={isHidden ? 'Mostrar capa' : 'Ocultar capa'}
              >
                {isHidden ? '\uD83D\uDE48' : '\uD83D\uDC41'}
              </button>

              <button
                className={`layer-icon-btn${isLocked ? ' active' : ''}`}
                onClick={e => {
                  e.stopPropagation();
                  dispatch(setLayerLocked({ layer: layerNum, locked: !isLocked }));
                }}
                title={isLocked ? 'Desbloquear capa' : 'Bloquear capa'}
              >
                {isLocked ? '\uD83D\uDD12' : '\uD83D\uDD13'}
              </button>

              <span className="layer-collapse-chevron">
                {isCollapsed ? '\u25B6' : '\u25BC'}
              </span>
            </div>

            {/* Piece rows */}
            {!isCollapsed && (
              <div className="layer-group-pieces">
                {layerPieces.length === 0 && (
                  <div className="layer-empty" style={{ padding: '4px 8px', fontSize: '10px' }}>
                    Capa vacía
                  </div>
                )}
                {layerPieces.map(piece => {
                  const isSelected = selectedIds.includes(piece.id);
                  const isPieceHidden = hiddenPieceIds.includes(piece.id);
                  const isDragTarget = dragOverPieceId === piece.id;

                  return (
                    <div
                      key={piece.id}
                      className={
                        'layer-piece-row' +
                        (isSelected ? ' selected' : '') +
                        (isDragTarget ? ' drag-over' : '')
                      }
                      draggable
                      onDragStart={e => handleDragStart(e, piece.id, piece.layer ?? 1)}
                      onDragOver={e => handleDragOverPiece(e, piece.id, layerNum)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => handleDropOnPiece(e, piece.id, layerNum)}
                      onClick={() => dispatch(selectPiece(piece.id))}
                    >
                      <span className="layer-piece-drag-handle" title="Arrastra para reordenar">
                        &#x2630;
                      </span>
                      <span className="layer-piece-name">{piece.name}</span>
                      {(piece.sublayer ?? 0) > 0 && (
                        <span className="layer-piece-sublayer">sub {piece.sublayer}</span>
                      )}
                      <button
                        className={`layer-icon-btn${!isPieceHidden ? ' active' : ''}`}
                        onClick={e => { e.stopPropagation(); dispatch(toggleHide3D(piece.id)); }}
                        title={isPieceHidden ? 'Mostrar pieza' : 'Ocultar pieza'}
                      >
                        {isPieceHidden ? '\uD83D\uDE48' : '\uD83D\uDC41'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Context menu. Se monta en <body>, no donde vive el árbol: LayerPanel
          se renderiza dentro de ContextPanel, que lleva
          `backdrop-filter: var(--surface-overlay-blur)` por la ley de
          materiales. Un backdrop-filter distinto de none es bloque contenedor
          de sus descendientes `position: fixed` — sin portal, este menú se
          posicionaba con coordenadas de viewport pero resolvía contra el
          panel (medido: 969px de desvío en X). Mismo patrón que ToolTooltip y
          ConnectionModal, por la misma razón. */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="layer-context-menu"
          data-superficie="menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={handleContextRename}>Renombrar capa</button>
          <button
            onClick={handleContextDelete}
            disabled={contextMenu.layer === 1}
            title={contextMenu.layer === 1 ? 'La capa 1 no se puede eliminar' : undefined}
          >
            Eliminar capa
          </button>
          <button onClick={handleContextHide}>
            {hiddenLayerIds.includes(contextMenu.layer) ? 'Mostrar capa' : 'Ocultar capa'}
          </button>
          <button onClick={handleContextLock}>
            {layerLocked[contextMenu.layer] ? 'Desbloquear capa' : 'Bloquear capa'}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
