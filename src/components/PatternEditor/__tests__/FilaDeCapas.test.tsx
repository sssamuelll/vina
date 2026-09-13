// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Provider } from 'react-redux';
import editorReducer from '../../../store/editorSlice';
import FilaDeCapas from '../FilaDeCapas';

afterEach(cleanup);

const interruptores = [
  ['Margen', 'showSeamAllowance'],
  ['Hilo', 'showGrainlines'],
  ['Piquetes', 'showNotches'],
  ['Costuras', 'showSewingLines'],
  ['Construcción', 'showTrazos'],
] as const;

describe('FilaDeCapas', () => {
  it('mantiene el orden y cada botón cambia el store y aria-pressed', () => {
    const store = configureStore({ reducer: { editor: editorReducer } });
    render(
      <Provider store={store}>
        <FilaDeCapas />
      </Provider>,
    );

    const group = screen.getByRole('group', { name: 'Capas visibles' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(
      interruptores.map(([label]) => label),
    );

    for (const [label, field] of interruptores) {
      const button = within(group).getByRole('button', { name: label });
      const before = store.getState().editor[field];
      expect(button.getAttribute('aria-pressed')).toBe(String(before));

      fireEvent.click(button);

      expect(store.getState().editor[field]).toBe(!before);
      expect(button.getAttribute('aria-pressed')).toBe(String(!before));
    }
  });

  it('expone los tres modos de Largos y guarda una selección explícita', () => {
    const store = configureStore({ reducer: { editor: editorReducer } });
    render(<Provider store={store}><FilaDeCapas /></Provider>);

    const select = screen.getByRole('combobox', { name: 'Largos' });
    expect((select as HTMLSelectElement).value).toBe('creation');
    expect(within(select).getAllByRole('option').map(option => option.textContent)).toEqual([
      'Al crear', 'Todas', 'Ninguna',
    ]);

    fireEvent.change(select, { target: { value: 'all' } });
    expect(store.getState().editor.lineLengthMode).toBe('all');
    expect(store.getState().editor.lineLengthModeSetByUser).toBe(true);

    fireEvent.change(select, { target: { value: 'none' } });
    expect(store.getState().editor.lineLengthMode).toBe('none');
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
