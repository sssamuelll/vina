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
    <div className="calibration-overlay" data-material="papel" onClick={onCancel}>
      <div
        className="calibration-modal"
        data-superficie="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Calibración de escala"
        onClick={e => e.stopPropagation()}
      >
        <h3>Calibración de escala</h3>
        <p>Distancia medida: {pixelDistance.toFixed(1)} píxeles</p>
        <div className="calibration-input-row">
          <label>Distancia real (mm):</label>
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
          <button onClick={onCancel}>Cancelar</button>
          <button
            className="primary"
            onClick={() => onConfirm(value)}
            disabled={value <= 0}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
