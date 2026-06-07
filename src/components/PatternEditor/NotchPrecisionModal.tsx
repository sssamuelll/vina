import { useState, useEffect } from 'react';
import './NotchPrecisionModal.css';

/**
 * Click-then-refine precision modal (notch-precision F3, D-4).
 *
 * The click already placed the notch; this modal offers exact numeric
 * placement: arc distance from the anchor's reference corner (marked on
 * the canvas) + notch depth — the workflow a patternmaker needs so the
 * piquete coincides with its pair on another piece. Enter confirms,
 * Escape keeps the clicked placement.
 */
interface NotchPrecisionModalProps {
  initialDistanceMm: number;
  initialDepthMm: number;
  onConfirm: (distanceMm: number, depthMm: number) => void;
  onCancel: () => void;
}

export default function NotchPrecisionModal({
  initialDistanceMm,
  initialDepthMm,
  onConfirm,
  onCancel,
}: NotchPrecisionModalProps) {
  const [distance, setDistance] = useState(() => Number(initialDistanceMm.toFixed(1)));
  const [depth, setDepth] = useState(initialDepthMm);
  const valid = distance >= 0 && depth > 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && valid) {
        onConfirm(distance, depth);
      } else if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [distance, depth, valid, onConfirm, onCancel]);

  return (
    <div className="notch-precision-overlay" onClick={onCancel}>
      <div className="notch-precision-modal" onClick={e => e.stopPropagation()}>
        <h3>Notch placement</h3>
        <p>Distance is measured along the outline from the marked corner.</p>
        <div className="notch-precision-input-row">
          <label htmlFor="notch-distance">Distance from corner (mm):</label>
          <input
            id="notch-distance"
            type="number"
            min={0}
            step={0.5}
            autoFocus
            value={distance}
            onChange={e => setDistance(Number(e.target.value))}
            onFocus={e => e.target.select()}
          />
        </div>
        <div className="notch-precision-input-row">
          <label htmlFor="notch-depth">Depth (mm):</label>
          <input
            id="notch-depth"
            type="number"
            min={1}
            max={20}
            step={0.5}
            value={depth}
            onChange={e => setDepth(Number(e.target.value))}
            onFocus={e => e.target.select()}
          />
        </div>
        <div className="notch-precision-actions">
          <button onClick={onCancel}>Keep click</button>
          <button
            className="primary"
            onClick={() => onConfirm(distance, depth)}
            disabled={!valid}
          >
            Place exactly
          </button>
        </div>
      </div>
    </div>
  );
}
