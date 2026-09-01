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
  ['Largos', 'showLineLengths'],
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
});
