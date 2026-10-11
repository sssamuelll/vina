/**
 * MenuDeMapas — «Mapa ▾» en la barra superior (spec 2026-10-02 «la interfaz en
 * papel» § 4.2, P5): los cuatro mapas de ajuste y sus ajustes. Antes eran una
 * barra oscura que flotaba sobre el visor (`FitMapToggle`).
 *
 * El disparador es un botón de texto con el estilo de «Mostrar» (el menú
 * plegado del grupo del patrón). La hoja cuelga de <body> por portal y es papel
 * (contrato § 2, «todo portal nace papel»), anclada bajo el borde derecho del
 * botón. Una sola hoja con dos vistas: la lista de mapas y, desde «Ajustes del
 * mapa…», los rangos. Una hoja es una sola superficie y un solo peldaño de
 * Escape; dos portales para un disparador serían dos de cada.
 *
 * #1010 punto 4: sin simulación no hay mapa que ver, pero el menú SE ABRE, para
 * que se descubra que existen: el disparador se ve apagado y los cuatro
 * elementos, deshabilitados, dicen qué hacer. Los ajustes siempre se pueden
 * tocar.
 *
 * Los atajos Alt+6 a Alt+9 no dependen de este menú: los maneja
 * `useKeyboardShortcuts`, esté abierto o no.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { ChevronDown } from 'lucide-react';
import type { RootState } from '../../store';
import { setFitMapMode, updateFitMapConfig } from '../../store/simulationSlice';
import { DEFAULT_FIT_MAP_CONFIG, type FitMapMode } from '../../utils/cloth/fitMaps';
import { usePeldanoDeEscape } from '../../shortcuts/escaleraDeLoLlamado';
import { pushJournal } from '../../utils/telemetry/journal';
import { displayShortcut } from '../shell/shortcutDisplay';
import { MODOS_DE_MAPA } from './modosDeMapa';
import './MenuDeMapas.css';

type Hoja = 'lista' | 'ajustes' | null;

/** Un campo numérico de los ajustes: `onValor` solo recibe números válidos. */
function Campo({ etiqueta, nombre, value, step, onValor }: {
  etiqueta: string;
  nombre: string;
  value: number;
  step?: number;
  onValor: (v: number) => void;
}) {
  return (
    <label className="menu-de-mapas__etiqueta">
      {etiqueta}
      <input
        type="number"
        className="menu-de-mapas__campo"
        aria-label={nombre}
        value={value}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onValor(v);
        }}
      />
    </label>
  );
}

export default function MenuDeMapas() {
  const dispatch = useDispatch();
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const fitMapMode = useSelector((s: RootState) => s.simulation.fitMapMode);
  const cfg = useSelector((s: RootState) => s.simulation.fitMapConfig);
  const [hoja, setHoja] = useState<Hoja>(null);
  const [ancla, setAncla] = useState({ right: 0, top: 0 });
  const botonRef = useRef<HTMLButtonElement>(null);
  const hojaRef = useRef<HTMLDivElement>(null);

  const idle = simulationState === 'idle';
  const puesto = idle ? undefined : MODOS_DE_MAPA.find((m) => m.mode === fitMapMode);

  // Abrir, pasar a los ajustes y cerrar quedan en la bitácora, venga de un clic,
  // de Escape o de un cambio de tamaño. Con la hoja abierta el foco entra a ella:
  // cuelga de <body>, y Tab desde «Mapa» no llegaría (igual que «Mostrar»).
  const hojaAntes = useRef<Hoja>(null);
  useEffect(() => {
    if (hojaAntes.current === hoja) return;
    hojaAntes.current = hoja;
    pushJournal('ui', 'mapas', { hoja });
    if (hoja) hojaRef.current?.querySelector<HTMLElement>('button:not(:disabled), input')?.focus();
  }, [hoja]);

  useEffect(() => {
    if (!hoja) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (botonRef.current?.contains(t) || hojaRef.current?.contains(t)) return;
      setHoja(null);
    };
    // La hoja se ancla al abrirse; si la ventana cambia de tamaño, se va con el botón.
    const cerrar = () => setHoja(null);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', cerrar);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', cerrar);
    };
  }, [hoja]);

  // Esc la cierra antes que la barra de IA, un panel y la selección: un peldaño
  // de la escalera de lo que se llama (spec § 6.2). El foco vuelve a «Mapa».
  usePeldanoDeEscape('mapas', 'menu', hoja !== null, () => {
    if (hojaRef.current?.contains(document.activeElement)) botonRef.current?.focus();
    setHoja(null);
  });

  const elegir = (mode: FitMapMode) => {
    dispatch(setFitMapMode(fitMapMode === mode ? 'none' : mode));
    botonRef.current?.focus();
    setHoja(null);
  };
  const ajustar = (parche: Partial<typeof cfg>) => dispatch(updateFitMapConfig(parche));

  const claseDelBoton = [
    'grupo-del-patron__plegado',
    idle && 'menu-de-mapas__disparador--apagado',
    puesto && 'menu-de-mapas__disparador--activo',
  ].filter(Boolean).join(' ');

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        className={claseDelBoton}
        aria-expanded={hoja !== null}
        aria-haspopup="true"
        title={idle ? 'Simula para ver los mapas de ajuste' : puesto?.label}
        onClick={(e) => {
          if (hoja) { setHoja(null); return; }
          const r = e.currentTarget.getBoundingClientRect();
          setAncla({ right: window.innerWidth - r.right, top: r.bottom + 4 });
          setHoja('lista');
        }}
      >
        {puesto && <span className="grupo-del-patron__marca" aria-hidden="true" />}
        Mapa
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {hoja && createPortal(
        <div
          ref={hojaRef}
          className="menu-de-mapas__hoja"
          role="group"
          aria-label={hoja === 'lista' ? 'Mapas de ajuste' : 'Ajustes del mapa'}
          data-superficie="menu"
          data-material="papel"
          data-botonera
          style={{ right: ancla.right, top: ancla.top }}
        >
          {hoja === 'lista' ? (
            <>
              {MODOS_DE_MAPA.map(({ mode, label, shortcut, icon }) => {
                const encendido = !idle && fitMapMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    className={`menu-de-mapas__elemento${encendido ? ' menu-de-mapas__elemento--activo' : ''}`}
                    disabled={idle}
                    aria-pressed={encendido}
                    title={idle ? `${label} — simula para ver los mapas de ajuste` : `${label} (${displayShortcut(shortcut)})`}
                    onClick={() => elegir(mode)}
                  >
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={icon} />
                    </svg>
                    {label}
                    <span className="menu-de-mapas__atajo" aria-hidden="true">{displayShortcut(shortcut)}</span>
                  </button>
                );
              })}
              <div className="menu-de-mapas__separador" role="separator" />
              <button type="button" className="menu-de-mapas__elemento" onClick={() => setHoja('ajustes')}>
                Ajustes del mapa…
              </button>
            </>
          ) : (
            <>
              <div className="menu-de-mapas__titulo">Ajustes del mapa</div>

              <div className="menu-de-mapas__rotulo">Rango de tensión (kPa)</div>
              <div className="menu-de-mapas__fila">
                <Campo etiqueta="Mín" nombre="Tensión mín" value={cfg.stressRange[0]} onValor={(v) => ajustar({ stressRange: [v, cfg.stressRange[1]] })} />
                <Campo etiqueta="Máx" nombre="Tensión máx" value={cfg.stressRange[1]} onValor={(v) => ajustar({ stressRange: [cfg.stressRange[0], v] })} />
              </div>

              <div className="menu-de-mapas__rotulo">Rango de estiramiento (%)</div>
              <div className="menu-de-mapas__fila">
                <Campo etiqueta="Mín" nombre="Estiramiento mín" step={1} value={+(cfg.strainRange[0] * 100).toFixed(1)} onValor={(v) => ajustar({ strainRange: [v / 100, cfg.strainRange[1]] })} />
                <Campo etiqueta="Máx" nombre="Estiramiento máx" step={1} value={+(cfg.strainRange[1] * 100).toFixed(1)} onValor={(v) => ajustar({ strainRange: [cfg.strainRange[0], v / 100] })} />
              </div>

              <div className="menu-de-mapas__rotulo">Umbrales de ajuste (%)</div>
              <div className="menu-de-mapas__fila">
                <Campo etiqueta="Apretado" nombre="Umbral apretado" step={1} value={+(cfg.fitThresholds[0] * 100).toFixed(1)} onValor={(v) => ajustar({ fitThresholds: [v / 100, cfg.fitThresholds[1]] })} />
                <Campo etiqueta="No entra" nombre="Umbral no entra" step={1} value={+(cfg.fitThresholds[1] * 100).toFixed(1)} onValor={(v) => ajustar({ fitThresholds: [cfg.fitThresholds[0], v / 100] })} />
              </div>

              <div className="menu-de-mapas__rotulo">Distancia de presión (mm)</div>
              <div className="menu-de-mapas__fila">
                <Campo etiqueta="Distancia" nombre="Distancia de presión" step={0.1} value={+(cfg.pressureDistance * 1000).toFixed(1)} onValor={(v) => ajustar({ pressureDistance: v / 1000 })} />
              </div>

              <button type="button" className="menu-de-mapas__restablecer" onClick={() => dispatch(updateFitMapConfig(DEFAULT_FIT_MAP_CONFIG))}>
                Restablecer valores
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
