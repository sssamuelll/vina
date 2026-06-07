import { useState, useEffect } from 'react';
import './NotchPrecisionModal.css';

/**
 * Click-then-refine precision panel (notch-precision F3, D-4).
 *
 * The click already placed the notch; this panel offers exact numeric
 * placement: arc distance from the anchor's reference corner (marked on
 * the canvas) + notch depth — the workflow a patternmaker needs so the
 * piquete coincides with its pair on another piece. Enter confirms,
 * Escape keeps the clicked placement.
 *
 * Deliberately NOT a blocking dialog (review findings #4/#6): no scrim,
 * floating at the right edge — the canvas stays visible and interactive
 * so the corner marker and the live preview ghost can be read (and the
 * user can pan/zoom to verify) while editing.
 */
interface NotchPrecisionModalProps {
  initialDistanceMm: number;
  initialDepthMm: number;
  /** Outline perimeter — distances beyond this would wrap around the piece. */
  maxDistanceMm: number;
  /** Live preview: called with each valid edited distance (canvas ghost marker). */
  onPreview?: (distanceMm: number) => void;
  onConfirm: (distanceMm: number, depthMm: number) => void;
  onCancel: () => void;
}

export default function NotchPrecisionModal({
  initialDistanceMm,
  initialDepthMm,
  maxDistanceMm,
  onPreview,
  onConfirm,
  onCancel,
}: NotchPrecisionModalProps) {
  // String state (review finding #5): a cleared number input must read as
  // INVALID, not as 0mm-at-the-corner with the confirm button still enabled.
  const [distanceStr, setDistanceStr] = useState(() => initialDistanceMm.toFixed(1));
  const [depthStr, setDepthStr] = useState(() => String(initialDepthMm));

  const distance = parseFloat(distanceStr);
  const depth = parseFloat(depthStr);
  const distanceValid = Number.isFinite(distance) && distance >= 0 && distance <= maxDistanceMm;
  const depthValid = Number.isFinite(depth) && depth >= 1 && depth <= 20;
  const valid = distanceValid && depthValid;

  useEffect(() => {
    // CAPTURE phase + stopPropagation (review finding #3): the shortcut
    // system also listens on window — without this, Escape closes the panel
    // AND fires the global Escape (clearing the piece selection), and Enter
    // could leak too. Capture runs before the bubble-phase shortcut listener.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && valid) {
        e.stopPropagation();
        onConfirm(distance, depth);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [distance, depth, valid, onConfirm, onCancel]);

  return (
    <div className="notch-precision-modal" role="dialog" aria-label="Notch placement">
      <h3>Notch placement</h3>
      <p>Distance is measured along the outline from the marked corner.</p>
      <div className="notch-precision-input-row">
        <label htmlFor="notch-distance">Distance from corner (mm):</label>
        <input
          id="notch-distance"
          type="number"
          min={0}
          max={Math.floor(maxDistanceMm * 10) / 10}
          step={0.5}
          autoFocus
          value={distanceStr}
          className={distanceValid ? '' : 'invalid'}
          onChange={e => {
            setDistanceStr(e.target.value);
            const d = parseFloat(e.target.value);
            if (Number.isFinite(d) && d >= 0 && d <= maxDistanceMm) onPreview?.(d);
          }}
          onFocus={e => e.target.select()}
        />
      </div>
      <div className="notch-precision-hint">
        outline perimeter: {maxDistanceMm.toFixed(0)} mm
      </div>
      <div className="notch-precision-input-row">
        <label htmlFor="notch-depth">Depth (mm):</label>
        <input
          id="notch-depth"
          type="number"
          min={1}
          max={20}
          step={0.5}
          value={depthStr}
          className={depthValid ? '' : 'invalid'}
          onChange={e => setDepthStr(e.target.value)}
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
  );
}
