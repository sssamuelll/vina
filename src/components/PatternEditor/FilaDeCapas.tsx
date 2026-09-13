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
import './FilaDeCapas.css';

const CAPAS = [
  { kind: 'toggle', label: 'Margen', flag: 'showSeamAllowance', action: toggleSeamAllowance },
  { kind: 'toggle', label: 'Hilo', flag: 'showGrainlines', action: toggleGrainlines },
  { kind: 'toggle', label: 'Piquetes', flag: 'showNotches', action: toggleNotches },
  { kind: 'toggle', label: 'Costuras', flag: 'showSewingLines', action: toggleSewingLines },
  // Firma de María 2026-09-12: interruptor de dos estados, no un desplegable
  // de tres. Casilla como sus hermanas, no un caso especial de verdad — solo
  // lee/escribe un campo que no es booleano (lineLengthMode).
  { kind: 'largos', label: 'Largos' },
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
        const activo = capa.kind === 'largos' ? visibles.lineLengthMode === 'all' : visibles[capa.flag];
        const handleClick = () => {
          if (capa.kind === 'largos') dispatch(setLineLengthMode(activo ? 'none' : 'all'));
          else dispatch(capa.action());
        };
        return (
          <button
            key={capa.label}
            type="button"
            className={`fila-de-capas__toggle${activo ? ' fila-de-capas__toggle--activo' : ''}`}
            aria-pressed={activo}
            onClick={handleClick}
          >
            <span className="fila-de-capas__marca" aria-hidden="true" />
            {capa.label}
          </button>
        );
      })}
    </div>
  );
}
