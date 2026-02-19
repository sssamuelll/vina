import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece, removePiece, updateMeasurements, setAvatarMode, setAvatarModelUrl, removeSeam } from '../../store/projectSlice';
import { toggleSimulation, toggleSeamAllowance, toggleGrainlines, toggleSnapToGrid, clearSelection, selectSeam } from '../../store/editorSlice';
import { downloadDXF } from '../../utils/exportDXF';
import { downloadPDF } from '../../utils/exportPDF';
import './PropertiesPanel.css';

export default function PropertiesPanel() {
  const dispatch = useDispatch();
  const { pieces, seams, fabrics, avatar, avatarMode, avatarModelUrl } = useSelector((s: RootState) => s.project);
  const editor = useSelector((s: RootState) => s.editor);
  const selectedPiece = pieces.find(p => editor.selectedPieceIds.includes(p.id));

  const handleDeletePiece = () => {
    if (selectedPiece) {
      dispatch(removePiece(selectedPiece.id));
      dispatch(clearSelection());
    }
  };

  return (
    <div className="properties-panel">
      {/* Piece properties */}
      {selectedPiece ? (
        <section className="panel-section">
          <h3 className="panel-title">Piece</h3>
          <div className="panel-field">
            <label>Name</label>
            <input
              type="text"
              className="panel-input"
              value={selectedPiece.name}
              onChange={e => dispatch(updatePiece({ ...selectedPiece, name: e.target.value, updatedAt: new Date() }))}
            />
          </div>
          <div className="panel-field">
            <label>Seam (mm)</label>
            <input
              type="number"
              className="panel-input narrow"
              value={selectedPiece.seamAllowance}
              min={0}
              max={50}
              onChange={e => dispatch(updatePiece({ ...selectedPiece, seamAllowance: Number(e.target.value), updatedAt: new Date() }))}
            />
          </div>
          <div className="panel-field">
            <label>Fabric</label>
            <select
              className="panel-input"
              value={selectedPiece.fabricId || ''}
              onChange={e => dispatch(updatePiece({ ...selectedPiece, fabricId: e.target.value || undefined, updatedAt: new Date() }))}
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
              checked={selectedPiece.mirrored}
              onChange={() => dispatch(updatePiece({ ...selectedPiece, mirrored: !selectedPiece.mirrored, updatedAt: new Date() }))}
            />
          </div>
          <button className="panel-delete" onClick={handleDeletePiece}>
            ✕ Delete Piece
          </button>
        </section>
      ) : (
        <section className="panel-section">
          <h3 className="panel-title">Project</h3>
          <div className="panel-field">
            <label>Pieces</label>
            <span>{pieces.length}</span>
          </div>
          <div className="panel-field">
            <label>Fabrics</label>
            <span>{fabrics.length}</span>
          </div>
        </section>
      )}

      {/* Seams */}
      {seams.length > 0 && (
        <section className="panel-section">
          <h3 className="panel-title">Seams ({seams.length})</h3>
          {seams.map(seam => {
            const pA = pieces.find(p => p.id === seam.pieceA.pieceId);
            const pB = pieces.find(p => p.id === seam.pieceB.pieceId);
            const isSelected = editor.selectedSeamId === seam.id;
            return (
              <div
                key={seam.id}
                className={`seam-item ${isSelected ? 'selected' : ''}`}
                onClick={() => dispatch(selectSeam(seam.id))}
              >
                <span className="seam-label">
                  {pA?.name || '?'} ↔ {pB?.name || '?'}
                </span>
                <span className="seam-type">{seam.type}</span>
                <button
                  className="seam-delete"
                  onClick={(e) => { e.stopPropagation(); dispatch(removeSeam(seam.id)); }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </section>
      )}

      {/* Avatar */}
      <section className="panel-section">
        <h3 className="panel-title">Avatar</h3>
        <div className="avatar-mode-toggle">
          <button
            className={`mode-btn ${avatarMode === 'dressform' ? 'active' : ''}`}
            onClick={() => dispatch(setAvatarMode('dressform'))}
          >
            Dress Form
          </button>
          <button
            className={`mode-btn ${avatarMode === 'model' ? 'active' : ''}`}
            onClick={() => {
              if (avatarModelUrl) dispatch(setAvatarMode('model'));
            }}
            style={{ opacity: avatarModelUrl ? 1 : 0.4 }}
          >
            3D Model
          </button>
        </div>

        {/* Load GLB/GLTF */}
        <div className="panel-field" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Load GLB / GLTF avatar
          </label>
          <input
            type="file"
            accept=".glb,.gltf"
            className="file-input"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) {
                const url = URL.createObjectURL(file);
                dispatch(setAvatarModelUrl(url));
              }
            }}
          />
          {avatarModelUrl && (
            <span style={{ fontSize: 10, color: 'var(--accent)' }}>✓ Model loaded</span>
          )}
        </div>

        {/* URL input for remote models */}
        <div className="panel-field" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, marginTop: 8 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Or paste URL (ReadyPlayerMe, MakeHuman...)
          </label>
          <input
            type="text"
            className="panel-input"
            style={{ width: '100%' }}
            placeholder="https://...model.glb"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const url = (e.target as HTMLInputElement).value.trim();
                if (url) dispatch(setAvatarModelUrl(url));
              }
            }}
          />
        </div>

        {/* Measurements (always visible, used for dress form) */}
        {avatarMode === 'dressform' && (
          <div style={{ marginTop: 12 }}>
            {(['height', 'chest', 'waist', 'hips', 'shoulder', 'armLength', 'inseam'] as const).map(key => (
              <div className="panel-field" key={key}>
                <label>{key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}</label>
                <div className="panel-input-unit">
                  <input
                    type="number"
                    className="panel-input narrow"
                    value={avatar.measurements[key]}
                    onChange={e => dispatch(updateMeasurements({ [key]: Number(e.target.value) }))}
                  />
                  <span className="unit">cm</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Display */}
      <section className="panel-section">
        <h3 className="panel-title">Display</h3>
        <label className="panel-toggle">
          <input type="checkbox" checked={editor.showSeamAllowance} onChange={() => dispatch(toggleSeamAllowance())} />
          Seam allowance
        </label>
        <label className="panel-toggle">
          <input type="checkbox" checked={editor.showGrainlines} onChange={() => dispatch(toggleGrainlines())} />
          Grainlines
        </label>
        <label className="panel-toggle">
          <input type="checkbox" checked={editor.snapToGrid} onChange={() => dispatch(toggleSnapToGrid())} />
          Snap to grid
        </label>
      </section>

      {/* Export */}
      {pieces.length > 0 && (
        <section className="panel-section">
          <h3 className="panel-title">Export</h3>
          <div className="export-buttons">
            <button
              className="export-btn"
              onClick={() => downloadDXF(pieces)}
              title="Download DXF for cutting plotters"
            >
              📐 DXF
            </button>
            <button
              className="export-btn"
              onClick={() => downloadPDF(pieces)}
              title="Download PDF at 1:1 scale"
            >
              📄 PDF
            </button>
          </div>
        </section>
      )}

      {/* Simulation */}
      <section className="panel-section">
        <button
          className={`sim-button ${editor.simulationRunning ? 'running' : ''}`}
          onClick={() => dispatch(toggleSimulation())}
        >
          {editor.simulationRunning ? '⏸ Pause Simulation' : '▶ Start Simulation'}
        </button>
      </section>
    </div>
  );
}
