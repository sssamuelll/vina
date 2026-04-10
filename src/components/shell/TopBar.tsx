import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { setViewMode } from '../../store/editorSlice';

type ViewMode = '2d' | 'split' | '3d';

export default function TopBar() {
  const dispatch = useDispatch();
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const solverTier = useSelector((s: RootState) => s.simulation.solverTier);
  const particleCount = useSelector((s: RootState) => s.simulation.particleCount);
  const simState = useSelector((s: RootState) => s.simulation.simulationState);

  const modes: ViewMode[] = ['2d', 'split', '3d'];
  const labels: Record<ViewMode, string> = { '2d': '2D', split: 'Split', '3d': '3D' };
  const formatCount = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const dotClass = simState === 'running' ? 'dot dot--success' : 'dot dot--idle';

  return (
    <div className="top-bar">
      <span className="top-bar__logo">OpenClo</span>
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
      </div>
    </div>
  );
}
