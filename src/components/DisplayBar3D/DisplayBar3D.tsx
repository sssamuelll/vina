import { useSelector, useDispatch } from 'react-redux';
import {
  Shirt, Link, Spline,
  Image, Droplets, Box, Layers,
  Activity, ArrowLeftRight, User,
  Square, Scan, Circle, CircleDot, ImagePlus, Target,
} from 'lucide-react';
import { RootState } from '../../store';
import {
  toggleGarment, toggleSeamlines3D, toggleInternalLines3D,
  setSurfaceMode3D, setFitMapMode,
} from '../../store/simulationSlice';
import type { SurfaceMode3D } from '../../store/simulationSlice';
import type { FitMapMode } from '../../utils/cloth/fitMaps';
import ToolTooltip from '../Toolbar3D/ToolTooltip';
import './DisplayBar3D.css';

interface ToggleItem {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

interface ModeItem {
  icon: React.ReactNode;
  label: string;
  mode: SurfaceMode3D;
}

interface FitItem {
  icon: React.ReactNode;
  label: string;
  mode: FitMapMode;
}

export default function DisplayBar3D() {
  const dispatch = useDispatch();
  const sim = useSelector((s: RootState) => s.simulation);

  const toggles: ToggleItem[] = [
    { icon: <Shirt size={18} />, label: 'Garment', active: sim.showGarment, onClick: () => dispatch(toggleGarment()) },
    { icon: <Link size={18} />, label: 'Seamlines', active: sim.showSeamlines3D, onClick: () => dispatch(toggleSeamlines3D()) },
    { icon: <Spline size={18} />, label: 'Internal Lines', active: sim.showInternalLines3D, onClick: () => dispatch(toggleInternalLines3D()) },
  ];

  const surfaceModes: ModeItem[] = [
    { icon: <Image size={18} />, label: 'Textured', mode: 'textured' },
    { icon: <Droplets size={18} />, label: 'Translucent', mode: 'translucent' },
    { icon: <Box size={18} />, label: 'Mesh', mode: 'mesh' },
    { icon: <Layers size={18} />, label: 'Thick Surface', mode: 'thick' },
    { icon: <Square size={18} />, label: 'Flat', mode: 'flat' },
    { icon: <Scan size={18} />, label: 'X-Ray', mode: 'xray' },
    { icon: <Circle size={18} />, label: 'Shaded', mode: 'shaded' },
  ];

  const wireModes: ModeItem[] = [
    { icon: <CircleDot size={18} />, label: 'Shaded + Wire', mode: 'shaded-wire' },
    { icon: <ImagePlus size={18} />, label: 'Textured + Wire', mode: 'textured-wire' },
  ];

  const fitModes: FitItem[] = [
    { icon: <Activity size={18} />, label: 'Stress Map', mode: 'stress' },
    { icon: <ArrowLeftRight size={18} />, label: 'Strain Map', mode: 'strain' },
    { icon: <User size={18} />, label: 'Fit Map', mode: 'fit' },
    { icon: <Target size={18} />, label: 'Pressure Points', mode: 'pressure' },
  ];

  return (
    <div className="display-bar-3d">
      {toggles.map(t => (
        <ToolTooltip key={t.label} name={t.label} position="right">
          <button
            className={`db-btn ${t.active ? 'active' : ''}`}
            onClick={t.onClick}
          >
            {t.icon}
          </button>
        </ToolTooltip>
      ))}

      <div className="db-separator" />

      {surfaceModes.map(m => (
        <ToolTooltip key={m.mode} name={m.label} position="right">
          <button
            className={`db-btn ${sim.surfaceMode3D === m.mode ? 'mode-active' : ''}`}
            onClick={() => dispatch(setSurfaceMode3D(m.mode))}
          >
            {m.icon}
          </button>
        </ToolTooltip>
      ))}

      <div className="db-separator" />

      {wireModes.map(m => (
        <ToolTooltip key={m.mode} name={m.label} position="right">
          <button
            className={`db-btn ${sim.surfaceMode3D === m.mode ? 'mode-active' : ''}`}
            onClick={() => dispatch(setSurfaceMode3D(m.mode))}
          >
            {m.icon}
          </button>
        </ToolTooltip>
      ))}

      <div className="db-separator" />

      {fitModes.map(f => (
        <ToolTooltip key={f.mode} name={f.label} position="right">
          <button
            className={`db-btn ${sim.fitMapMode === f.mode ? 'mode-active' : ''}`}
            onClick={() => dispatch(setFitMapMode(sim.fitMapMode === f.mode ? 'none' : f.mode))}
          >
            {f.icon}
          </button>
        </ToolTooltip>
      ))}
    </div>
  );
}
