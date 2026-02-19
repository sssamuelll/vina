import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { toggleSimulation, toggleSeamAllowance, toggleGrainlines, toggleSnapToGrid } from '../../store/editorSlice';
import './PropertiesPanel.css';

export default function PropertiesPanel() {
  const dispatch = useDispatch();
  const { pieces, fabrics, avatar } = useSelector((s: RootState) => s.project);
  const editor = useSelector((s: RootState) => s.editor);
  const selectedPiece = pieces.find(p => editor.selectedPieceIds.includes(p.id));

  return (
    <div className="properties-panel">
      {/* Piece properties */}
      {selectedPiece ? (
        <section className="panel-section">
          <h3 className="panel-title">Piece</h3>
          <div className="panel-field">
            <label>Name</label>
            <span>{selectedPiece.name}</span>
          </div>
          <div className="panel-field">
            <label>Seam Allowance</label>
            <span>{selectedPiece.seamAllowance} mm</span>
          </div>
          <div className="panel-field">
            <label>Fabric</label>
            <span>{fabrics.find(f => f.id === selectedPiece.fabricId)?.name || 'None'}</span>
          </div>
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
        <div className="panel-field">
          <label>Height</label>
          <span>{avatar.measurements.height} cm</span>
        </div>
        <div className="panel-field">
          <label>Chest</label>
          <span>{avatar.measurements.chest} cm</span>
        </div>
        <div className="panel-field">
          <label>Waist</label>
          <span>{avatar.measurements.waist} cm</span>
        </div>
        <div className="panel-field">
          <label>Hips</label>
          <span>{avatar.measurements.hips} cm</span>
        </div>
      </section>

      {/* Display options */}
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
