import { useSelector, useDispatch } from 'react-redux';
import { Undo2, Redo2 } from 'lucide-react';
import type { RootState } from '../../store';
import { setViewMode, undo, redo } from '../../store/editorSlice';
import { canUndo, canRedo } from '../../store/undoMiddleware';
import { useState } from 'react';
import LogoMenu from './LogoMenu';
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
  const [, forceUpdate] = useState(0);

  const modes: ViewMode[] = ['2d', 'split', '3d'];
  const labels: Record<ViewMode, string> = { '2d': '2D', split: 'Split', '3d': '3D' };
  const dotClass = simState === 'running' ? 'dot dot--success' : 'dot dot--idle';

  const handleUndo = () => { dispatch(undo()); forceUpdate(n => n + 1); };
  const handleRedo = () => { dispatch(redo()); forceUpdate(n => n + 1); };

  return (
    <div className="top-bar">
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

      <div className="top-bar__spacer" />

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

      <div className="top-bar__spacer" />

      {import.meta.env.DEV && (
        <div className="top-bar__status" aria-label="Estado técnico de la simulación">
          <span className={dotClass} aria-hidden />
          <span>{SOLVER_TIER_INFO[solverTier].label}</span>
          {particleCount > 0 && <span>· {particleCountLabel(particleCount)}</span>}
          {pieces.length > 0 && <span>· {pieceCountLabel(pieces.length)}</span>}
        </div>
      )}
    </div>
  );
}
