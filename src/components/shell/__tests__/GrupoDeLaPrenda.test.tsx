// @vitest-environment jsdom
/**
 * El grupo de la prenda (spec 2026-10-02 «la interfaz en papel» § 4.2, P5): lo
 * que se ve de la prenda en 3D, en la barra superior, junto a «IA»: el avatar
 * (interruptor), «Texturizado ▾» (cómo se pinta la tela) y «Mapa ▾» (los mapas
 * de ajuste). Hasta P4 eran tres cosas sueltas sobre el visor.
 *
 * Que quepan a 1366 px y que el selector de vista no se mueva es layout: lo
 * mide `tests/e2e/barra-superior.spec.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { useShortcut } from '../../../shortcuts';
import { setAvatarRenderStyle } from '../../../store/renderSettingsSlice';
import { resetSimulation, setFitMapMode, setSurfaceMode3D, startSimulation } from '../../../store/simulationSlice';
import { esTeclaDeBotonera } from '../../../shortcuts/teclaDeBotonera';
import GrupoDeLaPrenda from '../GrupoDeLaPrenda';

afterEach(() => {
  cleanup();
  act(() => { store.dispatch(setAvatarRenderStyle('visible')); });
});

const montar = () => render(<Provider store={store}><ShortcutProvider><GrupoDeLaPrenda /></ShortcutProvider></Provider>);
const grupo = () => screen.getByRole('group', { name: 'Qué se ve de la prenda' });
const avatar = () => screen.getByRole('button', { name: 'Mostrar avatar' });

describe('GrupoDeLaPrenda', () => {
  it('es un grupo con nombre y trae sus tres controles: Avatar, Texturizado y Mapa', () => {
    montar();
    const g = grupo();
    expect(g.contains(avatar())).toBe(true);
    expect(g.contains(screen.getByRole('button', { name: /^Modo de superficie:/ }))).toBe(true);
    expect(g.contains(screen.getByRole('button', { name: 'Mapa' }))).toBe(true);
  });

  it('el interruptor del avatar empieza apretado, con la marca llena', () => {
    montar();
    expect(avatar().getAttribute('aria-pressed')).toBe('true');
    expect(avatar().className).toContain('grupo-del-patron__interruptor--activo');
    expect(avatar().querySelector('.grupo-del-patron__marca'), 'sin marca, el estado solo lo dice el tono').not.toBeNull();
  });

  it('un clic oculta el avatar y otro lo devuelve; el nombre accesible no cambia', () => {
    montar();
    fireEvent.click(avatar());
    expect(store.getState().renderSettings.avatarRenderStyle).toBe('hidden');
    expect(avatar().getAttribute('aria-pressed')).toBe('false');
    expect(avatar().className).not.toContain('--activo');
    fireEvent.click(avatar());
    expect(store.getState().renderSettings.avatarRenderStyle).not.toBe('hidden');
    expect(avatar().getAttribute('aria-pressed')).toBe('true');
  });

  it('devuelve el avatar al estilo que tenía antes de ocultarlo', () => {
    act(() => { store.dispatch(setAvatarRenderStyle('wireframe')); });
    montar();
    fireEvent.click(avatar());
    fireEvent.click(avatar());
    expect(store.getState().renderSettings.avatarRenderStyle).toBe('wireframe');
  });

  it('el título dice qué hace y su atajo', () => {
    montar();
    expect(avatar().title).toMatch(/^Ocultar avatar \(.*A\)$/);
    fireEvent.click(avatar());
    expect(avatar().title).toMatch(/^Mostrar avatar \(.*A\)$/);
  });

  it('los tres botones comparten el estilo de los del patrón', () => {
    montar();
    expect(avatar().className).toContain('grupo-del-patron__interruptor');
    expect(screen.getByRole('button', { name: /^Modo de superficie:/ }).className).toContain('grupo-del-patron__plegado');
    expect(screen.getByRole('button', { name: 'Mapa' }).className).toContain('grupo-del-patron__plegado');
  });
});

// Contrato § 4: «Simular» tiene Espacio de atajo. Con el foco en «Avatar», Espacio
// pulsa el botón y no debe además arrancar la simulación.
describe('GrupoDeLaPrenda es una botonera', () => {
  it('Espacio sobre uno de sus botones no llega a los atajos', () => {
    montar();
    const visto: boolean[] = [];
    const oyente = (e: KeyboardEvent) => visto.push(esTeclaDeBotonera(e));
    document.addEventListener('keydown', oyente);
    try {
      fireEvent.keyDown(avatar(), { key: ' ' });
      fireEvent.keyDown(screen.getByRole('button', { name: 'Mapa' }), { key: 'Enter' });
    } finally {
      document.removeEventListener('keydown', oyente);
    }
    expect(visto).toEqual([true, true]);
  });

  it('un clic de ratón no deja el foco en el botón', () => {
    montar();
    // `mousedown` cancelado = el navegador no mueve el foco al botón.
    expect(fireEvent.mouseDown(avatar())).toBe(false);
  });

  it('un mousedown sobre el aire del grupo no se cancela: solo los botones', () => {
    montar();
    expect(fireEvent.mouseDown(grupo())).toBe(true);
  });

  it('el campo de los ajustes de «Mapa», que cuelga de <body>, sigue recibiendo el foco con el ratón', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Mapa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes del mapa…' }));
    // Para React el portal es hijo del grupo: su `onMouseDown` lo ve, y no debe cancelar un campo.
    expect(fireEvent.mouseDown(screen.getByLabelText('Tensión máx'))).toBe(true);
  });
});

// Con el ratón los botones de la barra no toman el foco (el `mousedown` se cancela),
// y los menús tampoco se lo llevan: si «Mapa» o «Texturizado» lo dejaran en su
// disparador tras elegir, Espacio sería «del botón» (`esTeclaDeBotonera`) y dejaría
// de alternar la simulación; con el foco dentro de la hoja, un segundo Espacio
// pulsaría el primer mapa y lo apagaría. Es el mismo camino que «Más» en la línea al
// pie: el foco se mueve solo si el clic vino del teclado (`detail` 0). Lo cazó la
// revisión final de P5: los tests de arriba usan `fireEvent.click`, que trae
// `detail: 0`, es decir, solo probaban el camino del teclado.
describe('GrupoDeLaPrenda con el ratón: Espacio sigue siendo de la simulación', () => {
  const modoInicial = store.getState().simulation.surfaceMode3D;
  afterEach(() => {
    act(() => {
      store.dispatch(resetSimulation());
      store.dispatch(setFitMapMode('none'));
      store.dispatch(setSurfaceMode3D(modoInicial));
    });
  });

  function montarConOido() {
    const alternar = vi.fn();
    function Oido() { useShortcut('sim.toggle', alternar); return null; }
    render(<Provider store={store}><ShortcutProvider><GrupoDeLaPrenda /><Oido /></ShortcutProvider></Provider>);
    return alternar;
  }
  const clicDeRaton = (el: Element) => { fireEvent.mouseDown(el); fireEvent.mouseUp(el); fireEvent.click(el, { detail: 1 }); };
  const espacio = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: ' ', code: 'Space' });

  it('tras elegir un mapa con el ratón', () => {
    act(() => { store.dispatch(startSimulation()); });
    const alternar = montarConOido();
    clicDeRaton(screen.getByRole('button', { name: 'Mapa' }));
    clicDeRaton(screen.getByTitle('Mapa de tensión (Alt+6)'));
    expect(store.getState().simulation.fitMapMode, 'el caso no se ejerce: no se eligió el mapa').toBe('stress');
    espacio();
    expect(alternar, 'Espacio se lo quedó «Mapa» en vez de alternar la simulación').toHaveBeenCalledTimes(1);
  });

  it('tras elegir un modo de superficie con el ratón', () => {
    const alternar = montarConOido();
    clicDeRaton(screen.getByRole('button', { name: /^Modo de superficie:/ }));
    clicDeRaton(screen.getByRole('button', { name: 'Plano' }));
    expect(store.getState().simulation.surfaceMode3D, 'el caso no se ejerce: no se eligió el modo').toBe('flat');
    espacio();
    expect(alternar, 'Espacio se lo quedó el disparador de «Texturizado»').toHaveBeenCalledTimes(1);
  });

  it('con «Mapa» recién abierto con el ratón, Espacio no pulsa su primer mapa', () => {
    act(() => { store.dispatch(startSimulation()); });
    const alternar = montarConOido();
    clicDeRaton(screen.getByRole('button', { name: 'Mapa' }));
    expect(screen.getByRole('group', { name: 'Mapas de ajuste' }), 'el caso no se ejerce: no abrió').toBeTruthy();
    espacio();
    expect(store.getState().simulation.fitMapMode, 'Espacio pulsó el primer mapa de la hoja').toBe('none');
    expect(alternar).toHaveBeenCalledTimes(1);
  });
});

describe('GrupoDeLaPrenda ▸ el blanco del clic puede ser la marca', () => {
  it('un clic sobre la marca del interruptor tampoco deja el foco', () => {
    montar();
    expect(fireEvent.mouseDown(avatar().querySelector('.grupo-del-patron__marca')!)).toBe(false);
  });
});
