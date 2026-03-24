import { useState, useEffect } from 'react';
import './CalibrationModal.css';

interface CalibrationModalProps {
  pixelDistance: number;
  onConfirm: (realWorldMm: number) => void;
  onCancel: () => void;
}

export default function CalibrationModal({
  pixelDistance,
  onConfirm,
  onCancel,
}: CalibrationModalProps) {
  const [value, setValue] = useState(100);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && value > 0) {
        onConfirm(value);
      } else if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [value, onConfirm, onCancel]);

  return (
    <div className="calibration-overlay" onClick={onCancel}>
      <div className="calibration-modal" onClick={e => e.stopPropagation()}>
        <h3>Scale Calibration</h3>
        <p>Measured distance: {pixelDistance.toFixed(1)} pixels</p>
        <div className="calibration-input-row">
          <label>Real-world distance (mm):</label>
          <input
            type="number"
            min={0.1}
            step={0.1}
            autoFocus
            value={value}
            onChange={e => setValue(Number(e.target.value))}
          />
        </div>
        <div className="calibration-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            onClick={() => onConfirm(value)}
            disabled={value <= 0}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
