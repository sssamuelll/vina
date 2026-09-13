import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import {
  toggleGrainlines,
  toggleNotches,
  toggleSeamAllowance,
  toggleSewingLines,
  toggleTrazos,
  setLineLengthMode,
} from '../../store/editorSlice';
import type { LineLengthMode } from '../../store/lineLengthPreference';
import './FilaDeCapas.css';

const CAPAS = [
  { kind: 'toggle', label: 'Margen', flag: 'showSeamAllowance', action: toggleSeamAllowance },
  { kind: 'toggle', label: 'Hilo', flag: 'showGrainlines', action: toggleGrainlines },
  { kind: 'toggle', label: 'Piquetes', flag: 'showNotches', action: toggleNotches },
  { kind: 'toggle', label: 'Costuras', flag: 'showSewingLines', action: toggleSewingLines },
  { kind: 'lengths' },
  { kind: 'toggle', label: 'Construcción', flag: 'showTrazos', action: toggleTrazos },
] as const;

const selectCapasVisibles = (state: RootState) => ({
  showSeamAllowance: state.editor.showSeamAllowance,
  showGrainlines: state.editor.showGrainlines,
  showNotches: state.editor.showNotches,
  showSewingLines: state.editor.showSewingLines,
  lineLengthMode: state.editor.lineLengthMode,
  showTrazos: state.editor.showTrazos,
});

export default function FilaDeCapas() {
  const dispatch = useDispatch<AppDispatch>();
  const visibles = useSelector(selectCapasVisibles, shallowEqual);

  return (
    <div className="fila-de-capas" role="group" aria-label="Capas visibles">
      {CAPAS.map((capa) => {
        if (capa.kind === 'lengths') {
          return (
            <label key={'lengths'} className={'fila-de-capas__largos'}>
              <span>Largos</span>
              <select
                aria-label={'Largos'}
                value={visibles.lineLengthMode}
                onChange={(event) => dispatch(setLineLengthMode(event.currentTarget.value as LineLengthMode))}
              >
                <option value={'creation'}>Al crear</option>
                <option value={'all'}>Todas</option>
                <option value={'none'}>Ninguna</option>
              </select>
            </label>
          );
        }
        const { label, flag, action } = capa;
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
