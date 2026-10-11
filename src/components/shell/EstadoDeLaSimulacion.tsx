import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import { Activity, Pause, TriangleAlert } from 'lucide-react';
import type { RootState } from '../../store';
import type { SolverTier } from '../../store/simulationSlice';
import { usePeldanoDeEscape } from '../../shortcuts/escaleraDeLoLlamado';
import { pushJournal } from '../../utils/telemetry/journal';
import {
  CPU_CAPABILITIES,
  WASM_CAPABILITIES,
  GPU_CAPABILITIES,
  NEURAL_CAPABILITIES,
} from '../../utils/cloth/solverCapabilities';
import {
  particleCountLabel,
  seamResolutionFailureLabel,
  SIMULATION_MODE_LABELS,
  SOLVER_TIER_INFO,
} from '../Viewport3D/solverTierDisplay';
import ToolTooltip from './ToolTooltip';
import './EstadoDeLaSimulacion.css';

// ponytail: static map — tier strings are a closed enum (SolverTier), no dynamic lookup needed.
const TIER_CAPS = {
  'webgpu':       GPU_CAPABILITIES,
  'wasm':         WASM_CAPABILITIES,
  'cpu-worker':   CPU_CAPABILITIES,
  'neural-drape': NEURAL_CAPABILITIES,
  'none':         CPU_CAPABILITIES,
} as const satisfies Record<SolverTier, typeof CPU_CAPABILITIES>;

/**
 * El triángulo de aviso, forzado a presentación de TEXTO (U+FE0E): sin eso, Windows
 * lo pinta como emoji de color y no toma el `color` del token (--warning).
 */
const AVISO = '⚠︎';

/** Una línea del detalle: `tono` dice qué tan grave es, además del color (ley de estado). */
function Linea({ tono, title, children }: { tono?: 'cabecera' | 'bien' | 'aviso' | 'error' | 'tenue'; title?: string; children: ReactNode }) {
  const grave = tono === 'aviso' || tono === 'error';
  return (
    <div className={`estado-de-la-simulacion__linea${tono ? ` estado-de-la-simulacion__linea--${tono}` : ''}`} title={title}>
      {grave && <span aria-hidden="true">{AVISO} </span>}
      {children}
    </div>
  );
}

/**
 * El estado de la simulación, al pie del margen del 3D (enmienda 2026-10-11 a la
 * spec «la interfaz en papel» § 4.5). Es un icono: el ⚠ con su número si hay
 * avisos; si no, el pulso mientras simula y la pausa detenida. Pulsarlo despliega
 * el detalle, una hoja de papel por portal, a la izquierda del margen y con su
 * borde de abajo en el del icono. El detalle empieza diciendo lo que el icono no
 * escribe: el estado y el motor. El nombre accesible del icono lo dice todo, con
 * los fps y los avisos.
 *
 * Samuel pidió los mensajes del simulador «en otro lado o que sea muy muy pequeño
 * tipo un par de iconos o algo así y expandible», y de las dos maquetas eligió
 * esta, sobre dejar dos iconos en la línea al pie. En P5 era una línea
 * «Simulando · N fps · WebGPU ⚠ n» en la línea al pie y, antes,
 * `SimulationStatusOverlay`, una caja negra en la esquina del visor. El aviso es la
 * «silent-absence surface» de C4 § 3.1.A: nunca se calla, ni con el detalle
 * cerrado ni con la simulación parada.
 *
 * Vive dentro del margen, que es una botonera (contrato § 4): con el foco en el
 * icono, Espacio lo pulsa y no arranca la simulación, y un clic de ratón no le
 * deja el foco (lo cuida `RightDock`).
 */
export default function EstadoDeLaSimulacion() {
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const solverTier = useSelector((s: RootState) => s.simulation.solverTier);
  const frameTimeMs = useSelector((s: RootState) => s.simulation.frameTimeMs);
  const particleCount = useSelector((s: RootState) => s.simulation.particleCount);
  const simulationMode = useSelector((s: RootState) => s.simulation.simulationMode);
  const bodyCollision = useSelector((s: RootState) => s.simulation.bodyCollision);
  const seamResolution = useSelector((s: RootState) => s.simulation.seamResolution);

  const [abierto, setAbierto] = useState(false);
  const [ancla, setAncla] = useState({ right: 0, bottom: 0 });
  const botonRef = useRef<HTMLButtonElement>(null);
  const hojaRef = useRef<HTMLDivElement>(null);

  // Tool tier coverage per C4 RFC § 2.3: steam brush is GPU-only;
  // mesh grab is GPU + WASM. CPU + Neural have no tool dispatch.
  // SolverCapabilities.tools mirrors this for capability-aware consumers.
  const toolUnsupported =
    (activeTool3D === 'steamBrush' && solverTier !== 'webgpu') ||
    (activeTool3D === 'meshGrab' && solverTier !== 'webgpu' && solverTier !== 'wasm');

  const idle = simulationState === 'idle';
  const corriendo = simulationState === 'running';
  // Se ve con la simulación en marcha o en pausa, O con una herramienta sin soporte
  // armada en reposo: se puede activar la plancha o el agarre antes de dar a Simular,
  // y sin este aviso arrastrar sobre la tela no haría nada y sin una sola pista.
  const hayEstado = !idle || toolUnsupported;

  // Diagnósticos reales que el icono no puede silenciar (C4 § 3.1.A): el ⚠ delata
  // que hay detalle que leer. Que el motor no detecte la penetración NO cuenta: ninguno
  // de los cuatro la detecta (`facePoke` es falso en todos), así que encendía el ⚠ en
  // toda simulación y el pulso y la pausa no se veían nunca. Es un límite del motor, no
  // un problema de la corrida (Samuel, 2026-10-11): su texto sigue en el detalle, como nota.
  const warningCount =
    (seamResolution && seamResolution.zeroConstraintSeams.length > 0 ? 1 : 0) +
    (solverTier !== 'none' && !bodyCollision ? 1 : 0) +
    (solverTier === 'wasm' ? 1 : 0) +
    (toolUnsupported ? 1 : 0);

  // Sin cifra hasta el primer cuadro: `frameTimeMs` es el promedio de una ventana de 30
  // cuadros y vale 0 hasta que se llena. Un «0 fps» sería mentira, y alarmante.
  const fps = frameTimeMs > 0 ? Math.round(1000 / frameTimeMs) : 0;
  const motor = solverTier === 'none' ? null : (SOLVER_TIER_INFO[solverTier] ?? SOLVER_TIER_INFO.none).label;
  const textoDelEstado = idle
    ? SOLVER_TIER_INFO.none.label
    : corriendo
      ? ['Simulando', fps > 0 ? `${fps} fps` : null, motor].filter(Boolean).join(' · ')
      : 'En pausa';
  // La primera línea del detalle: el estado y el motor. La cifra va en la línea siguiente.
  const cabecera = idle ? SOLVER_TIER_INFO.none.label : [corriendo ? 'Simulando' : 'En pausa', motor].filter(Boolean).join(' · ');
  const avisos = warningCount === 0 ? '' : warningCount === 1 ? ' · 1 aviso' : ` · ${warningCount} avisos`;
  const resumen = `${textoDelEstado}${avisos}`;
  // El nombre accesible no lleva la cifra: `setFrameTime` llega cada 30 cuadros, y un nombre
  // que cambia dos veces por segundo el lector lo relee con el foco encima. Los fps, en el detalle.
  const nombre = `Estado de la simulación: ${cabecera}${avisos}`;

  // Sin simulación ni herramienta sin soporte no hay estado que abrir: se cierra.
  useEffect(() => { if (!hayEstado) setAbierto(false); }, [hayEstado]);

  // Abrir y cerrar el detalle quedan en la bitácora, con el estado que enseñaba: un «no
  // veo el aviso» en la máquina de María se lee ahí.
  const abiertoAntes = useRef(false);
  useEffect(() => {
    if (abiertoAntes.current === abierto) return;
    abiertoAntes.current = abierto;
    pushJournal('ui', 'estado-3d', { abierto, estado: resumen });
  }, [abierto, resumen]);

  useEffect(() => {
    if (!abierto) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (botonRef.current?.contains(t) || hojaRef.current?.contains(t)) return;
      setAbierto(false);
    };
    // La hoja se ancla al abrirse; si la ventana cambia de tamaño, se va con el icono.
    const cerrar = () => setAbierto(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', cerrar);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', cerrar);
    };
  }, [abierto]);

  // Esc lo cierra antes que la barra de IA, un panel y la selección: un peldaño de
  // la escalera de lo que se llama (spec 2026-10-02 § 6.2). El foco no se movió.
  usePeldanoDeEscape('estado-3d', 'menu', abierto, () => {
    if (hojaRef.current?.contains(document.activeElement)) botonRef.current?.focus();
    setAbierto(false);
  });

  if (!hayEstado) return null;

  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
  const clasePorFps = fps >= 50 ? 'bien' : fps >= 30 ? 'aviso' : 'error';
  // El icono cambia de forma, no solo de tono (ley de estado): ⚠, pulso o pausa.
  const Icono = warningCount > 0 ? TriangleAlert : corriendo ? Activity : Pause;
  const tono = warningCount > 0 ? ' estado-de-la-simulacion__boton--aviso' : corriendo ? ' estado-de-la-simulacion__boton--corriendo' : '';

  return (
    <div className="estado-de-la-simulacion">
      {/* El tooltip dice qué es, corto: el resumen entero no cabía en sus 240 px. Con el
          detalle abierto se apaga: saldría encima de sus últimas líneas, que son los avisos. */}
      <ToolTooltip name="Estado de la simulación" position="left" apagado={abierto}>
        <button
          ref={botonRef}
          type="button"
          className={`dock__tool estado-de-la-simulacion__boton${tono}`}
          aria-label={nombre}
          aria-expanded={abierto}
          aria-controls="estado-de-la-simulacion-detalle"
          onClick={(e) => {
            if (abierto) { setAbierto(false); return; }
            // A la izquierda del margen, sin taparlo, y con su borde de abajo en el del icono.
            const r = e.currentTarget.getBoundingClientRect();
            const margen = e.currentTarget.closest('.margen')?.getBoundingClientRect() ?? r;
            setAncla({ right: window.innerWidth - margen.left + 6, bottom: window.innerHeight - r.bottom });
            setAbierto(true);
          }}
        >
          <Icono size={16} aria-hidden="true" />
          {warningCount > 0 && <span className="estado-de-la-simulacion__cuenta" aria-hidden="true">{warningCount}</span>}
        </button>
      </ToolTooltip>

      {abierto && createPortal(
        <div
          ref={hojaRef}
          id="estado-de-la-simulacion-detalle"
          className="estado-de-la-simulacion__detalle"
          role="group"
          aria-label="Detalle de la simulación"
          data-superficie="menu"
          data-material="papel"
          style={{ right: ancla.right, bottom: ancla.bottom }}
        >
          <Linea tono="cabecera">{cabecera}</Linea>
          {fps > 0 && <Linea tono={clasePorFps}>{fps} fps ({frameTimeMs.toFixed(1)} ms)</Linea>}
          {particleCount > 0 && <Linea>{particleCountLabel(particleCount)}</Linea>}
          {seamResolution && <Linea>{seamResolution.totalConstraints.toLocaleString('es-ES')} restricciones de costura</Linea>}
          {seamResolution && seamResolution.zeroConstraintSeams.length > 0 && (
            <Linea
              tono="error"
              title={
                'Estas costuras se resolvieron con 0 restricciones XPBD: el solver no puede unirlas. ' +
                'Causa por costura: ' +
                seamResolution.zeroConstraintSeams
                  .map(z => `${z.seamId} (${seamResolutionFailureLabel(z.reason)})`)
                  .join(', ') +
                '. Revisa el emparejado de bordes en 2D.'
              }
            >
              {seamResolution.zeroConstraintSeams.length} costura{seamResolution.zeroConstraintSeams.length === 1 ? '' : 's'} sin restricciones — no va a coser
            </Linea>
          )}
          {!idle && (
            <Linea tono="tenue">
              Modo: {SIMULATION_MODE_LABELS[simulationMode]}{isMobile ? ' · móvil' : ''}
            </Linea>
          )}
          {solverTier !== 'none' && !bodyCollision && (
            <Linea tono="aviso">Sin colisión con el cuerpo</Linea>
          )}
          {solverTier !== 'none' && bodyCollision && !TIER_CAPS[solverTier].facePoke && (
            // Una nota y no un aviso: no se cuenta en el ⚠ (ver `warningCount`).
            <Linea tono="tenue">
              El cuerpo puede asomar a través de la tela — la detección de penetración no está disponible en este motor
            </Linea>
          )}
          {solverTier === 'wasm' && (
            // Self-collision REMOVED from this list (M4-D): the #608 port runs
            // on the WASM tier and the runtime default is ON — listing it here
            // was the stale "hallazgo B" text. The remaining four are still
            // honestly CPU-only (WASM_CAPABILITIES, A7).
            <Linea
              tono="aviso"
              title="El motor WASM no admite LRA (anclajes de largo alcance), restricciones de pliegue, presión por pieza ni rigidez por pieza. Cambia al motor CPU para tener todas las funciones. Ver RFC A7."
            >
              Funciones limitadas (LRA, pliegues, presión y rigidez por pieza desactivados — usa el motor CPU)
            </Linea>
          )}
          {toolUnsupported && (
            <Linea
              tono="aviso"
              title={
                activeTool3D === 'steamBrush'
                  ? 'La plancha a vapor requiere el motor WebGPU (los kernels TSL escriben el amortiguado de velocidad por partícula). WebGPU viene activado por defecto; si lo desactivaste, limpia localStorage(\'vina-use-webgpu\'). Ver RFC C4 § 2.3.'
                  : 'El agarre de malla requiere el motor WebGPU o WASM (CPU no tiene anclaje posicional; Neural no tiene interacción por partícula). Cambia a WASM o WebGPU. Ver RFC C4 § 2.3.'
              }
            >
              La herramienta activa ({activeTool3D === 'steamBrush' ? 'plancha a vapor' : 'agarre de malla'}) no funciona con este motor
            </Linea>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
