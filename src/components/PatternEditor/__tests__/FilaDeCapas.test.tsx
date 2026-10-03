// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import editorReducer from '../../../store/editorSlice';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';
import FilaDeCapas from '../FilaDeCapas';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const interruptores = [
  ['Margen', 'showSeamAllowance'],
  ['Hilo', 'showGrainlines'],
  ['Piquetes', 'showNotches'],
  ['Costuras', 'showSewingLines'],
  ['Construcción', 'showTrazos'],
] as const;

describe('FilaDeCapas', () => {
  it('mantiene el orden de las seis casillas y cada booleana cambia el store y aria-pressed', () => {
    const store = configureStore({ reducer: { editor: editorReducer } });
    render(
      <Provider store={store}>
        <FilaDeCapas />
      </Provider>,
    );

    const group = screen.getByRole('group', { name: 'Qué se ve del patrón' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Margen', 'Hilo', 'Piquetes', 'Costuras', 'Largos', 'Construcción',
    ]);

    for (const [label, field] of interruptores) {
      const button = within(group).getByRole('button', { name: label });
      const before = store.getState().editor[field];
      expect(button.getAttribute('aria-pressed')).toBe(String(before));

      fireEvent.click(button);

      expect(store.getState().editor[field]).toBe(!before);
      expect(button.getAttribute('aria-pressed')).toBe(String(!before));
    }
  });

  it('la casilla «Largos» se marca con el modo Todas y despacha setLineLengthMode al pulsar', () => {
    const store = configureStore({ reducer: { editor: editorReducer } });
    render(<Provider store={store}><FilaDeCapas /></Provider>);

    const boton = screen.getByRole('button', { name: 'Largos' });
    expect(store.getState().editor.lineLengthMode).toBe('none');
    expect(boton.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(boton);
    expect(store.getState().editor.lineLengthMode).toBe('all');
    expect(store.getState().editor.lineLengthModeSetByUser).toBe(true);
    expect(boton.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(boton);
    expect(store.getState().editor.lineLengthMode).toBe('none');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
  });

  it('el sexto interruptor es «Construcción», nace encendido y apaga showTrazos', () => {
    const store = configureStore({ reducer: { editor: editorReducer } });
    render(
      <Provider store={store}>
        <FilaDeCapas />
      </Provider>,
    );

    const boton = screen.getByRole('button', { name: 'Construcción' });
    expect(boton.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(boton);

    expect(store.getState().editor.showTrazos).toBe(false);
  });
});

describe('FilaDeCapas plegada: cuando los seis no caben (spec 2026-10-02 § 4.2)', () => {
  /** jsdom no mide: un hueco de 300 px para una fila que pide 402. */
  function sinSitio() {
    vi.stubGlobal('ResizeObserver', class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe() { this.cb([], this as unknown as ResizeObserver); }
      unobserve() {}
      disconnect() {}
    });
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300);
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(402);
  }

  it('se pliegan en «Mostrar», que abre un menú de papel con los seis', () => {
    sinSitio();
    const store = configureStore({ reducer: { editor: editorReducer } });
    render(<Provider store={store}><FilaDeCapas /></Provider>);

    expect(screen.queryByRole('group', { name: 'Qué se ve del patrón' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));

    const menu = screen.getByRole('group', { name: 'Qué se ve del patrón' });
    expect(menu.getAttribute('data-material'), 'un portal nace papel').toBe('papel');
    expect(menu.parentElement, 'el menú cuelga de <body>').toBe(document.body);
    expect(within(menu).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      'Margen', 'Hilo', 'Piquetes', 'Costuras', 'Largos', 'Construcción',
    ]);

    fireEvent.click(within(menu).getByRole('button', { name: 'Hilo' }));
    expect(store.getState().editor.showGrainlines, 'el interruptor de dentro no despacha').toBe(false);
  });

  it('al abrirse, el foco entra al menú: cuelga de <body>, y Tab desde «Mostrar» no llegaría a los seis', () => {
    sinSitio();
    const store = configureStore({ reducer: { editor: editorReducer } });
    render(<Provider store={store}><FilaDeCapas /></Provider>);

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));

    const menu = screen.getByRole('group', { name: 'Qué se ve del patrón' });
    expect(document.activeElement).toBe(within(menu).getByRole('button', { name: 'Margen' }));
  });

  it('deja rastro en la bitácora: si se plegó y con qué anchos, y cuándo se abre y se cierra el menú', () => {
    sinSitio();
    clearJournal();
    const store = configureStore({ reducer: { editor: editorReducer } });
    render(<Provider store={store}><FilaDeCapas /></Provider>);

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    const ui = getJournal().events.filter((e) => e.kind === 'ui').map((e) => [e.name, e.data]);
    expect(ui).toEqual([
      ['grupo-del-patron', { plegado: true, hueco: 300, natural: 402 }],
      ['mostrar', { abierto: true }],
      ['mostrar', { abierto: false }],
    ]);
  });

  it('si con el menú abierto vuelven a caber, el menú se cierra y los seis vuelven a la barra', () => {
    let avisar: () => void = () => {};
    vi.stubGlobal('ResizeObserver', class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; avisar = () => this.cb([], this as unknown as ResizeObserver); }
      observe() { this.cb([], this as unknown as ResizeObserver); }
      unobserve() {}
      disconnect() {}
    });
    const hueco = vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300);
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(402);
    const store = configureStore({ reducer: { editor: editorReducer } });
    render(<Provider store={store}><FilaDeCapas /></Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(document.querySelector('.grupo-del-patron__menu')).not.toBeNull();

    // La ventana crece: el hueco pasa a 500 y el observador avisa.
    hueco.mockReturnValue(500);
    act(() => { avisar(); });

    expect(document.querySelector('.grupo-del-patron__menu'), 'el menú siguió colgando de <body>').toBeNull();
    expect(screen.queryByRole('button', { name: 'Mostrar' })).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Qué se ve del patrón' })).getAllByRole('button')).toHaveLength(6);

    // Y si vuelve a encoger, «Mostrar» vuelve cerrado: nadie lo abrió.
    hueco.mockReturnValue(300);
    act(() => { avisar(); });
    expect(screen.getByRole('button', { name: 'Mostrar' }).getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.grupo-del-patron__menu'), 'el menú se reabrió solo').toBeNull();
  });

  it('Escape lo cierra y devuelve el foco a «Mostrar»', () => {
    sinSitio();
    const store = configureStore({ reducer: { editor: editorReducer } });
    render(<Provider store={store}><FilaDeCapas /></Provider>);
    const mostrar = screen.getByRole('button', { name: 'Mostrar' });
    fireEvent.click(mostrar);
    const menu = screen.getByRole('group', { name: 'Qué se ve del patrón' });
    within(menu).getByRole('button', { name: 'Margen' }).focus();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('group', { name: 'Qué se ve del patrón' })).toBeNull();
    expect(document.activeElement).toBe(mostrar);
  });
});
