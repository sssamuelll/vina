import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setNotchMirrorInvert } from '../../store/editorSlice';
import { addInternalLine } from '../../store/projectSlice';
import { useNotchMirrorPreview } from '../PatternEditor/useNotchMirrorPreview';
import { createMirrorNotchLine } from '../../utils/seam/notchMirror';

/**
 * Notch mirror control (F3) — shown when a notch is selected (via the select
 * tool → editor.selectedInternalLine). Creates the CORRESPONDING notch on the
 * piece sewn to this edge at the matching distance (CLO3D parity). The sense
 * toggle (Opposite/Same side) drives the live ghost in the canvas; "Create"
 * commits one independent notch on the paired piece. No persistent pair link.
 */
export default function NotchPropertiesSection() {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const preview = useNotchMirrorPreview();

  if (!preview) return null;
  const { invert, mapped } = preview;

  const create = () => {
    if (!mapped.ok) return;
    const paired = pieces.find(p => p.id === mapped.pairedPieceId);
    if (!paired) return;
    const line = createMirrorNotchLine(paired.outline, mapped, preview.notch);
    dispatch(addInternalLine({ pieceId: mapped.pairedPieceId, line }));
  };

  return (
    <section className="panel-section">
      <div className="panel-subtitle panel-subtitle--spaced">Notch · mirror to paired edge</div>
      <div className="panel-field panel-field--row">
        <label>Sense</label>
        <div className="panel-preset-row">
          <button
            className={`panel-chip-btn ${invert ? 'panel-chip-btn--active' : ''}`}
            aria-pressed={invert}
            onClick={() => dispatch(setNotchMirrorInvert(true))}
          >
            Opposite side
          </button>
          <button
            className={`panel-chip-btn ${!invert ? 'panel-chip-btn--active' : ''}`}
            aria-pressed={!invert}
            onClick={() => dispatch(setNotchMirrorInvert(false))}
          >
            Same side
          </button>
        </div>
      </div>
      {mapped.ok ? (
        <button className="panel-btn-primary" onClick={create}>Create mirror notch</button>
      ) : (
        <div className="panel-hint panel-hint--warn">{mapped.message}</div>
      )}
    </section>
  );
}
