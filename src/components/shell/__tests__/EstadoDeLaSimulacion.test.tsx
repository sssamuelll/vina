// @vitest-environment jsdom
/**
 * El estado de la simulación, al pie del margen del 3D (enmienda 2026-10-11 a la
 * spec «la interfaz en papel» § 4.5). Es un icono: el ⚠ con su número si hay
 * avisos; si no, el pulso mientras simula y la pausa detenida. Al pulsarlo
 * despliega el detalle a la izquierda del margen. En P5 era una línea
 * «Simulando · N fps · WebGPU ⚠ n» en la línea al pie y, antes,
 * `SimulationStatusOverlay`, una caja negra en la esquina del visor. Samuel pidió
 * los mensajes del simulador «en otro lado o que sea muy muy pequeño tipo un par
 * de iconos o algo así y expandible», y de las dos maquetas eligió esta.
 *
 * Las pruebas de observabilidad de costuras (plan de paridad CLO3D, Fase 4) se
 * mudan con él: el aviso es la «silent-absence surface» de C4 § 3.1.A y no puede
 * perderse en la mudanza.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { esTeclaDeBotonera } from '../../../shortcuts/teclaDeBotonera';
import { subirPeldano } from '../../../shortcuts/escaleraDeLoLlamado';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';
import {
  startSimulation, pauseSimulation, resetSimulation, setSolverTier, setSeamResolution, setParticleCount,
  setFrameTime, setBodyCollision, type SeamResolutionSummary, type SolverTier,
} from '../../../store/simulationSlice';
import { setActiveTool3D } from '../../../store/toolSlice';
import { seamResolutionFailureLabel } from '../../Viewport3D/solverTierDisplay';
import EstadoDeLaSimulacion from '../EstadoDeLaSimulacion';

let bajarIA: (() => void) | null = null;
afterEach(() => {
  bajarIA?.();
  bajarIA = null;
  cleanup();
  act(() => {
    store.dispatch(resetSimulation());
    store.dispatch(setSolverTier('none'));
    store.dispatch(setFrameTime(0));
    store.dispatch(setParticleCount(0));
    store.dispatch(setSeamResolution(null));
    store.dispatch(setBodyCollision(false));
    store.dispatch(setActiveTool3D('camera'));
  });
});

// Dentro de un margen como el de RightDock: el detalle se ancla a él, y es una botonera.
const montar = () => render(
  <Provider store={store}>
    <ShortcutProvider>
      <nav className="margen margen--derecho" aria-label="Herramientas del 3D" data-botonera>
        <EstadoDeLaSimulacion />
      </nav>
    </ShortcutProvider>
  </Provider>,
);
const estado = () => screen.queryByRole('button', { name: /^Estado de la simulación/ });
const nombre = () => estado()!.getAttribute('aria-label') ?? '';
const detalle = () => screen.queryByRole('group', { name: 'Detalle de la simulación' });

/** La simulación en marcha, con un motor y (si se pide) un resumen de costuras. */
function simulando(opciones: { tier?: SolverTier; seam?: SeamResolutionSummary | null; ms?: number } = {}) {
  act(() => {
    store.dispatch(startSimulation());
    store.dispatch(setSolverTier(opciones.tier ?? 'wasm'));
    store.dispatch(setParticleCount(29338));
    store.dispatch(setSeamResolution(opciones.seam === undefined ? { totalConstraints: 124, zeroConstraintSeams: [] } : opciones.seam));
    if (opciones.ms !== undefined) store.dispatch(setFrameTime(opciones.ms));
  });
}
const abrir = () => fireEvent.click(estado()!);
const escape = () => act(() => {
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
});

describe('EstadoDeLaSimulacion ▸ el icono', () => {
  it('en reposo no está: el margen solo lleva sus herramientas', () => {
    const { container } = montar();
    expect(estado()).toBeNull();
    expect(container.querySelector('.estado-de-la-simulacion')).toBeNull();
  });

  it('con un aviso o más es el ⚠ con su número, sin texto que leer en la pantalla', () => {
    simulando({ tier: 'webgpu', ms: 16.7 }); // sin colisión con el cuerpo: 1 aviso
    montar();
    const boton = estado()!;
    expect(boton.querySelector('.estado-de-la-simulacion__cuenta')!.textContent).toBe('1');
    expect(boton.className).toContain('estado-de-la-simulacion__boton--aviso');
    expect(boton.textContent, 'el estado ya no se escribe: es un icono').toBe('1');
  });

  it('sin avisos (el motor aún sin elegir) enseña el pulso mientras simula y la pausa detenida', () => {
    act(() => { store.dispatch(startSimulation()); });
    const { container, rerender } = montar();
    expect(estado()!.className).toContain('estado-de-la-simulacion__boton--corriendo');
    expect(container.querySelector('.estado-de-la-simulacion__cuenta')).toBeNull();
    const pulso = estado()!.querySelector('svg')!.innerHTML;
    act(() => { store.dispatch(pauseSimulation()); });
    rerender(<Provider store={store}><ShortcutProvider><nav className="margen" data-botonera><EstadoDeLaSimulacion /></nav></ShortcutProvider></Provider>);
    expect(estado()!.className).not.toContain('estado-de-la-simulacion__boton--corriendo');
    expect(estado()!.querySelector('svg')!.innerHTML, 'en pausa el icono no cambia: el estado no puede depender solo del tono').not.toBe(pulso);
  });

  it('su nombre dice el estado, el motor y los avisos: lo que la pantalla ya no escribe lo oye el lector', () => {
    simulando({ tier: 'webgpu', ms: 16.7 });
    montar();
    expect(nombre()).toBe('Estado de la simulación: Simulando · WebGPU · 1 aviso');
  });

  it('la cifra no va en el nombre: cambiaba dos veces por segundo y el lector la releía con el foco encima', () => {
    // `setFrameTime` se despacha cada 30 cuadros; los fps viven en el detalle.
    simulando({ tier: 'webgpu', ms: 16.7 });
    montar();
    const antes = nombre();
    act(() => { store.dispatch(setFrameTime(33.3)); });
    expect(nombre()).toBe(antes);
    expect(nombre()).not.toMatch(/fps/);
  });

  it('el motor del solver es el que se dice', () => {
    simulando({ tier: 'wasm', ms: 33.3 });
    montar();
    expect(nombre()).toContain('Simulando · WASM XPBD');
  });

  it('es un botón del margen: su tamaño, su hover y su anillo de foco son los de las herramientas', () => {
    simulando();
    montar();
    expect(estado()!.classList.contains('dock__tool')).toBe(true);
  });

  it('un clic de ratón no le deja el foco: Espacio sigue siendo el atajo de simular', () => {
    // `fireEvent.click` trae `detail: 0` (el camino del teclado); el ratón trae 1.
    simulando();
    montar();
    fireEvent.click(estado()!, { detail: 1 });
    expect(detalle(), 'el caso no se ejerce').not.toBeNull();
    expect(document.activeElement).not.toBe(estado());
  });

  it('su tooltip es corto, y con el detalle abierto no sale encima de él', () => {
    simulando({ tier: 'wasm', ms: 33.3, seam: { totalConstraints: 80, zeroConstraintSeams: [{ seamId: 's', reason: 'unknown-edge' }] } });
    vi.useFakeTimers();
    try {
      const { container } = montar();
      const pasar = () => {
        const envoltorio = container.querySelector('.estado-de-la-simulacion .tool-tooltip-wrapper')!;
        fireEvent.mouseLeave(envoltorio);
        fireEvent.mouseEnter(envoltorio);
        act(() => { vi.advanceTimersByTime(600); });
      };
      pasar();
      // El resumen entero («Simulando · WASM XPBD · 3 avisos») no cabía en los 240 px del tooltip.
      expect(document.querySelector('.tool-tooltip-name')?.textContent).toBe('Estado de la simulación');
      abrir();
      pasar();
      expect(document.querySelector('.tool-tooltip'), 'el tooltip tapa las últimas líneas del detalle, los avisos').toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('en pausa dice «En pausa» y no una cifra', () => {
    simulando({ tier: 'webgpu', ms: 16.7 });
    act(() => { store.dispatch(pauseSimulation()); });
    montar();
    expect(nombre()).toContain('En pausa');
    expect(nombre()).not.toContain('Simulando');
    expect(nombre()).not.toMatch(/fps/);
  });

  it('en reposo con el motor de la corrida anterior, el estado no nombra ese motor', () => {
    act(() => { store.dispatch(setSolverTier('wasm')); store.dispatch(setActiveTool3D('steamBrush')); });
    montar();
    expect(nombre()).toContain('En reposo');
    expect(nombre()).not.toContain('WASM');
  });

  it('Espacio y Enter sobre el icono son del botón: no llegan a los atajos (contrato § 4)', () => {
    simulando({ ms: 16.7 });
    montar();
    const visto: boolean[] = [];
    const oyente = (e: KeyboardEvent) => visto.push(esTeclaDeBotonera(e));
    document.addEventListener('keydown', oyente);
    try {
      fireEvent.keyDown(estado()!, { key: ' ' });
      fireEvent.keyDown(estado()!, { key: 'Enter' });
    } finally {
      document.removeEventListener('keydown', oyente);
    }
    expect(visto).toEqual([true, true]);
  });
});

describe('EstadoDeLaSimulacion ▸ el detalle', () => {
  it('arranca cerrado: el icono a la vista y el detalle escondido', () => {
    simulando();
    montar();
    expect(estado()!.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/partículas/)).toBeNull();
    expect(screen.queryByText(/Modo:/)).toBeNull();
  });

  it('un clic lo despliega y otro lo cierra', () => {
    simulando();
    montar();
    abrir();
    expect(estado()!.getAttribute('aria-expanded')).toBe('true');
    // Separador de miles según el locale de la máquina (29,338 / 29.338)
    expect(screen.getByText(/29[.,]338 partículas/)).toBeTruthy();
    abrir();
    expect(screen.queryByText(/29[.,]338 partículas/)).toBeNull();
    expect(estado()!.getAttribute('aria-expanded')).toBe('false');
  });

  it('empieza diciendo lo que el icono no escribe: el estado y el motor, sin la cifra', () => {
    simulando({ tier: 'webgpu', ms: 16.7 });
    montar();
    abrir();
    const primera = detalle()!.firstElementChild!;
    expect(primera.textContent).toBe('Simulando · WebGPU');
    expect(primera.className).toContain('estado-de-la-simulacion__linea--cabecera');
    fireEvent.click(estado()!);
    act(() => { store.dispatch(pauseSimulation()); });
    abrir();
    expect(detalle()!.firstElementChild!.textContent, 'en pausa también se dice el motor').toBe('En pausa · WebGPU');
  });

  it('cuelga de <body>, es papel y se declara menú', () => {
    simulando();
    const { container } = montar();
    abrir();
    const hoja = detalle()!;
    expect(container.contains(hoja), 'el detalle quedó dentro del margen: nada fixed escapa de ahí').toBe(false);
    expect(hoja.parentElement).toBe(document.body);
    expect(hoja.getAttribute('data-material')).toBe('papel');
    expect(hoja.getAttribute('data-superficie')).toBe('menu');
  });

  it('se abre a la izquierda del margen, con su borde de abajo en el del icono', () => {
    simulando();
    const { container } = montar();
    const margen = container.querySelector('nav')!;
    const caja = (left: number, top: number, right: number, bottom: number) =>
      ({ left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    margen.getBoundingClientRect = () => caja(window.innerWidth - 44, 36, window.innerWidth, window.innerHeight - 36);
    estado()!.getBoundingClientRect = () => caja(window.innerWidth - 41, 560, window.innerWidth - 3, 598);
    abrir();
    expect(detalle()!.style.right, 'el detalle tapa el margen').toBe(`${44 + 6}px`);
    expect(detalle()!.style.bottom).toBe(`${window.innerHeight - 598}px`);
  });

  it('Escape lo cierra por la escalera: la barra de IA sigue, y el siguiente Escape es de la barra', () => {
    simulando();
    let alEscapeIA = 0;
    montar();
    abrir();
    // La barra de IA se llama DESPUÉS: a igual peldaño gana el último, así que solo el
    // peldaño de menú del detalle hace que el primer Escape sea suyo.
    bajarIA = subirPeldano('ia', 'ia', () => { alEscapeIA += 1; });
    expect(detalle(), 'el caso no se ejerce').not.toBeNull();
    escape();
    expect(detalle()).toBeNull();
    expect(alEscapeIA).toBe(0);
    escape();
    expect(alEscapeIA).toBe(1);
  });

  it('abrirlo y cerrarlo quedan en la bitácora: la caja negra ve la superficie, no solo los dispatches', () => {
    clearJournal();
    simulando();
    montar();
    abrir();
    escape();
    const eventos = getJournal().events.filter((e) => e.kind === 'ui' && e.name === 'estado-3d').map((e) => (e.data as { abierto: boolean }).abierto);
    expect(eventos).toEqual([true, false]);
  });

  it('si la ventana cambia de tamaño se cierra: el ancla ya no está donde el icono', () => {
    simulando();
    montar();
    abrir();
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(detalle()).toBeNull();
  });

  it('un clic fuera lo cierra, uno dentro no', () => {
    simulando();
    montar();
    abrir();
    fireEvent.mouseDown(detalle()!);
    expect(detalle()).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(detalle()).toBeNull();
  });

  it('da fps y ms, partículas y el modo', () => {
    simulando({ ms: 16.7 });
    montar();
    abrir();
    expect(screen.getByText('60 fps (16.7 ms)')).toBeTruthy();
    expect(screen.getByText(/Modo: normal/)).toBeTruthy();
  });

  it('no dice «0 fps» antes del primer cuadro, ni habla del modo en reposo', () => {
    simulando();
    montar();
    abrir();
    expect(detalle()!.textContent).not.toMatch(/(^|\D)0 fps/);
    cleanup();
    act(() => { store.dispatch(resetSimulation()); store.dispatch(setActiveTool3D('steamBrush')); });
    montar();
    abrir();
    expect(detalle(), 'el caso no se ejerce').not.toBeNull();
    expect(detalle()!.textContent).not.toContain('Modo:');
  });
});

describe('EstadoDeLaSimulacion ▸ los avisos nunca se callan (C4 § 3.1.A)', () => {
  it('con una costura sin restricciones, el aviso se ve con el detalle cerrado', () => {
    simulando({ seam: { totalConstraints: 80, zeroConstraintSeams: [{ seamId: 'seam-7', reason: 'unknown-edge' }] } });
    montar();
    expect(estado()!.className).toContain('estado-de-la-simulacion__boton--aviso');
    expect(nombre()).toMatch(/aviso/);
  });

  it('el número de avisos se cuenta y se anuncia', () => {
    // WASM (+1: funciones limitadas), sin colisión con el cuerpo (+1) y una costura sin restricciones (+1).
    simulando({ tier: 'wasm', seam: { totalConstraints: 80, zeroConstraintSeams: [{ seamId: 's', reason: 'unknown-edge' }] } });
    montar();
    expect(estado()!.querySelector('.estado-de-la-simulacion__cuenta')!.textContent).toBe('3');
    expect(nombre()).toMatch(/· 3 avisos$/);
  });

  it('un solo aviso se anuncia en singular', () => {
    simulando({ tier: 'webgpu', seam: null }); // sin colisión con el cuerpo: un aviso
    montar();
    expect(nombre()).toMatch(/· 1 aviso$/);
  });

  it('lo que el motor no sabe hacer no es un aviso: con colisión y sin problemas, el icono es el pulso', () => {
    // Ningún motor detecta hoy la penetración del cuerpo (facePoke es falso en los cuatro).
    // Contarlo encendía el ⚠ en toda simulación con un motor elegido, y el pulso y la pausa no
    // se veían nunca. Samuel, el 11-10: que el ⚠ cuente solo los problemas de la corrida.
    simulando({ tier: 'webgpu', seam: null, ms: 16.7 });
    act(() => { store.dispatch(setBodyCollision(true)); });
    montar();
    expect(estado()!.className).toContain('estado-de-la-simulacion__boton--corriendo');
    expect(estado()!.querySelector('.estado-de-la-simulacion__cuenta')).toBeNull();
    expect(nombre()).toBe('Estado de la simulación: Simulando · WebGPU');
  });

  it('la herramienta sin soporte avisa AUNQUE NO SE SIMULE', () => {
    // La plancha a vapor solo corre en WebGPU. En reposo el motor es «ninguno»:
    // arrastrar sobre la tela no haría nada y sin este aviso nadie sabría por qué.
    act(() => { store.dispatch(setActiveTool3D('steamBrush')); });
    montar();
    expect(estado(), 'en reposo con una herramienta sin soporte, el estado debe verse').not.toBeNull();
    expect(nombre()).toMatch(/· 1 aviso$/);
    abrir();
    expect(screen.getByText(/La herramienta activa \(plancha a vapor\) no funciona con este motor/)).toBeTruthy();
  });

  it('el agarre de malla funciona en WASM y en WebGPU: ahí no avisa de la herramienta', () => {
    act(() => { store.dispatch(setActiveTool3D('meshGrab')); });
    for (const tier of ['wasm', 'webgpu'] as const) {
      simulando({ tier, seam: null });
      act(() => { store.dispatch(setBodyCollision(true)); });
      montar();
      abrir();
      expect(screen.queryByText(/La herramienta activa/), tier).toBeNull();
      cleanup();
    }
  });

  it('el agarre de malla no funciona con CPU: ahí avisa', () => {
    act(() => { store.dispatch(setActiveTool3D('meshGrab')); });
    simulando({ tier: 'cpu-worker', seam: null });
    montar();
    abrir();
    expect(screen.getByText(/La herramienta activa \(agarre de malla\) no funciona con este motor/)).toBeTruthy();
  });
});

describe('EstadoDeLaSimulacion ▸ observabilidad de costuras (Fase 4, tras abrir el detalle)', () => {
  it('da el total de restricciones de costura cuando hay resumen', () => {
    simulando({ seam: { totalConstraints: 124, zeroConstraintSeams: [] } });
    montar();
    abrir();
    expect(screen.getByText(/124 restricciones de costura/)).toBeTruthy();
    expect(screen.queryByText(/no va a coser/)).toBeNull();
  });

  it('avisa en rojo cuando una costura se resolvió con 0 restricciones, con la causa por costura en el título', () => {
    simulando({ seam: { totalConstraints: 80, zeroConstraintSeams: [{ seamId: 'seam-7', reason: 'unknown-edge' }] } });
    montar();
    abrir();
    const aviso = screen.getByText(/1 costura sin restricciones — no va a coser/);
    expect(aviso.className, 'es un fallo, no un aviso: no va a coser').toContain('estado-de-la-simulacion__linea--error');
    expect(aviso.textContent).toMatch(/^⚠︎ /);
    // Atado al mapa de etiquetas, no a la cadena: la causa se le muestra a María
    // traducida, y el enum crudo («unknown-edge») no debe llegarle nunca.
    expect(aviso.title).toContain(`seam-7 (${seamResolutionFailureLabel('unknown-edge')})`);
    expect(aviso.title).not.toContain('unknown-edge');
  });

  it('pluraliza el aviso de costuras sin restricciones', () => {
    simulando({
      seam: {
        totalConstraints: 0,
        zeroConstraintSeams: [{ seamId: 's1', reason: 'unknown-edge' }, { seamId: 's2', reason: 'empty-match' }],
      },
    });
    montar();
    abrir();
    expect(screen.getByText(/2 costuras sin restricciones/)).toBeTruthy();
  });

  it('un proyecto sin costuras (resumen nulo) no pinta línea de costuras', () => {
    simulando({ seam: null });
    montar();
    abrir();
    expect(screen.queryByText(/restricciones de costura/)).toBeNull();
    expect(screen.queryByText(/no va a coser/)).toBeNull();
  });

  it('avisa del motor limitado (WASM) y del cuerpo sin colisión, con su explicación en el título', () => {
    simulando({ tier: 'wasm', seam: null });
    montar();
    abrir();
    const sinColision = screen.getByText(/Sin colisión con el cuerpo/);
    expect(sinColision.className).toContain('estado-de-la-simulacion__linea--aviso');
    // Lo grave lleva su triángulo además del tono (ley de estado: no solo el color).
    expect(sinColision.textContent).toMatch(/^⚠︎ /);
    const limitado = screen.getByText(/Funciones limitadas/);
    expect(limitado.className).toContain('estado-de-la-simulacion__linea--aviso');
    expect(limitado.title).toMatch(/LRA/);
  });

  it('con colisión, el detalle dice que el cuerpo puede asomar, como nota y no como aviso', () => {
    // Ningún motor detecta la penetración: no se calla (C4 § 3.1.A), pero es un límite del
    // motor, no un problema de la corrida, así que va tenue, sin triángulo y sin contar.
    simulando({ tier: 'webgpu', seam: null });
    act(() => { store.dispatch(setBodyCollision(true)); });
    montar();
    abrir();
    const nota = screen.getByText(/El cuerpo puede asomar a través de la tela/);
    expect(nota.className).toContain('estado-de-la-simulacion__linea--tenue');
    expect(nota.textContent, 'una nota no lleva el triángulo de los avisos').not.toMatch(/⚠/);
    expect(screen.queryByText(/Sin colisión con el cuerpo/)).toBeNull();
  });
});

describe('EstadoDeLaSimulacion no trae colores sueltos', () => {
  // El icono vive en el margen (papel) y el detalle flota (papel): los dos con tokens.
  const lee = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');
  const css = lee('src/components/shell/EstadoDeLaSimulacion.css');
  const tsx = lee('src/components/shell/EstadoDeLaSimulacion.tsx');
  const regla = (selector: string) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

  // Sin comentarios: «#608» es el número de un issue, no un color.
  const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it.each([['.css', css], ['.tsx', tsx]])('el %s no escribe colores a mano', (_n, src) => {
    expect(sinComentarios(src).match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/g) ?? []).toEqual([]);
  });

  it('el aviso es --warning, el pulso --success, y las líneas del detalle llevan su tono', () => {
    expect(regla('.estado-de-la-simulacion__boton--aviso svg')).toContain('var(--warning)');
    // La cuenta es texto de 11 px: --warning sobre --bg-elevated (hover, abierto) da 4,45:1.
    expect(regla('.estado-de-la-simulacion__cuenta')).toContain('var(--text-primary)');
    expect(regla('.estado-de-la-simulacion__boton--corriendo svg')).toContain('var(--success)');
    expect(regla('.estado-de-la-simulacion__linea--error')).toContain('var(--destructive)');
    expect(regla('.estado-de-la-simulacion__linea--aviso')).toContain('var(--warning)');
  });

  it('no usa el color del motor de SOLVER_TIER_INFO: el estado no se tiñe por motor', () => {
    expect(tsx).not.toMatch(/\.color\b/);
  });

  it('el detalle es papel: su hoja declara data-material y se pinta con el material de lo que flota', () => {
    expect(tsx).toContain('data-material="papel"');
    const hoja = regla('.estado-de-la-simulacion__detalle');
    for (const token of ['--surface-overlay-bg', '--surface-overlay-border', '--surface-overlay-radius', '--surface-overlay-shadow', '--z-menu']) {
      expect(hoja, `la hoja no usa ${token}`).toContain(`var(${token})`);
    }
  });

  it('abierto pesa más que rozado: además del relleno, un anillo (ley de estado)', () => {
    const abierto = regla('.estado-de-la-simulacion__boton[aria-expanded="true"]:hover');
    expect(abierto).toContain('background: var(--bg-elevated)');
    expect(abierto).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--border\)/);
  });

  it('va al pie del margen, debajo de las herramientas', () => {
    expect(regla('.estado-de-la-simulacion')).toContain('margin-top: auto');
  });
});
