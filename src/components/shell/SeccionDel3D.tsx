import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import { ChevronUp } from 'lucide-react';
import type { RootState } from '../../store';
import type { SolverTier } from '../../store/simulationSlice';
import { useShortcutRegistry } from '../../shortcuts';
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
import { displayShortcutBinding } from './shortcutDisplay';
import { vozDelTresD } from './vozDelTresD';
import './SeccionDel3D.css';

// ponytail: static map — tier strings are a closed enum (SolverTier), no dynamic lookup needed.
const TIER_CAPS = {
  'webgpu':       GPU_CAPABILITIES,
  'wasm':         WASM_CAPABILITIES,
  'cpu-worker':   CPU_CAPABILITIES,
  'neural-drape': NEURAL_CAPABILITIES,
  'none':         CPU_CAPABILITIES,
} as const satisfies Record<SolverTier, typeof CPU_CAPABILITIES>;

/** La acción del registro de atajos de cada herramienta que tiene tecla: el rótulo la lee de ahí. */
const ACCION_DE_LA_TECLA: Readonly<Record<string, string>> = {
  arrangement: 'tool3d.toggleArrangement',
  pin: 'tool3d.pin',
  steamBrush: 'tool3d.steamBrush',
  meshGrab: 'tool3d.meshGrab',
};

/**
 * El triángulo de aviso, forzado a presentación de TEXTO (U+FE0E): sin eso, Windows
 * lo pinta como emoji de color y no toma el `color` del token (--warning).
 */
const AVISO = '⚠︎';

/** Una línea del detalle: `tono` dice qué tan grave es, además del color (ley de estado). */
function Linea({ tono, title, children }: { tono?: 'bien' | 'aviso' | 'error' | 'tenue'; title?: string; children: ReactNode }) {
  const grave = tono === 'aviso' || tono === 'error';
  return (
    <div className={`seccion-del-3d__linea${tono ? ` seccion-del-3d__linea--${tono}` : ''}`} title={title}>
      {grave && <span aria-hidden="true">{AVISO} </span>}
      {children}
    </div>
  );
}

/**
 * La sección del 3D de la línea al pie (spec 2026-10-02 «la interfaz en papel»
 * § 5.3, P5): a la izquierda la VOZ —el nombre de la herramienta activa y una
 * frase de cómo se usa; sin herramienta, cómo se mueve la vista— y a la derecha
 * el ESTADO de la simulación: «Simulando · N fps · WebGPU», «En pausa» y un
 * aviso «⚠ n». Pulsar el estado abre el detalle, una hoja de papel por portal.
 *
 * Sustituye a `SimulationStatusOverlay` (una caja negra en la esquina del visor),
 * al «SIMULANDO · N fps» que flotaba junto al dock y al rótulo azul «MODO
 * EDICIÓN»: todo eso se leía sobre la escena y ahora se lee en el marco, donde
 * no tapa nada. El aviso es la «silent-absence surface» de C4 § 3.1.A: nunca se
 * calla, ni con el detalle cerrado ni con la simulación parada.
 *
 * Es contexto 3D de los atajos y una botonera (contrato § 4): con el foco en el
 * estado, Espacio lo pulsa y no arranca la simulación.
 */
export default function SeccionDel3D() {
  const registroDeAtajos = useShortcutRegistry();
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const poseAbierta = useSelector((s: RootState) => s.avatar.poseEditorOpen);
  const esquema = useSelector((s: RootState) => s.inputScheme.scheme);
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

  // ── La voz ─────────────────────────────────────────────────────────────
  // El atajo EFECTIVO, no el de fábrica: el registro guarda los de la usuaria.
  const teclaDe = (accion: string): string | null => {
    const combo = registroDeAtajos?.getBinding(accion);
    return combo ? displayShortcutBinding(combo) : null;
  };
  const voz = vozDelTresD(activeTool3D, { esquema, poseAbierta });
  const accion = poseAbierta ? undefined : ACCION_DE_LA_TECLA[activeTool3D];
  const atajo = accion ? teclaDe(accion) : null;

  // ── El estado ──────────────────────────────────────────────────────────
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

  // Diagnósticos reales que el colapso no puede silenciar (C4 § 3.1.A):
  // la insignia ⚠ delata que hay detalle que leer.
  const warningCount =
    (seamResolution && seamResolution.zeroConstraintSeams.length > 0 ? 1 : 0) +
    (solverTier !== 'none' && !bodyCollision ? 1 : 0) +
    (solverTier !== 'none' && bodyCollision && !TIER_CAPS[solverTier].facePoke ? 1 : 0) +
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

  // Sin simulación ni herramienta sin soporte no hay estado que abrir: se cierra.
  useEffect(() => { if (!hayEstado) setAbierto(false); }, [hayEstado]);

  // Abrir y cerrar el detalle quedan en la bitácora, con el estado que enseñaba: un «no
  // veo el aviso» en la máquina de María se lee ahí.
  const abiertoAntes = useRef(false);
  useEffect(() => {
    if (abiertoAntes.current === abierto) return;
    abiertoAntes.current = abierto;
    pushJournal('ui', 'estado-3d', { abierto, estado: textoDelEstado });
  }, [abierto, textoDelEstado]);

  useEffect(() => {
    if (!abierto) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (botonRef.current?.contains(t) || hojaRef.current?.contains(t)) return;
      setAbierto(false);
    };
    // La hoja se ancla al abrirse; si la ventana cambia de tamaño, se va con el botón.
    const cerrar = () => setAbierto(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', cerrar);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', cerrar);
    };
  }, [abierto]);

  // Con el ratón, ningún botón de la línea al pie se queda con el foco: un clic en
  // cualquier sitio suelta el que dejó el teclado, y el botón pinchado no lo toma.
  // Así Enter y Espacio solo son de un botón del pie cuando se llegó a él con el
  // teclado (`esTeclaDeBotonera`). Es el mismo oído que tiene la sección del patrón,
  // que no está montada con la vista 3D sola.
  useEffect(() => {
    const soltar = () => {
      const activo = document.activeElement;
      if (activo instanceof HTMLElement && activo.matches('[data-botonera] button')) activo.blur();
    };
    window.addEventListener('mousedown', soltar, true);
    return () => window.removeEventListener('mousedown', soltar, true);
  }, []);

  // Esc lo cierra antes que la barra de IA, un panel y la selección: un peldaño de
  // la escalera de lo que se llama (spec 2026-10-02 § 6.2). El foco no se movió.
  usePeldanoDeEscape('estado-3d', 'menu', abierto, () => {
    if (hojaRef.current?.contains(document.activeElement)) botonRef.current?.focus();
    setAbierto(false);
  });

  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
  const clasePorFps = fps >= 50 ? 'bien' : fps >= 30 ? 'aviso' : 'error';

  return (
    <div
      className="linea-al-pie__3d"
      role="group"
      aria-label="Vista 3D"
      data-shortcut-context="3d"
      data-botonera
      onMouseDown={(e) => { if ((e.target as Element).closest('button')) e.preventDefault(); }}
    >
      <div className="seccion-del-3d__voz">
        {voz.nombre && (
          <span className="seccion-del-3d__quien">
            <span className="seccion-del-3d__nombre">{voz.nombre}</span>
            {atajo && <kbd className="seccion-del-3d__tecla">{atajo}</kbd>}
          </span>
        )}
        {/* La región viva va montada SIEMPRE y solo cambia su contenido: los
            lectores de pantalla anuncian cambios DENTRO de una región que ya
            existía (el precedente es ToastContainer.tsx). */}
        <div className="seccion-del-3d__frase" aria-live="polite">
          <span className="seccion-del-3d__texto" data-superficie="pista" title={voz.frase}>{voz.frase}</span>
        </div>
      </div>

      {hayEstado && (
        <button
          ref={botonRef}
          type="button"
          className="seccion-del-3d__boton"
          aria-label="Estado de la simulación"
          aria-expanded={abierto}
          aria-controls="seccion-del-3d-detalle"
          onClick={(e) => {
            if (abierto) { setAbierto(false); return; }
            // Apoyada en el borde de arriba de la línea al pie, no en el del botón, que la taparía.
            const r = e.currentTarget.getBoundingClientRect();
            const arriba = e.currentTarget.closest('.linea-al-pie')?.getBoundingClientRect().top ?? r.top;
            setAncla({ right: window.innerWidth - r.right, bottom: window.innerHeight - arriba + 4 });
            setAbierto(true);
          }}
        >
          <span className={`seccion-del-3d__punto${corriendo ? ' seccion-del-3d__punto--corriendo' : ''}`} aria-hidden="true" />
          <span>{textoDelEstado}</span>
          {warningCount > 0 && (
            <span className="seccion-del-3d__aviso" aria-label={warningCount === 1 ? '1 aviso' : `${warningCount} avisos`}>
              {AVISO} {warningCount}
            </span>
          )}
          <ChevronUp size={12} aria-hidden="true" />
        </button>
      )}

      {abierto && hayEstado && createPortal(
        <div
          ref={hojaRef}
          id="seccion-del-3d-detalle"
          className="seccion-del-3d__detalle"
          role="group"
          aria-label="Detalle de la simulación"
          data-superficie="menu"
          data-material="papel"
          style={{ right: ancla.right, bottom: ancla.bottom }}
        >
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
            <Linea tono="aviso">
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
