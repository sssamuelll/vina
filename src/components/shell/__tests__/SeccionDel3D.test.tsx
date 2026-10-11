// @vitest-environment jsdom
/**
 * La sección del 3D de la línea al pie (spec 2026-10-02 «la interfaz en papel»
 * § 5.3, P5). Dos mitades:
 *
 * - la VOZ (izquierda): el nombre de la herramienta activa y una frase de cómo
 *   se usa; sin herramienta, cómo se mueve la vista. Antes era un rótulo azul
 *   sobre el visor («MODO EDICIÓN — …»).
 * - el ESTADO de la simulación (derecha): «Simulando · N fps · WebGPU», «En
 *   pausa», un aviso «⚠ n» y, al pulsarlo, el detalle. Antes era
 *   `SimulationStatusOverlay`, una caja negra en la esquina del visor, y el
 *   «SIMULANDO · N fps» del dock. Sus pruebas de observabilidad de costuras
 *   (plan de paridad CLO3D, Fase 4) viven aquí: el aviso es la «silent-absence
 *   surface» de C4 § 3.1.A y no puede perderse en la mudanza.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { esTeclaDeBotonera } from '../../../shortcuts/teclaDeBotonera';
import { subirPeldano } from '../../../shortcuts/escaleraDeLoLlamado';
import {
  startSimulation, pauseSimulation, resetSimulation, setSolverTier, setSeamResolution, setParticleCount,
  setFrameTime, setBodyCollision, type SeamResolutionSummary, type SolverTier,
} from '../../../store/simulationSlice';
import { setActiveTool3D } from '../../../store/toolSlice';
import { togglePoseEditor } from '../../../store/avatarSlice';
import { setUserScheme } from '../../../store/inputSchemeSlice';
import { seamResolutionFailureLabel } from '../../Viewport3D/solverTierDisplay';
import SeccionDel3D from '../SeccionDel3D';

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
    store.dispatch(setUserScheme('mouse'));
    if (store.getState().avatar.poseEditorOpen) store.dispatch(togglePoseEditor());
  });
});

const montar = () => render(<Provider store={store}><ShortcutProvider><SeccionDel3D /></ShortcutProvider></Provider>);
const estado = () => screen.queryByRole('button', { name: 'Estado de la simulación' });
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

describe('SeccionDel3D ▸ la sección', () => {
  it('es un grupo con nombre, de contexto 3D, y una botonera', () => {
    montar();
    const g = screen.getByRole('group', { name: 'Vista 3D' });
    expect(g.getAttribute('data-shortcut-context')).toBe('3d');
    expect(g.hasAttribute('data-botonera')).toBe(true);
  });

  it('un clic de ratón no deja el foco en un botón suyo, pero el aire de la sección no se cancela', () => {
    simulando({ ms: 16.7 });
    montar();
    expect(fireEvent.mouseDown(estado()!)).toBe(false);
    expect(fireEvent.mouseDown(screen.getByRole('group', { name: 'Vista 3D' }))).toBe(true);
  });

  it('Espacio y Enter sobre el estado son del botón: no llegan a los atajos (contrato § 4)', () => {
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

describe('SeccionDel3D ▸ la voz', () => {
  it('sin herramienta, dice cómo se mueve la vista y no nombra nada', () => {
    const { container } = montar();
    expect(screen.getByText('Clic derecho orbita · clic central o Alt + arrastrar panea')).toBeTruthy();
    expect(container.querySelector('.seccion-del-3d__nombre')).toBeNull();
  });

  it('con trackpad dice el gesto del trackpad', () => {
    act(() => { store.dispatch(setUserScheme('trackpad')); });
    montar();
    expect(screen.getByText('Dos dedos orbitan · pellizco acerca · Alt + arrastrar panea')).toBeTruthy();
  });

  it('con Colocar activo lo nombra, con la tecla que dé el registro, y dice qué hacer', () => {
    act(() => { store.dispatch(setActiveTool3D('arrangement')); });
    const { container } = montar();
    expect(container.querySelector('.seccion-del-3d__nombre')?.textContent).toBe('Colocar');
    expect(container.querySelector('.seccion-del-3d__tecla')?.textContent).toBe('Shift+F');
    expect(screen.getByText('Clic en la pieza y luego en el punto del cuerpo donde va')).toBeTruthy();
  });

  it('con Fijar activo, la frase solo dice cómo fijar: Ctrl+W lo reserva el navegador y no se anuncia', () => {
    act(() => { store.dispatch(setActiveTool3D('pin')); });
    const { container } = montar();
    expect(container.querySelector('.seccion-del-3d__nombre')?.textContent).toBe('Fijar');
    expect(container.querySelector('.seccion-del-3d__tecla')?.textContent).toBe('W');
    expect(screen.getByText('Clic en la tela para fijar un punto')).toBeTruthy();
    expect(container.textContent).not.toContain('quita todas');
  });

  it('una herramienta sin tecla (Coser) se nombra sin tecla', () => {
    act(() => { store.dispatch(setActiveTool3D('sew3d')); });
    const { container } = montar();
    expect(container.querySelector('.seccion-del-3d__nombre')?.textContent).toBe('Coser');
    expect(container.querySelector('.seccion-del-3d__tecla')).toBeNull();
  });

  it('con la pose abierta gana la pose', () => {
    act(() => { store.dispatch(setActiveTool3D('pin')); store.dispatch(togglePoseEditor()); });
    const { container } = montar();
    expect(container.querySelector('.seccion-del-3d__nombre')?.textContent).toBe('Pose');
    expect(screen.getByText('Arrastra una articulación para cambiar la pose')).toBeTruthy();
  });

  it('una herramienta sin entrada no enseña su id', () => {
    act(() => { store.dispatch(setActiveTool3D('algo-que-no-existe')); });
    const { container } = montar();
    expect(container.querySelector('.seccion-del-3d__nombre')?.textContent).toBe('Herramienta del 3D');
    expect(container.textContent).not.toContain('algo-que-no-existe');
  });

  it('la frase es una pista, se corta con puntos suspensivos y queda entera en el título y en la región viva', () => {
    const { container } = montar();
    const frase = screen.getByText('Clic derecho orbita · clic central o Alt + arrastrar panea');
    expect(frase.getAttribute('data-superficie')).toBe('pista');
    expect(frase.getAttribute('title')).toBe('Clic derecho orbita · clic central o Alt + arrastrar panea');
    expect(frase.closest('[aria-live="polite"]'), 'la región viva debe estar montada siempre').not.toBeNull();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

describe('SeccionDel3D ▸ el estado de la simulación', () => {
  it('en reposo solo está la voz: no hay botón de estado', () => {
    montar();
    expect(estado()).toBeNull();
  });

  it('corriendo, dice «Simulando · N fps · motor» con el motor del solver', () => {
    simulando({ tier: 'webgpu', ms: 16.7 });
    montar();
    expect(estado()!.textContent).toContain('Simulando · 60 fps · WebGPU');
  });

  it('sin cifra hasta el primer cuadro: nunca «0 fps»', () => {
    simulando({ tier: 'webgpu' }); // frameTimeMs sigue en 0: aún no hay ventana de 30 cuadros
    montar();
    expect(estado()!.textContent).toContain('Simulando · WebGPU');
    expect(estado()!.textContent).not.toMatch(/fps/);
  });

  it('el motor del solver es el que se dice', () => {
    simulando({ tier: 'wasm', ms: 33.3 });
    montar();
    expect(estado()!.textContent).toContain('Simulando · 30 fps · WASM XPBD');
  });

  it('en pausa dice «En pausa» y no una cifra', () => {
    simulando({ tier: 'webgpu', ms: 16.7 });
    act(() => { store.dispatch(pauseSimulation()); });
    montar();
    expect(estado()!.textContent).toContain('En pausa');
    expect(estado()!.textContent).not.toContain('Simulando');
    expect(estado()!.textContent).not.toMatch(/fps/);
  });

  it('el punto de estado se enciende solo mientras corre', () => {
    simulando({ tier: 'webgpu', ms: 16.7 });
    const { container, rerender } = montar();
    expect(container.querySelector('.seccion-del-3d__punto--corriendo')).not.toBeNull();
    act(() => { store.dispatch(pauseSimulation()); });
    rerender(<Provider store={store}><ShortcutProvider><SeccionDel3D /></ShortcutProvider></Provider>);
    expect(container.querySelector('.seccion-del-3d__punto--corriendo')).toBeNull();
    expect(container.querySelector('.seccion-del-3d__punto')).not.toBeNull();
  });

  it('arranca colapsado: el estado a la vista y el detalle escondido', () => {
    simulando();
    montar();
    expect(estado()).not.toBeNull();
    expect(estado()!.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/partículas/)).toBeNull();
    expect(screen.queryByText(/restricciones de costura/)).toBeNull();
    expect(screen.queryByText(/Modo:/)).toBeNull();
  });

  it('un clic abre el detalle y otro lo cierra', () => {
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

  it('el detalle cuelga de <body>, es papel y se declara menú', () => {
    simulando();
    const { container } = montar();
    abrir();
    const hoja = detalle()!;
    expect(container.contains(hoja), 'el detalle quedó dentro de la línea al pie: nada fixed escapa de ahí').toBe(false);
    expect(hoja.parentElement).toBe(document.body);
    expect(hoja.getAttribute('data-material')).toBe('papel');
    expect(hoja.getAttribute('data-superficie')).toBe('menu');
  });

  it('Escape lo cierra por la escalera: la barra de IA sigue, y el siguiente Escape es de la barra', () => {
    simulando();
    let alEscapeIA = 0;
    bajarIA = subirPeldano('ia', 'ia', () => { alEscapeIA += 1; });
    montar();
    abrir();
    expect(detalle(), 'el caso no se ejerce').not.toBeNull();
    escape();
    expect(detalle()).toBeNull();
    expect(alEscapeIA).toBe(0);
    escape();
    expect(alEscapeIA).toBe(1);
  });

  it('un clic fuera del detalle lo cierra, uno dentro no', () => {
    simulando();
    montar();
    abrir();
    fireEvent.mouseDown(detalle()!);
    expect(detalle()).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(detalle()).toBeNull();
  });

  it('el detalle da fps y ms, partículas y el modo', () => {
    simulando({ ms: 16.7 });
    montar();
    abrir();
    expect(screen.getByText('60 fps (16.7 ms)')).toBeTruthy();
    expect(screen.getByText(/Modo: normal/)).toBeTruthy();
  });
});

describe('SeccionDel3D ▸ los avisos nunca se callan (C4 § 3.1.A)', () => {
  it('con una costura sin restricciones, el aviso se ve aunque el detalle esté colapsado', () => {
    simulando({ seam: { totalConstraints: 80, zeroConstraintSeams: [{ seamId: 'seam-7', reason: 'unknown-edge' }] } });
    montar();
    // La superficie de silent-absence no puede quedar invisible por el colapso.
    expect(screen.getByLabelText(/aviso/i)).toBeTruthy();
  });

  it('el número de avisos se cuenta y se anuncia', () => {
    // WASM (+1: funciones limitadas), sin colisión con el cuerpo (+1) y una costura sin restricciones (+1).
    simulando({ tier: 'wasm', seam: { totalConstraints: 80, zeroConstraintSeams: [{ seamId: 's', reason: 'unknown-edge' }] } });
    montar();
    const aviso = screen.getByLabelText('3 avisos');
    // El triángulo va en presentación de TEXTO (U+FE0E): como emoji no tomaría --warning.
    expect(aviso.textContent).toMatch(/^⚠︎ 3$/);
    expect(aviso.className).toContain('seccion-del-3d__aviso');
  });

  it('un solo aviso se anuncia en singular', () => {
    // Ningún motor detecta hoy la penetración del cuerpo (facePoke es falso en los
    // cuatro): con colisión y WebGPU queda ese único aviso.
    simulando({ tier: 'webgpu', seam: null });
    act(() => { store.dispatch(setBodyCollision(true)); });
    montar();
    expect(screen.getByLabelText('1 aviso').textContent).toMatch(/^⚠︎ 1$/);
  });

  it('la herramienta sin soporte avisa AUNQUE NO SE SIMULE', () => {
    // La plancha a vapor solo corre en WebGPU. En reposo el motor es «ninguno»:
    // arrastrar sobre la tela no haría nada y sin este aviso nadie sabría por qué.
    act(() => { store.dispatch(setActiveTool3D('steamBrush')); });
    montar();
    expect(estado(), 'en reposo con una herramienta sin soporte, el estado debe verse').not.toBeNull();
    expect(screen.getByLabelText('1 aviso')).toBeTruthy();
    abrir();
    expect(screen.getByText(/La herramienta activa \(plancha a vapor\) no funciona con este motor/)).toBeTruthy();
  });

  it('en reposo, sin herramienta sin soporte, no hay estado ni insignia', () => {
    montar();
    expect(estado()).toBeNull();
    expect(screen.queryByLabelText(/aviso/i)).toBeNull();
  });

  it('el agarre de malla funciona en WASM: ahí no avisa de la herramienta', () => {
    act(() => { store.dispatch(setActiveTool3D('meshGrab')); });
    simulando({ tier: 'wasm', seam: null });
    act(() => { store.dispatch(setBodyCollision(true)); });
    montar();
    abrir();
    expect(screen.queryByText(/La herramienta activa/)).toBeNull();
  });

  it('el agarre de malla no funciona con CPU: ahí avisa', () => {
    act(() => { store.dispatch(setActiveTool3D('meshGrab')); });
    simulando({ tier: 'cpu-worker', seam: null });
    montar();
    abrir();
    expect(screen.getByText(/La herramienta activa \(agarre de malla\) no funciona con este motor/)).toBeTruthy();
  });
});

describe('SeccionDel3D ▸ observabilidad de costuras (Fase 4, tras abrir el detalle)', () => {
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
    expect(aviso.className, 'es un fallo, no un aviso: no va a coser').toContain('seccion-del-3d__linea--error');
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
    expect(screen.getByText(/Sin colisión con el cuerpo/).className).toContain('seccion-del-3d__linea--aviso');
    const limitado = screen.getByText(/Funciones limitadas/);
    expect(limitado.className).toContain('seccion-del-3d__linea--aviso');
    expect(limitado.title).toMatch(/LRA/);
  });

  it('con colisión, avisa de que el cuerpo puede asomar: ningún motor detecta la penetración', () => {
    simulando({ tier: 'webgpu', seam: null });
    act(() => { store.dispatch(setBodyCollision(true)); });
    montar();
    abrir();
    expect(screen.getByText(/El cuerpo puede asomar a través de la tela/).className).toContain('seccion-del-3d__linea--aviso');
    expect(screen.queryByText(/Sin colisión con el cuerpo/)).toBeNull();
  });
});

describe('SeccionDel3D no trae el material oscuro ni los colores sueltos de antes', () => {
  // El estado vive en el marco (tinta clara de :root) y el detalle en papel:
  // los dos con tokens. El punto de estado es --success y el aviso, --warning.
  const lee = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');
  const css = lee('src/components/shell/SeccionDel3D.css');
  const tsx = lee('src/components/shell/SeccionDel3D.tsx');
  const regla = (selector: string) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

  // Sin comentarios: «#608» es el número de un issue, no un color.
  const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it.each([['.css', css], ['.tsx', tsx]])('el %s no escribe colores a mano', (_n, src) => {
    expect(sinComentarios(src).match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/g) ?? []).toEqual([]);
  });

  it('el punto corriendo es --success y el aviso es --warning', () => {
    expect(regla('.seccion-del-3d__punto--corriendo')).toContain('var(--success)');
    expect(regla('.seccion-del-3d__aviso')).toContain('var(--warning)');
    expect(regla('.seccion-del-3d__linea--error')).toContain('var(--destructive)');
    expect(regla('.seccion-del-3d__linea--aviso')).toContain('var(--warning)');
  });

  it('no usa el color del motor de SOLVER_TIER_INFO: el estado no se tiñe por motor', () => {
    expect(tsx).not.toMatch(/\.color\b/);
  });

  it('el detalle es papel: su hoja declara data-material y se pinta con el material de lo que flota', () => {
    expect(tsx).toContain('data-material="papel"');
    const hoja = regla('.seccion-del-3d__detalle');
    for (const token of ['--surface-overlay-bg', '--surface-overlay-border', '--surface-overlay-radius', '--surface-overlay-shadow', '--z-menu']) {
      expect(hoja, `la hoja no usa ${token}`).toContain(`var(${token})`);
    }
  });
});

describe('SeccionDel3D ▸ lo que el pie no debe decir ni hacer', () => {
  it('en reposo con el motor de la corrida anterior, el estado no nombra ese motor', () => {
    act(() => { store.dispatch(setSolverTier('wasm')); store.dispatch(setActiveTool3D('steamBrush')); });
    montar();
    expect(estado()!.textContent).toContain('En reposo');
    expect(estado()!.textContent).not.toContain('WASM');
  });

  it('un clic en cualquier sitio suelta el foco de teclado de un botón del pie', () => {
    simulando({ ms: 16.7 });
    montar();
    estado()!.focus();
    expect(document.activeElement).toBe(estado());
    fireEvent.mouseDown(document.body);
    expect(document.activeElement).not.toBe(estado());
  });

  it('con la pose abierta no se enseña la tecla de la herramienta de debajo', () => {
    act(() => { store.dispatch(setActiveTool3D('pin')); store.dispatch(togglePoseEditor()); });
    const { container } = montar();
    expect(container.querySelector('.seccion-del-3d__tecla')).toBeNull();
  });

  it('el detalle no dice «0 fps» antes del primer cuadro, ni habla del modo en reposo', () => {
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

  it('el agarre de malla funciona en WebGPU: ahí no avisa de la herramienta', () => {
    act(() => { store.dispatch(setActiveTool3D('meshGrab')); });
    simulando({ tier: 'webgpu', seam: null });
    act(() => { store.dispatch(setBodyCollision(true)); });
    montar();
    abrir();
    expect(screen.queryByText(/La herramienta activa/)).toBeNull();
  });

  it('un clic sobre lo de dentro del botón (el punto, el texto) tampoco deja el foco', () => {
    simulando({ ms: 16.7 });
    montar();
    expect(fireEvent.mouseDown(estado()!.querySelector('span')!)).toBe(false);
  });
});
