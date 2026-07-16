import { useSelector, useDispatch } from 'react-redux';
import { Shirt, Spline, Play, Pause, PersonStanding } from 'lucide-react';
import type { RootState } from '../../store';
import { startSimulation, pauseSimulation, setViewMode3D, resetSimulation, setFitMapMode } from '../../store/simulationSlice';
import { setActiveTool3D } from '../../store/toolSlice';
import { selectWorkflowStage } from '../../store/selectors';
import { pinAuto, unpinAuto } from '../../store/dockSlice';
import DockShell from './DockShell';
import DockAutoZone from './DockAutoZone';
import ToolTooltip from './ToolTooltip';
import { getDockSuggestions, getAutoItemById, type DockSuggestion } from './dockSuggestions';

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
  const stage = useSelector(selectWorkflowStage);
  const pinnedExtra = useSelector((s: RootState) => s.dock.pinnedExtra);
  const signaling = useSelector((s: RootState) => s.dock.signaling);

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

  const runSuggestion = (id: string) => {
    if (id === 'fitmap') dispatch(setFitMapMode('fit'));
    else if (id === 'bom') onOpenPanel('BOM');
  };

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
        {(() => {
          const keptIds = pinnedExtra.right;
          const kept = keptIds.map(getAutoItemById).filter((x): x is DockSuggestion => x !== undefined);
          const suggested = getDockSuggestions(stage, 'right').filter((s) => !keptIds.includes(s.id));
          return (
            <DockAutoZone
              kept={kept}
              suggested={suggested}
              signaling={signaling}
              side="right"
              onRun={runSuggestion}
              onPin={(id) => dispatch(pinAuto({ side: 'right', id }))}
              onUnpin={(id) => dispatch(unpinAuto({ side: 'right', id }))}
            />
          );
        })()}
      </DockShell>

      {simActive && (
        <div className="floating-3d floating-3d--bottom-left">
          <span className="dot dot--success" />
          {/* Sin cifra hasta el primer frame real: "0fps" lee como crash (Fase1-S4). */}
          <span>{fps > 0 ? `SIMULANDO · ${fps}fps` : 'SIMULANDO'}</span>
        </div>
      )}
    </>
  );
}
