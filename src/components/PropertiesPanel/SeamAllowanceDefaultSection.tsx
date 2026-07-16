import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setDefaultSAWidth } from '../../store/editorSlice';

/**
 * Editor-level default seam allowance — the width a piece BODY-click (or
 * drag-to-all) in the seamAllowance tool applies. CLO3D lets you set this
 * default; this is its docked editing home, shown when the tool is active and
 * nothing is selected. Bound to editor.defaultSeamAllowanceWidth; commits on
 * Enter or blur. The setter clamps to [0,50] (editorSlice setDefaultSAWidth).
 */
export default function SeamAllowanceDefaultSection() {
  const dispatch = useDispatch();
  const widthMm = useSelector((s: RootState) => s.editor.defaultSeamAllowanceWidth);
  const [value, setValue] = useState(String(widthMm));

  // Resync the editing buffer when the store value changes — e.g. after the
  // reducer clamps to [0,50], so typing 100 settles to the displayed 50.
  useEffect(() => { setValue(String(widthMm)); }, [widthMm]);

  const commit = () => {
    const w = parseFloat(value);
    if (!Number.isFinite(w) || w < 0) { setValue(String(widthMm)); return; }
    dispatch(setDefaultSAWidth(w));
  };

  return (
    <section className="panel-section">
      <div className="panel-subtitle panel-subtitle--spaced">Margen de costura por defecto</div>
      <div className="panel-field">
        <label htmlFor="sa-default-width">Ancho (mm)</label>
        <input
          id="sa-default-width"
          type="number"
          className="panel-input narrow"
          min={0}
          max={50}
          step={0.5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          onBlur={commit}
        />
      </div>
      <div className="panel-hint">Haz clic en el cuerpo de una pieza para aplicar · arrastra sobre varias piezas para aplicar a todas.</div>
    </section>
  );
}
