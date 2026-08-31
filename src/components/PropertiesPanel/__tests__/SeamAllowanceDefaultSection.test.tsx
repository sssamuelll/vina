// @vitest-environment jsdom
/**
 * #1106 (María audio 30-08): "en español es margen de costura" — el campo
 * decía "Ancho (mm)" sin decir de qué. Esta sección es el default a nivel
 * editor (el que aplica un clic en el cuerpo con Margen activo).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import SeamAllowanceDefaultSection from '../SeamAllowanceDefaultSection';

afterEach(cleanup);

function mount() {
  const store = configureStore({ reducer: { editor: editorReducer } });
  render(<Provider store={store}><SeamAllowanceDefaultSection /></Provider>);
}

describe('SeamAllowanceDefaultSection — copy (#1106)', () => {
  it('el campo dice "Margen (mm)", no "Ancho (mm)"', () => {
    mount();
    expect(screen.getByLabelText('Margen (mm)')).toBeTruthy();
    expect(screen.queryByLabelText('Ancho (mm)')).toBeNull();
  });
});
