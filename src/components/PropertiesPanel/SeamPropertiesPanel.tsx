import { useDispatch } from 'react-redux';
import { updateSeam, setSeamTension, deactivateSeam, removeSeam, reverseSeam } from '../../store/projectSlice';
import type { Seam } from '../../types/types';
import PropertySection from './PropertySection';

interface SeamPropertiesPanelProps {
  seam: Seam;
  pieceAName: string;
  pieceBName: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
}

export default function SeamPropertiesPanel({ seam, pieceAName, pieceBName, collapsed, onToggle }: SeamPropertiesPanelProps) {
  const dispatch = useDispatch();

  return (
    <PropertySection id="seam-props" title={`SEAM: ${pieceAName} ↔ ${pieceBName}`} collapsed={collapsed} onToggle={onToggle}>
      {/* Type dropdown */}
      <div className="panel-field">
        <label>Type</label>
        <select
          className="panel-input"
          value={seam.type}
          onChange={e => dispatch(updateSeam({ ...seam, type: e.target.value as Seam['type'] }))}
        >
          <option value="standard">Standard</option>
          <option value="french">French</option>
          <option value="flat-felled">Flat-felled</option>
          <option value="overlock">Overlock</option>
        </select>
      </div>

      {/* Tension slider */}
      <div className="panel-field">
        <label>
          Tension{' '}
          {seam.tension < 100
            ? <span className="panel-tension-tag panel-tension-tag--gather">(Gathering)</span>
            : seam.tension > 100
            ? <span className="panel-tension-tag panel-tension-tag--ease">(Easing)</span>
            : null}
        </label>
        <input
          type="range" className="panel-slider"
          min={10} max={200} value={seam.tension}
          onChange={e => dispatch(setSeamTension({ seamId: seam.id, tension: Number(e.target.value) }))}
        />
        <span className="panel-value">{seam.tension}%</span>
      </div>

      {/* Shrinkage / Gathering slider (CLO3D parity) */}
      <div className="panel-field">
        <label>Shrinkage</label>
        <input
          type="range" className="panel-slider"
          min={0} max={90} value={Math.max(0, 100 - seam.tension)}
          onChange={e => dispatch(setSeamTension({ seamId: seam.id, tension: 100 - Number(e.target.value) }))}
        />
        <span className="panel-value">{Math.max(0, 100 - seam.tension)}%</span>
      </div>

      {/* Strength slider */}
      <div className="panel-field">
        <label>Strength</label>
        <input
          type="range" className="panel-slider"
          min={1} max={100} value={Math.round(seam.strength * 100)}
          onChange={e => dispatch(setSeamTension({ seamId: seam.id, tension: seam.tension, strength: Number(e.target.value) / 100 }))}
        />
        <span className="panel-value">{seam.strength.toFixed(2)}</span>
      </div>

      {/* Tape toggle */}
      <div className="panel-field">
        <label>
          <input
            type="checkbox" checked={seam.taped}
            onChange={e => dispatch(updateSeam({ ...seam, taped: e.target.checked }))}
          />{' '}
          Taped
        </label>
        {seam.taped && (
          <input
            type="number" className="panel-input narrow"
            value={seam.tapeWidth} min={3} max={30}
            onChange={e => dispatch(updateSeam({ ...seam, tapeWidth: Number(e.target.value) }))}
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="panel-action-row">
        <button
          className={`panel-chip-btn ${seam.active ? 'panel-chip-btn--destructive' : 'panel-chip-btn--success'}`}
          onClick={() => dispatch(deactivateSeam({ seamId: seam.id, active: !seam.active }))}
        >
          {seam.active ? 'Deactivate' : 'Activate'}
        </button>
        <button
          className="panel-chip-btn"
          onClick={() => dispatch(reverseSeam(seam.id))}
        >
          Reverse
        </button>
        <button
          className="panel-chip-btn panel-chip-btn--destructive"
          onClick={() => dispatch(removeSeam(seam.id))}
        >
          Delete
        </button>
      </div>
    </PropertySection>
  );
}
