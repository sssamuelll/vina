import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { startSimulation, pauseSimulation, setViewMode3D, resetSimulation } from '../../store/simulationSlice';
import { setActiveTool3D } from '../../store/toolSlice';

export default function FloatingControls3D() {
  const dispatch = useDispatch();
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const simState = useSelector((s: RootState) => s.simulation.simulationState);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const frameTime = useSelector((s: RootState) => s.simulation.frameTimeMs);

  if (viewMode === '2d') return null;

  const simActive = simState === 'running';
  const sewActive = activeTool3D === 'sew3d';
  const fps = frameTime > 0 ? Math.round(1000 / frameTime) : 0;

  // Entering Sew mode: the Sew3DTool only mounts while the simulation is idle
  // (it edits static pieces), so reset the sim to idle and switch to arrange
  // view before activating the tool. Clicking again exits back to camera.
  const toggleSew = () => {
    if (sewActive) {
      dispatch(setActiveTool3D('camera'));
      return;
    }
    dispatch(resetSimulation());
    dispatch(setViewMode3D('arrange'));
    dispatch(setActiveTool3D('sew3d'));
  };

  return (
    <>
      <div className="floating-3d floating-3d--top-right">
        <button
          className="floating-3d__pill floating-3d__pill--default"
          onClick={() => dispatch(setViewMode3D('arrange'))}
        >
          Arrange
        </button>
        <button
          className={`floating-3d__pill ${sewActive ? 'floating-3d__pill--primary' : 'floating-3d__pill--default'}`}
          onClick={toggleSew}
          title="Click two edges in 3D to create a seam"
        >
          {sewActive ? 'Sewing…' : 'Sew'}
        </button>
        <button
          className="floating-3d__pill floating-3d__pill--default"
          onClick={() => {
            if (simActive) dispatch(pauseSimulation());
            else dispatch(startSimulation());
          }}
        >
          {simActive ? 'Pause' : 'Simulate'}
        </button>
      </div>

      {simActive && (
        <div className="floating-3d floating-3d--bottom-left">
          <span className="dot dot--success" />
          <span>SIMULATING · {fps}fps</span>
        </div>
      )}
    </>
  );
}
