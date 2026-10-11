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
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { setAvatarRenderStyle } from '../../../store/renderSettingsSlice';
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
