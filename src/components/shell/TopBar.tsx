import { useSelector, useDispatch } from 'react-redux';
import { Undo2, Redo2 } from 'lucide-react';
import type { RootState } from '../../store';
import { setViewMode, undo, redo } from '../../store/editorSlice';
import { abrirIA, ocultarIA } from '../../store/iaSlice';
import { canUndo, canRedo } from '../../store/undoMiddleware';
import { useState } from 'react';
import LogoMenu from './LogoMenu';
import PuertaDelAgente from './PuertaDelAgente';
import FilaDeCapas from '../PatternEditor/FilaDeCapas';
import GrupoDeLaPrenda from './GrupoDeLaPrenda';
import { displayShortcut } from './shortcutDisplay';
import {
  particleCountLabel,
  pieceCountLabel,
  SOLVER_TIER_INFO,
} from '../Viewport3D/solverTierDisplay';

type ViewMode = '2d' | 'split' | '3d';

interface TopBarProps {
  onOpenPanel: (name: string) => void;
  onImportDXF: () => void;
}

export default function TopBar({ onOpenPanel, onImportDXF }: TopBarProps) {
  const dispatch = useDispatch();
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const solverTier = useSelector((s: RootState) => s.simulation.solverTier);
  const particleCount = useSelector((s: RootState) => s.simulation.particleCount);
  const simState = useSelector((s: RootState) => s.simulation.simulationState);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const trazos = useSelector((s: RootState) => s.project.trazos.length);
  const [, forceUpdate] = useState(0);
  // El grupo del patrón está con la hoja a la vista y algo dibujado en ella:
  // 2D o Split, con piezas o trazos (spec 2026-10-02 § 4.2).
  const conGrupoDelPatron = viewMode !== '3d' && (pieces.length > 0 || trazos > 0);

  const modes: ViewMode[] = ['2d', 'split', '3d'];
  const labels: Record<ViewMode, string> = { '2d': '2D', split: 'Split', '3d': '3D' };
  const dotClass = simState === 'running' ? 'dot dot--success' : 'dot dot--idle';

  const handleUndo = () => { dispatch(undo()); forceUpdate(n => n + 1); };
  const handleRedo = () => { dispatch(redo()); forceUpdate(n => n + 1); };

  return (
    <div className="top-bar" data-superficie="ambiente">
      <div className="top-bar__lado">
        {/* Logo → opens app menu */}
        <LogoMenu onOpenPanel={onOpenPanel} onImportDXF={onImportDXF} />

        {/* Undo/Redo */}
        <button
          className="icon-btn"
          onClick={handleUndo}
          disabled={!canUndo()}
          title={`Deshacer (${displayShortcut('⌘Z')})`}
          aria-label="Deshacer"
          style={{ opacity: canUndo() ? 1 : 0.3 }}
        >
          <Undo2 size={14} />
        </button>
        <button
          className="icon-btn"
          onClick={handleRedo}
          disabled={!canRedo()}
          title={`Rehacer (${displayShortcut('⌘⇧Z')})`}
          aria-label="Rehacer"
          style={{ opacity: canRedo() ? 1 : 0.3 }}
        >
          <Redo2 size={14} />
        </button>

        {conGrupoDelPatron && <FilaDeCapas />}
      </div>

      <div className="pill-group">
        {modes.map(m => (
          <button
            key={m}
            className={`pill-group__item ${viewMode === m ? 'pill-group__item--active' : ''}`}
            onClick={() => dispatch(setViewMode(m))}
          >
            {labels[m]}
          </button>
        ))}
      </div>

      <div className="top-bar__lado top-bar__lado--derecho">
        {/* Lo que se ve de la prenda (spec 2026-10-02 § 4.2): con el visor a la
            vista, junto a «IA». En 2D no hay prenda que mirar. */}
        {viewMode !== '2d' && <GrupoDeLaPrenda />}
        {import.meta.env.DEV && (
          <div className="top-bar__status" aria-label="Estado técnico de la simulación" data-superficie="dev">
            <span className={dotClass} aria-hidden />
            <span>{SOLVER_TIER_INFO[solverTier].label}</span>
            {particleCount > 0 && <span>· {particleCountLabel(particleCount)}</span>}
            {pieces.length > 0 && <span>· {pieceCountLabel(pieces.length)}</span>}
          </div>
        )}
        <BotonIA />
        <PuertaDelAgente />
      </div>
    </div>
  );
}

/**
 * «IA» (spec 2026-10-02 § 4.2 y § 6.2): marcado con la barra abierta, y con
 * una señal mientras el agente trabaja con la barra oculta.
 */
function BotonIA() {
  const dispatch = useDispatch();
  const { abierta, trabajando } = useSelector((s: RootState) => s.ia);
  const trabajandoOculta = trabajando && !abierta;
  const nombre = trabajandoOculta ? 'La IA está trabajando' : 'Conversar con la IA';
  return (
    <button
      type="button"
      className={`boton-ia${abierta || trabajandoOculta ? ' boton-ia--activo' : ''}`}
      aria-pressed={abierta || trabajandoOculta}
      aria-label={nombre}
      title={abierta ? 'Ocultar la IA' : trabajandoOculta ? nombre : `${nombre} (${displayShortcut('⌘/')})`}
      onClick={() => dispatch(abierta ? ocultarIA() : abrirIA())}
    >
      IA
      {trabajandoOculta && <span className="boton-ia__actividad" aria-hidden="true" />}
    </button>
  );
}
