/**
 * LeyendaDeMapas — lo que se lee de un mapa de ajuste (CLO3D «Garment Fit
 * Maps») sobre el visor 3D:
 *
 * - la escala vertical de color, en el borde derecho (tensión y estiramiento);
 * - la tabla del mapa de ajuste (No entra / Apretado / Bien);
 * - la leyenda de los puntos de presión;
 * - el valor del punto donde se hizo clic en la prenda.
 *
 * Los cuatro botones y sus ajustes ya no viven aquí: son el menú «Mapa» de la
 * barra superior (`MenuDeMapas`). Esto es solo lectura, y es papel (spec
 * 2026-10-02 § 4.2): ink de `--text-*`, fondo de `--surface-overlay-*`. Lo que
 * NO sale de un token es el color del dato —las ocho paradas de la escala y los
 * cuadritos de la tabla—, porque espeja lo que el solver pinta en la malla.
 *
 * Atajos: Alt+6 a Alt+9 (`useKeyboardShortcuts`). Shift+A, el avatar, es del
 * grupo de la prenda de la barra superior.
 *
 * @module LeyendaDeMapas
 */

import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { FitMapMode, FitMapStats } from '../../utils/cloth/fitMaps';
import { ESCALA_DE_8_PARADAS } from './modosDeMapa';
import './LeyendaDeMapas.css';

interface LeyendaDeMapasProps {
  /** Estadísticas del mapa puesto (de ClothMesh). */
  stats?: FitMapStats | null;
  /** Valor del punto donde se hizo clic (del raycaster). */
  inspectedValue?: number | null;
}

/** Los cuadritos de la tabla de ajuste y el punto de presión: espejan
 *  `FIT_COLOR_*` y `PRESSURE_COLOR` del solver (utils/cloth/fitMaps.ts). */
const COLOR_NO_ENTRA = '#ff0000';
const COLOR_APRETADO = '#ffff00';
const COLOR_BIEN = '#ffffff';
const COLOR_CONTACTO = '#ff00cc';

function formatInspectedValue(mode: FitMapMode, value: number): string {
  switch (mode) {
    case 'stress': return `${value.toFixed(2)} kPa`;
    case 'strain': return `${value.toFixed(1)}%`;
    case 'fit': return `${(value * 100).toFixed(1)}%`;
    case 'pressure': return value > 0.5 ? 'Contacto' : 'Sin contacto';
    default: return '';
  }
}

export default function LeyendaDeMapas({ stats, inspectedValue }: LeyendaDeMapasProps) {
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const fitMapMode = useSelector((s: RootState) => s.simulation.fitMapMode);
  const fitMapConfig = useSelector((s: RootState) => s.simulation.fitMapConfig);

  // Sin simulación no hay nada que leer: la escala y la tabla no se pintan. El
  // menú «Mapa» sigue ahí, apagado y con la pista de qué hacer (#1010).
  const idle = simulationState === 'idle';
  const showScale = !idle && (fitMapMode === 'stress' || fitMapMode === 'strain');
  const showFitTable = !idle && fitMapMode === 'fit' && !!stats;
  const showPressure = fitMapMode === 'pressure' && !!stats;
  const showInspected = fitMapMode !== 'none' && inspectedValue != null;

  if (!showScale && !showFitTable && !showPressure && !showInspected) return null;

  const enTension = fitMapMode === 'stress';

  return (
    <div className="leyenda-de-mapas" data-superficie="leyenda" data-material="papel">
      {showScale && (
        <div className="leyenda-de-mapas__escala">
          <span className="leyenda-de-mapas__marca">
            {enTension ? `${fitMapConfig.stressRange[1]} kPa` : `${(fitMapConfig.strainRange[1] * 100).toFixed(0)}%`}
          </span>
          <div
            className="leyenda-de-mapas__barra"
            style={{ background: `linear-gradient(to bottom, ${[...ESCALA_DE_8_PARADAS].reverse().join(', ')})` }}
          />
          <span className="leyenda-de-mapas__marca">
            {enTension ? `${fitMapConfig.stressRange[0]} kPa` : `${(fitMapConfig.strainRange[0] * 100).toFixed(0)}%`}
          </span>
          {stats && (
            <div className="leyenda-de-mapas__extremos">
              <div>máx. {enTension ? `${stats.max.toFixed(1)} kPa` : `${stats.max.toFixed(1)}%`}</div>
              <div>prom. {enTension ? `${stats.mean.toFixed(1)} kPa` : `${stats.mean.toFixed(1)}%`}</div>
            </div>
          )}
        </div>
      )}

      {showFitTable && stats && (
        <div className="leyenda-de-mapas__tabla">
          <div className="leyenda-de-mapas__titulo">Mapa de ajuste</div>
          <table>
            <tbody>
              <tr>
                <td><span className="leyenda-de-mapas__muestra" style={{ backgroundColor: COLOR_NO_ENTRA }} />No entra</td>
                <td className="leyenda-de-mapas__cifra">{stats.cantWearPct.toFixed(1)}%</td>
              </tr>
              <tr>
                <td><span className="leyenda-de-mapas__muestra" style={{ backgroundColor: COLOR_APRETADO }} />Apretado</td>
                <td className="leyenda-de-mapas__cifra">{stats.tightPct.toFixed(1)}%</td>
              </tr>
              <tr>
                <td><span className="leyenda-de-mapas__muestra" style={{ backgroundColor: COLOR_BIEN }} />Bien</td>
                <td className="leyenda-de-mapas__cifra">{(100 - stats.cantWearPct - stats.tightPct).toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {showPressure && stats && (
        <div className="leyenda-de-mapas__tabla">
          <div className="leyenda-de-mapas__titulo">Puntos de presión</div>
          <div className="leyenda-de-mapas__contacto">
            <span className="leyenda-de-mapas__punto" style={{ backgroundColor: COLOR_CONTACTO }} />
            <span>Contacto: <b>{stats.pressurePointCount}</b></span>
          </div>
        </div>
      )}

      {showInspected && (
        <div className="leyenda-de-mapas__valor">{formatInspectedValue(fitMapMode, inspectedValue)}</div>
      )}
    </div>
  );
}
