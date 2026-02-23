import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { startSimulation, pauseSimulation, resetSimulation } from '../../store/simulationSlice';
import PropertySection from './PropertySection';

interface SimulationPropertiesProps {
  collapsed: boolean;
  onToggle: (id: string) => void;
}

export default function SimulationProperties({ collapsed, onToggle }: SimulationPropertiesProps) {
  const dispatch = useDispatch();
  const simulation = useSelector((s: RootState) => s.simulation);

  return (
    <PropertySection id="simulation" title="SIMULATION" collapsed={collapsed} onToggle={onToggle}>
      <button
        className={`sim-button ${simulation.simulationState === 'running' ? 'running' : ''}`}
        onClick={() => {
          if (simulation.simulationState === 'running') {
            dispatch(pauseSimulation());
          } else {
            dispatch(startSimulation());
          }
        }}
      >
        {simulation.simulationState === 'running' ? 'Pause Simulation' : 'Start Simulation'}
      </button>
      <button
        className="sim-button"
        onClick={() => dispatch(resetSimulation())}
        disabled={simulation.simulationState === 'idle'}
      >
        Reset Simulation
      </button>
    </PropertySection>
  );
}
