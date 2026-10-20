import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Shirt, Spline, Play, Pause, PersonStanding } from 'lucide-react';
import type { RootState } from '../../store';
import { startSimulation, pauseSimulation, setViewMode3D, resetSimulation } from '../../store/simulationSlice';
import { setActiveTool3D } from '../../store/toolSlice';
import ToolTooltip from './ToolTooltip';
import EstadoDeLaSimulacion from './EstadoDeLaSimulacion';
import './Dock.css';

interface RightDockProps {
  onOpenPanel: (name: string) => void;
}

/**
 * El margen del 3D (spec 2026-10-02 «la interfaz en papel» § 4.3, P5): una
 * columna de tinta del color de la hoja, pegada al borde derecho de la ventana,
 * con las herramientas del 3D. Como el del patrón, no flota y no se mueve: es
 * una columna en el flujo de `.canvas-area`, DETRÁS de los paneles, así que un
 * panel se abre entre el escenario y el margen (§ 6.1).
 *
 * Las herramientas son de naturaleza distinta —colocar (cambia el modo de la
 * vista), coser (un interruptor que reinicia la simulación), simular (el
 * transporte) y el Avatar (abre un panel)— y por eso NO es el `Dock` del patrón,
 * que es de selección única; comparten la silueta (`.margen`) y los botones.
 *
 * Es una botonera (contrato § 4): «Simular» tiene Espacio de atajo, así que con
 * el foco en «Colocar» Espacio pulsa el botón y no arranca la simulación; y un
 * clic de ratón no deja el foco en el botón. Sin visor a la vista (vista 2D) no
 * se pinta. Al pie de la columna va el estado de la simulación
 * (`EstadoDeLaSimulacion`, enmienda 2026-10-11): un icono que despliega el
 * detalle. Antes de P5 flotaba aquí como «SIMULANDO · N fps» y en P5 fue una
 * línea de texto en la línea al pie.
 */
export default function RightDock({ onOpenPanel }: RightDockProps) {
  const dispatch = useDispatch();
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const simState = useSelector((s: RootState) => s.simulation.simulationState);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);

  // Un clic en cualquier sitio suelta el botón de una botonera que dejó el teclado, y
  // el botón pinchado no lo toma: Enter y Espacio solo son de un botón al que se llegó
  // con el teclado (`esTeclaDeBotonera`). Con la vista 3D sola no está montada la
  // sección del patrón, que tiene el mismo oído: el margen trae el suyo.
  useEffect(() => {
    if (viewMode === '2d') return;
    const soltar = () => {
      const activo = document.activeElement;
      if (activo instanceof HTMLElement && activo.matches('[data-botonera] button')) activo.blur();
    };
    window.addEventListener('mousedown', soltar, true);
    return () => window.removeEventListener('mousedown', soltar, true);
  }, [viewMode]);

  if (viewMode === '2d') return null;

  const simActive = simState === 'running';
  const sewActive = activeTool3D === 'sew3d';

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
    <nav
      className="margen margen--derecho"
      aria-label="Herramientas del 3D"
      data-superficie="ambiente"
      data-material="papel"
      data-shortcut-context="3d"
      data-botonera
      onMouseDown={(e) => {
        // Un clic de ratón no deja el foco en el botón: Enter y Espacio solo son
        // de un botón de la botonera si se llegó a él con el teclado.
        if ((e.target as Element).closest('button')) e.preventDefault();
      }}
    >
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
      <EstadoDeLaSimulacion />
    </nav>
  );
}
