/**
 * @vitest-environment jsdom
 *
 * Guards the SurfaceModePill — the floating 9-way surface-mode picker for the
 * 3D viewport (spec 2026-06-04 display-toggles-resurface §3).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import simulationReducer, { setSurfaceMode3D } from '../../../store/simulationSlice';
import SurfaceModePill from '../SurfaceModePill';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';

afterEach(cleanup);

function renderPill() {
  const store = configureStore({ reducer: { simulation: simulationReducer } });
  render(<Provider store={store}><ShortcutProvider><SurfaceModePill /></ShortcutProvider></Provider>);
  return store;
}

describe('SurfaceModePill', () => {
  it('collapsed trigger names the current mode', () => {
    // El label ES ya no deriva del id del modo — mapa explícito (Fase 3).
    const ES_LABELS: Record<string, string> = {
      textured: 'texturizado', translucent: 'translúcido', mesh: 'malla',
      thick: 'con grosor', flat: 'plano', xray: 'rayos x', shaded: 'sombreado',
      'shaded-wire': 'sombreado + alambre', 'textured-wire': 'texturizado + alambre',
    };
    const store = renderPill();
    const mode = store.getState().simulation.surfaceMode3D;
    const trigger = screen.getByRole('button', { name: /^modo de superficie:/i });
    expect(trigger.getAttribute('aria-label')!.toLowerCase()).toContain(ES_LABELS[String(mode)]);
  });

  it('opens a flyout with all 9 modes', () => {
    renderPill();
    fireEvent.click(screen.getByRole('button', { name: /^modo de superficie:/i }));
    const group = screen.getByRole('group', { name: 'Modo de superficie' });
    expect(group.querySelectorAll('button').length).toBe(9);
  });

  it('selecting X-Ray dispatches setSurfaceMode3D and closes the flyout', () => {
    const store = renderPill();
    fireEvent.click(screen.getByRole('button', { name: /^modo de superficie:/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Rayos X' }));
    expect(store.getState().simulation.surfaceMode3D).toBe('xray');
    expect(screen.queryByRole('group', { name: 'Modo de superficie' })).toBeNull();
    // trigger label follows the store
    expect(screen.getByRole('button', { name: 'Modo de superficie: Rayos X' })).toBeTruthy();
  });

  it('marks the current mode with aria-pressed', () => {
    const store = renderPill();
    store.dispatch(setSurfaceMode3D('mesh'));
    fireEvent.click(screen.getByRole('button', { name: /^modo de superficie:/i }));
    expect(screen.getByRole('button', { name: 'Malla' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Plano' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('Escape closes the flyout', () => {
    renderPill();
    fireEvent.click(screen.getByRole('button', { name: /^modo de superficie:/i }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Modo de superficie' })).toBeNull();
  });

  it('a mousedown outside the pill closes the flyout', () => {
    renderPill();
    fireEvent.click(screen.getByRole('button', { name: /^modo de superficie:/i }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('group', { name: 'Modo de superficie' })).toBeNull();
  });

  it('a mousedown inside the flyout does not close it', () => {
    renderPill();
    fireEvent.click(screen.getByRole('button', { name: /^modo de superficie:/i }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Malla' }));
    expect(screen.queryByRole('group', { name: 'Modo de superficie' })).not.toBeNull();
  });
});

// P5 (spec 2026-10-02 § 4.2): «Texturizado ▾» sube a la barra superior, junto a
// «IA». Deja de ser una píldora absoluta sobre el visor: el disparador toma el
// estilo de texto de «Mostrar» y el menú de nueve cuadros cuelga de <body>, en
// papel (contrato § 2, «todo portal nace papel»). Los nombres accesibles y las
// clases que usan los e2e y el trinquete de contraste no cambian.
describe('SurfaceModePill en la barra superior', () => {
  function montar() {
    const store = configureStore({ reducer: { simulation: simulationReducer } });
    const r = render(<Provider store={store}><ShortcutProvider><SurfaceModePill /></ShortcutProvider></Provider>);
    return { store, ...r };
  }
  const disparador = () => screen.getByRole('button', { name: /^modo de superficie:/i });
  const menu = () => screen.queryByRole('group', { name: 'Modo de superficie' });

  it('el disparador es de texto, con el estilo de «Mostrar», y conserva su clase', () => {
    montar();
    expect(disparador().className).toContain('grupo-del-patron__plegado');
    expect(disparador().className).toContain('surface-pill__trigger');
    expect(disparador().textContent).toBe('Texturizado');
  });

  it('abierto, el disparador lo dice (aria-expanded) y se marca', () => {
    montar();
    expect(disparador().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(disparador());
    expect(disparador().getAttribute('aria-expanded')).toBe('true');
    expect(disparador().className).toContain('surface-pill__trigger--open');
  });

  it('el menú cuelga de <body> y es papel: no queda dentro de la barra', () => {
    const { container } = montar();
    fireEvent.click(disparador());
    const grupo = menu()!;
    expect(container.contains(grupo), 'el menú quedó dentro del árbol de la barra: nada fixed escapa de ahí').toBe(false);
    expect(grupo.parentElement).toBe(document.body);
    expect(grupo.getAttribute('data-material')).toBe('papel');
    expect(grupo.getAttribute('data-superficie')).toBe('menu');
    expect(grupo.className).toContain('surface-pill__flyout');
  });

  it('con el menú abierto el foco entra a él, en el modo que está puesto', () => {
    montar();
    fireEvent.click(disparador());
    // Cuelga del final de <body>: Tab desde el disparador no llegaría a las nueve opciones.
    expect(menu()!.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Texturizado');
  });

  it('Escape lo cierra y el foco vuelve al disparador', () => {
    montar();
    fireEvent.click(disparador());
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(disparador());
  });

  it('elegir un modo lo aplica, cierra y devuelve el foco al disparador', () => {
    const { store } = montar();
    fireEvent.click(disparador());
    fireEvent.click(screen.getByRole('button', { name: 'Plano' }));
    expect(store.getState().simulation.surfaceMode3D).toBe('flat');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Modo de superficie: Plano' }));
  });

  // Con el ratón el foco no se mueve (ver GrupoDeLaPrenda.test.tsx): los botones de
  // la barra no lo toman, y un `focus()` de más deja a Espacio siendo «del botón».
  it('abierto con el ratón, el foco se queda donde estaba', () => {
    montar();
    const antes = document.activeElement;
    fireEvent.mouseDown(disparador());
    fireEvent.click(disparador(), { detail: 1 });
    expect(menu(), 'el caso no se ejerce: no abrió').not.toBeNull();
    expect(document.activeElement, 'abrir con el ratón movió el foco al menú').toBe(antes);
  });

  it('elegir un modo con el ratón no deja el foco en el disparador', () => {
    const { store } = montar();
    fireEvent.mouseDown(disparador());
    fireEvent.click(disparador(), { detail: 1 });
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Plano' }));
    fireEvent.click(screen.getByRole('button', { name: 'Plano' }), { detail: 1 });
    expect(store.getState().simulation.surfaceMode3D, 'el caso no se ejerce: no se eligió el modo').toBe('flat');
    expect(document.activeElement, 'el menú dejó el foco en un botón de la barra').toBe(document.body);
  });

  it('Enter y Espacio sobre una opción son de la opción: el menú es una botonera', () => {
    montar();
    fireEvent.click(disparador());
    expect(menu()!.hasAttribute('data-botonera')).toBe(true);
  });

  it('cambiar el tamaño de la ventana con el menú abierto lo cierra: estaba anclado al botón', () => {
    montar();
    fireEvent.click(disparador());
    fireEvent(window, new Event('resize'));
    expect(menu()).toBeNull();
  });
});

describe('SurfaceModePill ▸ el modo puesto y el ancla del menú', () => {
  function montarCon(modo?: Parameters<typeof setSurfaceMode3D>[0]) {
    const store = configureStore({ reducer: { simulation: simulationReducer } });
    if (modo) store.dispatch(setSurfaceMode3D(modo));
    render(<Provider store={store}><ShortcutProvider><SurfaceModePill /></ShortcutProvider></Provider>);
    return screen.getByRole('button', { name: /^modo de superficie:/i });
  }
  // El modo de fábrica es también el primero de la lista: hay que poner otro para
  // distinguir «al puesto» de «al primero».
  it('con «Malla» puesta, el foco entra a «Malla», no al primero', () => {
    fireEvent.click(montarCon('mesh'));
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Malla');
  });
  it('se ancla bajo el borde derecho del disparador', () => {
    const d = montarCon();
    vi.spyOn(d, 'getBoundingClientRect').mockReturnValue({ left: 800, right: 900, top: 20, bottom: 40, width: 100, height: 20, x: 800, y: 20, toJSON: () => ({}) } as DOMRect);
    fireEvent.click(d);
    const m = screen.getByRole('group', { name: 'Modo de superficie' });
    expect(m.style.right).toBe(`${window.innerWidth - 900}px`);
    expect(m.style.top).toBe('44px');
  });
});
