import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece, removePiece, updateMeasurements } from '../../store/projectSlice';
import { toggleSimulation, toggleSeamAllowance, toggleGrainlines, toggleSnapToGrid, clearSelection } from '../../store/editorSlice';
import './PropertiesPanel.css';

export default function PropertiesPanel() {
  const dispatch = useDispatch();
  const { pieces, fabrics, avatar } = useSelector((s: RootState) => s.project);
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

      {/* Avatar */}
      <section className="panel-section">
        <h3 className="panel-title">Avatar</h3>
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
