import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setNotchMirrorInvert } from '../../store/editorSlice';
import { addInternalLine, addNotchPair, removeNotchPair } from '../../store/projectSlice';
import { useNotchMirrorPreview } from '../PatternEditor/useNotchMirrorPreview';
import { createMirrorNotchLine } from '../../utils/seam/notchMirror';
import { newId } from '../../utils/ids';

/**
 * Notch mirror control (F3 + B1) — shown when a notch is selected (via the
 * select tool → editor.selectedInternalLine). Two states:
 *  - UNLINKED: sense toggle (Opposite/Same side) drives the live ghost; "Create"
 *    commits the corresponding notch on the paired piece AND records a persistent
 *    NotchPair (B1: declared identity, position re-derived on demand).
 *  - LINKED: shows the partner + a "Break link" to drop the declared pair.
 * One-shot; no enforcement through transforms.
 */
export default function NotchPropertiesSection() {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const notchPairs = useSelector((s: RootState) => s.project.notchPairs ?? []);
  const preview = useNotchMirrorPreview();

  if (!preview) return null;
  const { invert, mapped } = preview;
  const selRef = { pieceId: preview.sourcePiece.id, lineId: preview.notch.id };

  const pair = notchPairs.find(np =>
    (np.a.pieceId === selRef.pieceId && np.a.lineId === selRef.lineId) ||
    (np.b.pieceId === selRef.pieceId && np.b.lineId === selRef.lineId));

  if (pair) {
    const partner = pair.a.pieceId === selRef.pieceId && pair.a.lineId === selRef.lineId ? pair.b : pair.a;
    const partnerPiece = pieces.find(p => p.id === partner.pieceId);
    return (
      <section className="panel-section">
        <div className="panel-subtitle panel-subtitle--spaced">Piquete · par espejado</div>
        <div className="panel-hint">Vinculado a un piquete en {partnerPiece?.name ?? 'otra pieza'}.</div>
        <div className="panel-field panel-field--row">
          <button className="panel-chip-btn panel-chip-btn--destructive" onClick={() => dispatch(removeNotchPair(pair.id))}>
            Romper vínculo
          </button>
        </div>
      </section>
    );
  }

  const create = () => {
    if (!mapped.ok) return;
    const paired = pieces.find(p => p.id === mapped.pairedPieceId);
    if (!paired) return;
    const line = createMirrorNotchLine(paired.outline, mapped, preview.notch);
    dispatch(addInternalLine({ pieceId: mapped.pairedPieceId, line }));
    dispatch(addNotchPair({
      id: newId(),
      a: selRef,
      b: { pieceId: mapped.pairedPieceId, lineId: line.id },
      seamId: mapped.seamId,
      invert,
    }));
  };

  return (
    <section className="panel-section">
      <div className="panel-subtitle panel-subtitle--spaced">Piquete · espejar al borde emparejado</div>
      <div className="panel-field panel-field--row">
        <label>Sentido</label>
        <div className="panel-preset-row">
          <button
            className={`panel-chip-btn ${invert ? 'panel-chip-btn--active' : ''}`}
            aria-pressed={invert}
            onClick={() => dispatch(setNotchMirrorInvert(true))}
          >
            Lado opuesto
          </button>
          <button
            className={`panel-chip-btn ${!invert ? 'panel-chip-btn--active' : ''}`}
            aria-pressed={!invert}
            onClick={() => dispatch(setNotchMirrorInvert(false))}
          >
            Mismo lado
          </button>
        </div>
      </div>
      {mapped.ok ? (
        <button className="panel-btn-primary" onClick={create}>Crear piquete espejado</button>
      ) : (
        <div className="panel-hint panel-hint--warn">{mapped.message}</div>
      )}
    </section>
  );
}
