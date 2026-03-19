import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece, removePiece, unlinkPieces, setLayer, setSublayer } from '../../store/projectSlice';
import { clearSelection, selectPiece } from '../../store/editorSlice';
import type { NotchShape, NotchOptions } from '../../types/types';
import type { PatternPiece } from '../../types/types';
import PropertySection from './PropertySection';

interface PiecePropertiesProps {
  piece: PatternPiece;
  collapsed: boolean;
  onToggle: (id: string) => void;
}

export default function PieceProperties({ piece, collapsed, onToggle }: PiecePropertiesProps) {
  const dispatch = useDispatch();
  const fabrics = useSelector((s: RootState) => s.project.fabrics);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const [notchSettings, setNotchSettings] = useState<NotchOptions>({
    shape: 'slit', subType: 'straightforward', length: 8, width: 3, angle: 0, count: 1,
  });

  const handleDeletePiece = () => {
    dispatch(removePiece(piece.id));
    dispatch(clearSelection());
  };

  return (
    <>
    <PropertySection id="piece" title="PIECE" collapsed={collapsed} onToggle={onToggle}>
      <div className="panel-field">
        <label>Name</label>
        <input
          type="text"
          className="panel-input"
          value={piece.name}
          onChange={e => dispatch(updatePiece({ ...piece, name: e.target.value, updatedAt: Date.now() }))}
        />
      </div>
      <div className="panel-field">
        <label>Seam (mm)</label>
        <input
          type="number"
          className="panel-input narrow"
          value={piece.seamAllowance}
          min={0}
          max={50}
          onChange={e => dispatch(updatePiece({ ...piece, seamAllowance: Number(e.target.value), updatedAt: Date.now() }))}
        />
      </div>
      <div className="panel-field" style={{ flexWrap: 'wrap', gap: 4 }}>
        <label>SA Presets</label>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {([['Overlock', 8], ['Standard', 10], ['Flat-felled', 12], ['French', 15]] as const).map(([label, width]) => (
            <button
              key={label}
              className="panel-labeled-btn"
              style={{ fontSize: 10, padding: '2px 6px' }}
              onClick={() => dispatch(updatePiece({ ...piece, seamAllowance: width, updatedAt: Date.now() }))}
              title={`${label}: ${width}mm`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-field">
        <label>Fabric</label>
        <select
          className="panel-input"
          value={piece.fabricId || ''}
          onChange={e => dispatch(updatePiece({ ...piece, fabricId: e.target.value || undefined, updatedAt: Date.now() }))}
        >
          <option value="">None</option>
          {fabrics.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>
      <div className="panel-field">
        <label>Mirror</label>
        <input
          type="checkbox"
          checked={piece.mirrored}
          onChange={() => dispatch(updatePiece({ ...piece, mirrored: !piece.mirrored, updatedAt: Date.now() }))}
        />
      </div>
      {/* Linked Editing */}
      {piece.linkedPieceId && (
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Linked Editing</div>
          <div style={{ fontSize: 12, marginBottom: 6 }}>
            <span style={{ color: piece.linkMode === 'symmetry' ? '#64b5f6' : '#aed581' }}>
              {piece.linkMode === 'symmetry' ? 'Symmetry' : 'Instance'}
            </span>
            {' linked to '}
            <span
              style={{ color: '#4a9eff', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => dispatch(selectPiece(piece.linkedPieceId!))}
            >
              {pieces.find(p => p.id === piece.linkedPieceId)?.name || piece.linkedPieceId}
            </span>
          </div>
          <button
            className="panel-delete"
            onClick={() => dispatch(unlinkPieces({ pieceId: piece.id }))}
            style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)' }}
          >
            Remove Linked Editing
          </button>
        </div>
      )}
      <button className="panel-delete" onClick={handleDeletePiece}>
        Delete Piece
      </button>

      {/* Notch Settings */}
      <div className="notch-settings" style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notch Settings</div>
        <div className="panel-field">
          <label>Shape</label>
          <select
            className="panel-input"
            value={notchSettings.shape}
            onChange={e => setNotchSettings(s => ({ ...s, shape: e.target.value as NotchShape }))}
          >
            <option value="slit">Slit</option>
            <option value="t-notch">T-Notch</option>
            <option value="v-internal">V-Internal</option>
            <option value="v-external">V-External</option>
            <option value="u-notch">U-Notch</option>
            <option value="castle">Castle</option>
            <option value="diamond">Diamond</option>
          </select>
        </div>
        <div className="panel-field">
          <label>Length (mm)</label>
          <input type="number" className="panel-input narrow" value={notchSettings.length} min={1} max={30}
            onChange={e => setNotchSettings(s => ({ ...s, length: Number(e.target.value) }))} />
        </div>
        <div className="panel-field">
          <label>Width (mm)</label>
          <input type="number" className="panel-input narrow" value={notchSettings.width} min={1} max={20}
            onChange={e => setNotchSettings(s => ({ ...s, width: Number(e.target.value) }))} />
        </div>
        <div className="panel-field">
          <label>Count</label>
          <select className="panel-input" value={notchSettings.count}
            onChange={e => setNotchSettings(s => ({ ...s, count: Number(e.target.value) as 1 | 2 | 3 }))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
      </div>
    </PropertySection>

    <PropertySection id="layer" title="LAYER" collapsed={collapsed} onToggle={onToggle}>
      <div className="panel-field">
        <label>Layer</label>
        <input
          type="number"
          className="panel-input narrow"
          value={piece.layer ?? 1}
          min={0}
          max={9}
          onChange={e => dispatch(setLayer({ pieceId: piece.id, layer: Number(e.target.value) }))}
        />
      </div>
      <div className="panel-field">
        <label>Sublayer</label>
        <input
          type="number"
          className="panel-input narrow"
          value={piece.sublayer ?? 0}
          min={0}
          max={9}
          onChange={e => dispatch(setSublayer({ pieceId: piece.id, sublayer: Number(e.target.value) }))}
        />
      </div>
    </PropertySection>
    </>
  );
}
