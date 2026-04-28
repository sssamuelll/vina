import { useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { selectPiece } from '../../store/editorSlice';
import { addPiece } from '../../store/projectSlice';
import { parseDXF, dxfToPatternPieces } from '../../utils/dxf';
import type { PatternPiece } from '../../types/types';
import './views.css';
import { newId } from '../../utils/ids';

// ─── Collapsible Section ───

interface SectionProps {
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, badge, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sidebar-section">
      <button className="sidebar-section-header" onClick={() => setOpen(!open)}>
        <span className="sidebar-section-toggle">{open ? '▾' : '▸'}</span>
        <span className="sidebar-section-title">{title}</span>
        {badge != null && <span className="sidebar-section-badge">({badge})</span>}
      </button>
      <div className={`sidebar-section-body${open ? '' : ' collapsed'}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Piece Visibility / Lock State (local UI state, not persisted) ───

interface PieceUIState {
  visible: boolean;
  locked: boolean;
}

export default function PatternExplorerView() {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local UI-only state for visibility/lock per piece
  const [pieceUI, setPieceUI] = useState<Record<string, PieceUIState>>({});

  const getUI = (id: string): PieceUIState =>
    pieceUI[id] ?? { visible: true, locked: false };

  const toggleVisibility = useCallback((id: string) => {
    setPieceUI(prev => ({
      ...prev,
      [id]: { ...getUIFromMap(prev, id), visible: !getUIFromMap(prev, id).visible },
    }));
  }, []);

  const toggleLock = useCallback((id: string) => {
    setPieceUI(prev => ({
      ...prev,
      [id]: { ...getUIFromMap(prev, id), locked: !getUIFromMap(prev, id).locked },
    }));
  }, []);

  const handleSelectPiece = useCallback((id: string) => {
    dispatch(selectPiece(id));
  }, [dispatch]);

  const handleAddPiece = useCallback(() => {
    const newPiece: PatternPiece = {
      id: newId(),
      name: `Piece ${pieces.length + 1}`,
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
      internals: [],
      position: { x: 50, y: 50 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      layer: 1,
      sublayer: 0,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    dispatch(addPiece(newPiece));
  }, [dispatch, pieces.length]);

  const handleImportDXF = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const doc = parseDXF(text);
    const dxfPieces = dxfToPatternPieces(doc);
    for (const piece of dxfPieces) {
      dispatch(addPiece(piece));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [dispatch]);

  const selectedPiece = pieces.find(p => selectedPieceIds.includes(p.id));

  // Find grainline angle for selected piece
  const grainline = selectedPiece?.internals.find(il => il.type === 'grainline');
  const notch = selectedPiece?.internals.find(il => il.type === 'notch');

  return (
    <div className="sidebar-view">
      <div className="sidebar-view-header">
        <div className="sidebar-view-header-actions">
          <button onClick={handleAddPiece} title="Add Piece">+</button>
          <button onClick={handleImportDXF} title="Import DXF">↓</button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".dxf"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <div className="sidebar-view-content">
        <Section title="Pieces" badge={pieces.length}>
          {pieces.length === 0 ? (
            <div className="sidebar-info">No pieces yet. Add a piece or import DXF.</div>
          ) : (
            pieces.map(piece => {
              const ui = getUI(piece.id);
              const isSelected = selectedPieceIds.includes(piece.id);
              return (
                <div key={piece.id}>
                  <div
                    className={`sidebar-list-item${isSelected ? ' selected' : ''}`}
                    onClick={() => handleSelectPiece(piece.id)}
                  >
                    <span className="sidebar-list-item-label">{piece.name}</span>
                    <div className="sidebar-list-item-actions" style={{ opacity: 1 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleVisibility(piece.id); }}
                        title={ui.visible ? 'Hide' : 'Show'}
                        style={{ opacity: ui.visible ? 1 : 0.4 }}
                      >
                        👁
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLock(piece.id); }}
                        title={ui.locked ? 'Unlock' : 'Lock'}
                        style={{ opacity: ui.locked ? 1 : 0.4 }}
                      >
                        🔒
                      </button>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="sidebar-properties">
                      <div className="sidebar-property-row">
                        <span className="sidebar-property-label">Name</span>
                        <span className="sidebar-property-value">{piece.name}</span>
                      </div>
                      <div className="sidebar-property-row">
                        <span className="sidebar-property-label">SA</span>
                        <span className="sidebar-property-value">{piece.seamAllowance}mm</span>
                      </div>
                      <div className="sidebar-property-row">
                        <span className="sidebar-property-label">Notch</span>
                        <span className="sidebar-property-value">
                          {notch?.notchOptions?.shape ?? 'none'}
                        </span>
                      </div>
                      <div className="sidebar-property-row">
                        <span className="sidebar-property-label">Grainline</span>
                        <span className="sidebar-property-value">
                          {grainline ? `${piece.rotation}°` : '—'}
                        </span>
                      </div>
                      <div className="sidebar-property-row">
                        <span className="sidebar-property-label">Mirror</span>
                        <span className="sidebar-property-value">
                          {piece.mirrored ? '✓' : '✕'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </Section>

        <Section title="Seams" badge={seams.length} defaultOpen={false}>
          {seams.length === 0 ? (
            <div className="sidebar-info">No seam connections defined.</div>
          ) : (
            seams.map(seam => {
              const pieceA = pieces.find(p => p.id === seam.pieceA.pieceId);
              const pieceB = pieces.find(p => p.id === seam.pieceB.pieceId);
              return (
                <div key={seam.id} className="sidebar-list-item">
                  <span className="sidebar-list-item-label">
                    {pieceA?.name ?? '?'} → {pieceB?.name ?? '?'}
                  </span>
                  <span style={{ fontSize: 10, color: '#888' }}>{seam.type}</span>
                </div>
              );
            })
          )}
        </Section>
      </div>
    </div>
  );
}

// Helper to safely read from the pieceUI map
function getUIFromMap(
  map: Record<string, PieceUIState>,
  id: string,
): PieceUIState {
  return map[id] ?? { visible: true, locked: false };
}
