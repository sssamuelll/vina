import { useSelector, useDispatch } from 'react-redux';
import { Undo2, Redo2 } from 'lucide-react';
import type { RootState } from '../../store';
import { setViewMode, undo, redo } from '../../store/editorSlice';
import { canUndo, canRedo } from '../../store/undoMiddleware';
import { useState } from 'react';
import LogoMenu from './LogoMenu';

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
  const formatCount = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
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
        title="Undo (⌘Z)"
        aria-label="Undo"
        style={{ opacity: canUndo() ? 1 : 0.3 }}
      >
        <Undo2 size={14} />
      </button>
      <button
        className="icon-btn"
        onClick={handleRedo}
        disabled={!canRedo()}
        title="Redo (⌘⇧Z)"
        aria-label="Redo"
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

      <div className="top-bar__status">
        <span className={dotClass} />
        <span>{solverTier ?? 'idle'}</span>
        {particleCount > 0 && <span>· {formatCount(particleCount)}</span>}
        {pieces.length > 0 && <span>· {pieces.length}p</span>}
      </div>
    </div>
  );
}
