import { useCallback, useMemo, useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import {
  closeMarker,
  movePiece,
  rotatePiece,
  selectPiece,
  deselectPiece,
  toggleGrid,
  setGridSpacing,
  setLayout,
  setFabricUtilization,
} from '../../store/markerSlice';
import { computeCuttingLayout } from '../../utils/export/cuttingLayout';
import type { CuttingLayoutConfig } from '../../utils/export/cuttingLayout';
import { exportCuttingPDF } from '../../utils/export/pdfCuttingExport';
import { computeCollisionFlags, computeUtilization } from '../../utils/export/markerCollision';
import MarkerPiece from './MarkerPiece';
import MarkerContextMenu, { type MarkerContextMenuState } from './MarkerContextMenu';

export default function MarkerEditor() {
  const dispatch = useDispatch();
  const marker = useSelector((s: RootState) => s.marker);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);
  const projectName = useSelector((s: RootState) => s.project.name);

  const { layout, paperWidth, paperHeight, margin, showGrid, gridSpacing, selectedPieceIndex, fabricUtilization } = marker;

  const [markerCtxMenu, setMarkerCtxMenu] = useState<MarkerContextMenuState>({
    visible: false, x: 0, y: 0, pieceIndex: null,
  });
  const markerCtxPageRef = useRef(0);

  // Collision detection per page
  const collisionMap = useMemo(() => {
    if (!layout) return new Map<string, boolean>();
    const map = new Map<string, boolean>();
    for (let pi = 0; pi < layout.pages.length; pi++) {
      const page = layout.pages[pi];
      const pageCollisions = computeCollisionFlags(page.pieces, paperWidth, paperHeight, margin);
      pageCollisions.forEach((collision, pieceIndex) => {
        map.set(`${pi}-${pieceIndex}`, collision);
      });
    }
    return map;
  }, [layout, paperWidth, paperHeight, margin]);

  const handleDrag = useCallback((pageIndex: number, pieceIndex: number, newPos: [number, number]) => {
    dispatch(movePiece({ pageIndex, pieceIndex, newPosition: newPos }));
    // Update utilization
    if (layout) {
      const page = layout.pages[pageIndex];
      if (page) {
        const util = computeUtilization(page.pieces, paperWidth, paperHeight, margin);
        dispatch(setFabricUtilization(util));
      }
    }
  }, [dispatch, layout, paperWidth, paperHeight, margin]);

  const handleRotate = useCallback((pageIndex: number, pieceIndex: number, degrees: number) => {
    dispatch(rotatePiece({ pageIndex, pieceIndex, degrees }));
  }, [dispatch]);

  const handleAutoNest = useCallback(() => {
    const config: CuttingLayoutConfig = {
      paperSize: marker.paperSize,
      margin: marker.margin,
      scale: marker.scale,
      includeSeamAllowance: marker.includeSeamAllowance,
      includeGrainline: true,
      includeNotches: true,
      includeLabels: true,
      tileToA4: false,
    };
    const newLayout = computeCuttingLayout(pieces, seams, config);
    dispatch(setLayout(newLayout));
  }, [dispatch, pieces, seams, marker.paperSize, marker.margin, marker.scale, marker.includeSeamAllowance]);

  const handleExportPDF = useCallback(async () => {
    if (!layout) return;
    const config: CuttingLayoutConfig = {
      paperSize: marker.paperSize,
      margin: marker.margin,
      scale: marker.scale,
      includeSeamAllowance: marker.includeSeamAllowance,
      includeGrainline: true,
      includeNotches: true,
      includeLabels: true,
      tileToA4: false,
    };
    await exportCuttingPDF(layout, config, `${projectName || 'pattern'}-cutting-layout.pdf`);
  }, [layout, marker, projectName]);

  const handleClose = useCallback(() => {
    dispatch(closeMarker());
  }, [dispatch]);

  const handleBackgroundClick = useCallback(() => {
    dispatch(deselectPiece());
  }, [dispatch]);

  const handlePieceContextMenu = useCallback((pageIndex: number, pieceIndex: number, e: React.MouseEvent) => {
    const piece = layout?.pages[pageIndex]?.pieces[pieceIndex];
    setMarkerCtxMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      pieceIndex,
      pieceName: piece?.pieceName,
    });
    markerCtxPageRef.current = pageIndex;
  }, [layout]);

  if (!marker.isOpen || !layout) return null;

  const viewBoxPadding = 20;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: '#1e1e1e',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Toolbar */}
      <div style={{
        height: 42,
        background: '#2d2d2d',
        borderBottom: '1px solid #444',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 12px',
        color: '#ccc',
        fontSize: 12,
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600 }}>Marker Editor</span>
        <span style={{ color: '#888' }}>
          {marker.paperSize} ({paperWidth}×{paperHeight}mm)
        </span>
        <div style={{ width: 1, height: 20, background: '#555' }} />

        <button onClick={handleAutoNest} style={toolbarBtn}>🔄 Auto Nest</button>

        <button
          onClick={() => {
            if (selectedPieceIndex) {
              dispatch(rotatePiece({ pageIndex: selectedPieceIndex.page, pieceIndex: selectedPieceIndex.piece, degrees: 90 }));
            }
          }}
          disabled={!selectedPieceIndex}
          style={toolbarBtn}
        >
          ↻ Rotate 90°
        </button>

        <div style={{ width: 1, height: 20, background: '#555' }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={showGrid} onChange={() => dispatch(toggleGrid())} />
          Grid
        </label>
        {showGrid && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="number"
              value={gridSpacing}
              onChange={e => dispatch(setGridSpacing(Number(e.target.value)))}
              style={{ width: 40, background: '#333', color: '#ccc', border: '1px solid #555', borderRadius: 2, padding: '1px 4px' }}
              min={1}
              max={100}
            />
            mm
          </label>
        )}

        <div style={{ flex: 1 }} />

        <span style={{
          color: fabricUtilization > 0.7 ? '#4caf50' : fabricUtilization > 0.4 ? '#ff9800' : '#e53935',
          fontWeight: 600,
        }}>
          Utilization: {(fabricUtilization * 100).toFixed(1)}%
        </span>

        <div style={{ width: 1, height: 20, background: '#555' }} />
        <button onClick={handleExportPDF} style={toolbarBtn}>📄 Export PDF</button>
        <button onClick={handleClose} style={{ ...toolbarBtn, color: '#e57373' }}>✕ Close</button>
      </div>

      {/* Canvas area */}
      <div style={{ flex: 1, overflow: 'auto', background: '#2a2a2a', padding: 16 }}>
        {layout.pages.map((page, pageIndex) => (
          <div key={pageIndex} style={{ marginBottom: 24 }}>
            <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>
              Page {page.pageNumber} — {page.pieces.length} piece{page.pieces.length !== 1 ? 's' : ''}
            </div>
            <svg
              viewBox={`${-viewBoxPadding} ${-viewBoxPadding} ${paperWidth + viewBoxPadding * 2} ${paperHeight + viewBoxPadding * 2}`}
              style={{
                width: '100%',
                maxHeight: '80vh',
                background: '#f5f5f0',
                border: '1px solid #444',
                borderRadius: 4,
              }}
              onMouseDown={handleBackgroundClick}
            >
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="#666" />
                </marker>
              </defs>

              {/* Paper boundary */}
              <rect x={0} y={0} width={paperWidth} height={paperHeight} fill="white" stroke="#999" strokeWidth={0.5} />

              {/* Margin boundary */}
              <rect
                x={margin}
                y={margin}
                width={paperWidth - 2 * margin}
                height={paperHeight - 2 * margin}
                fill="none"
                stroke="#ccc"
                strokeWidth={0.3}
                strokeDasharray="4 3"
              />

              {/* Grid */}
              {showGrid && gridSpacing > 0 && (
                <g stroke="#e0e0e0" strokeWidth={0.15}>
                  {Array.from({ length: Math.floor(paperWidth / gridSpacing) + 1 }, (_, i) => {
                    const x = i * gridSpacing;
                    return <line key={`v${i}`} x1={x} y1={0} x2={x} y2={paperHeight} />;
                  })}
                  {Array.from({ length: Math.floor(paperHeight / gridSpacing) + 1 }, (_, i) => {
                    const y = i * gridSpacing;
                    return <line key={`h${i}`} x1={0} y1={y} x2={paperWidth} y2={y} />;
                  })}
                </g>
              )}

              {/* Pieces */}
              {page.pieces.map((piece, pieceIndex) => (
                <MarkerPiece
                  key={`${piece.pieceId}-${pieceIndex}`}
                  piece={piece}
                  index={pieceIndex}
                  isSelected={selectedPieceIndex?.page === pageIndex && selectedPieceIndex?.piece === pieceIndex}
                  hasCollision={collisionMap.get(`${pageIndex}-${pieceIndex}`) ?? false}
                  onSelect={(idx) => dispatch(selectPiece({ page: pageIndex, piece: idx }))}
                  onDrag={(idx, pos) => handleDrag(pageIndex, idx, pos)}
                  onRotate={(idx, deg) => handleRotate(pageIndex, idx, deg)}
                  onContextMenu={(idx, e) => handlePieceContextMenu(pageIndex, idx, e)}
                  gridSnap={showGrid ? gridSpacing : undefined}
                />
              ))}
            </svg>
          </div>
        ))}
      </div>

      <MarkerContextMenu
        menu={markerCtxMenu}
        onClose={() => setMarkerCtxMenu(m => ({ ...m, visible: false }))}
        onRotate={(deg) => {
          if (markerCtxMenu.pieceIndex !== null) {
            dispatch(rotatePiece({ pageIndex: markerCtxPageRef.current, pieceIndex: markerCtxMenu.pieceIndex, degrees: deg }));
          }
        }}
        onFlipH={() => {
          // Marker flip not yet implemented in markerSlice
        }}
        onSelect={() => {
          if (markerCtxMenu.pieceIndex !== null) {
            dispatch(selectPiece({ page: markerCtxPageRef.current, piece: markerCtxMenu.pieceIndex }));
          }
        }}
      />
    </div>
  );
}

const toolbarBtn: React.CSSProperties = {
  background: '#3a3a3a',
  color: '#ccc',
  border: '1px solid #555',
  borderRadius: 3,
  padding: '3px 10px',
  cursor: 'pointer',
  fontSize: 12,
};
