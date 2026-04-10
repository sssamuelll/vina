import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { startSimulation, resetSimulation, setViewMode3D } from '../../store/simulationSlice';

export default function FloatingControls3D() {
  const dispatch = useDispatch();
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const simState = useSelector((s: RootState) => s.simulation.simulationState);
  const frameTime = useSelector((s: RootState) => s.simulation.frameTimeMs);

  if (viewMode === '2d') return null;

  const simActive = simState === 'running';
  const fps = frameTime > 0 ? Math.round(1000 / frameTime) : 0;

  return (
    <>
      <div className="floating-3d floating-3d--top-right">
        <button
          className={`floating-3d__pill ${simActive ? 'floating-3d__pill--primary' : 'floating-3d__pill--default'}`}
          onClick={() => {
            if (!simActive) {
              dispatch(setViewMode3D('simulate'));
              dispatch(startSimulation());
            }
          }}
        >
          Dress
        </button>
        <button
          className="floating-3d__pill floating-3d__pill--default"
          onClick={() => dispatch(setViewMode3D('arrange'))}
        >
          Arrange
        </button>
        <button
          className="floating-3d__pill floating-3d__pill--default"
          onClick={() => {
            if (simActive) dispatch(startSimulation());
            else dispatch(resetSimulation());
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
