import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import {
  toggleGrainlines,
  toggleLineLengths,
  toggleNotches,
  toggleSeamAllowance,
  toggleSewingLines,
  toggleTrazos,
} from '../../store/editorSlice';
import './FilaDeCapas.css';

const CAPAS = [
  { label: 'Margen', flag: 'showSeamAllowance', action: toggleSeamAllowance },
  { label: 'Hilo', flag: 'showGrainlines', action: toggleGrainlines },
  { label: 'Piquetes', flag: 'showNotches', action: toggleNotches },
  { label: 'Costuras', flag: 'showSewingLines', action: toggleSewingLines },
  { label: 'Largos', flag: 'showLineLengths', action: toggleLineLengths },
  { label: 'Construcción', flag: 'showTrazos', action: toggleTrazos },
] as const;

const selectCapasVisibles = (state: RootState) => ({
  showSeamAllowance: state.editor.showSeamAllowance,
  showGrainlines: state.editor.showGrainlines,
  showNotches: state.editor.showNotches,
  showSewingLines: state.editor.showSewingLines,
  showLineLengths: state.editor.showLineLengths,
  showTrazos: state.editor.showTrazos,
});

export default function FilaDeCapas() {
  const dispatch = useDispatch<AppDispatch>();
  const visibles = useSelector(selectCapasVisibles, shallowEqual);

  return (
    <div className="fila-de-capas" role="group" aria-label="Capas visibles">
      {CAPAS.map(({ label, flag, action }) => {
        const activo = visibles[flag];
        return (
          <button
            key={flag}
            type="button"
            className={`fila-de-capas__toggle${activo ? ' fila-de-capas__toggle--activo' : ''}`}
            aria-pressed={activo}
            onClick={() => dispatch(action())}
          >
            <span className="fila-de-capas__marca" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
