import { useSelector, useDispatch } from 'react-redux';
import { Shirt, Spline, Play, Pause, PersonStanding } from 'lucide-react';
import type { RootState } from '../../store';
import { startSimulation, pauseSimulation, setViewMode3D, resetSimulation } from '../../store/simulationSlice';
import { setActiveTool3D } from '../../store/toolSlice';
import DockShell from './DockShell';
import ToolTooltip from './ToolTooltip';

interface RightDockProps {
  onOpenPanel: (name: string) => void;
}

/**
 * The right (3D) dock. Heterogeneous affordances — view-mode (Arrange), a
 * toggle with a sim-reset teardown (Sew), sim transport (Simulate), and a
 * panel opener (Avatar) — so it is NOT the single-select 2D Dock; it shares
 * only the DockShell silhouette. Hidden in 2D-only view.
 */
export default function RightDock({ onOpenPanel }: RightDockProps) {
  const dispatch = useDispatch();
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const simState = useSelector((s: RootState) => s.simulation.simulationState);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const frameTime = useSelector((s: RootState) => s.simulation.frameTimeMs);

  if (viewMode === '2d') return null;

  const simActive = simState === 'running';
  const sewActive = activeTool3D === 'sew3d';
  const fps = frameTime > 0 ? Math.round(1000 / frameTime) : 0;

  // Entering Sew: the Sew3DTool only mounts while the sim is idle (it edits
  // static pieces), so reset the sim and switch to arrange before activating.
  // Clicking again exits to camera.
  const toggleSew = () => {
    if (sewActive) { dispatch(setActiveTool3D('camera')); return; }
    dispatch(resetSimulation());
    dispatch(setViewMode3D('arrange'));
    dispatch(setActiveTool3D('sew3d'));
  };

  const SimIcon = simActive ? Pause : Play;

  return (
    <>
      <DockShell side="right" domainLabel="3D">
        <ToolTooltip name="Colocar" position="left">
          <button
            type="button"
            className="dock__tool"
            onClick={() => dispatch(setViewMode3D('arrange'))}
            aria-label="Colocar"
          >
            <Shirt size={16} />
          </button>
        </ToolTooltip>
        <ToolTooltip name="Coser" position="left">
          <button
            type="button"
            className={`dock__tool ${sewActive ? 'dock__tool--active' : ''}`}
            onClick={toggleSew}
            aria-label="Coser"
            aria-pressed={sewActive}
          >
            <Spline size={16} />
          </button>
        </ToolTooltip>
        <ToolTooltip name="Simular" shortcut="espacio" position="left">
          <button
            type="button"
            className={`dock__tool ${simActive ? 'dock__tool--active' : ''}`}
            onClick={() => { if (simActive) dispatch(pauseSimulation()); else dispatch(startSimulation()); }}
            aria-label="Simular"
            aria-pressed={simActive}
          >
            <SimIcon size={16} />
          </button>
        </ToolTooltip>
        <ToolTooltip name="Avatar" position="left">
          <button
            type="button"
            className="dock__tool"
            onClick={() => onOpenPanel('Avatar')}
            aria-label="Avatar"
          >
            <PersonStanding size={16} />
          </button>
        </ToolTooltip>
      </DockShell>

      {simActive && (
        <div className="floating-3d floating-3d--bottom-left" data-superficie="indicador-fps">
          <span className="dot dot--success" />
          {/* Sin cifra hasta el primer frame real: "0fps" lee como crash (Fase1-S4). */}
          <span>{fps > 0 ? `SIMULANDO · ${fps}fps` : 'SIMULANDO'}</span>
        </div>
      )}
    </>
  );
}
