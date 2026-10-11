/**
 * @vitest-environment jsdom
 *
 * El fondo de fábrica del escenario es el papel (spec 2026-10-02 § 4.5): el
 * modo transparente, con el color de la hoja puesto por CSS detrás del lienzo,
 * se llama «Papel» en el panel de render. Las demás opciones siguen.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import renderSettingsReducer, { setBackgroundMode } from '../../../../store/renderSettingsSlice';
import BackgroundSection from '../BackgroundSection';

afterEach(cleanup);

function montar() {
  const store = configureStore({ reducer: { renderSettings: renderSettingsReducer } });
  render(<Provider store={store}><BackgroundSection open onToggle={() => {}} /></Provider>);
  return store;
}

describe('BackgroundSection', () => {
  it('el modo transparente se llama «Papel», y «Transparente» ya no existe', () => {
    montar();
    expect(screen.getByRole('button', { name: 'Papel' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Transparente' })).toBeNull();
    expect(screen.getByRole('button', { name: 'HDRI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sólido' })).toBeTruthy();
  });

  it('de fábrica el activo es «Papel»', () => {
    montar();
    expect(screen.getByRole('button', { name: 'Papel' }).className).toContain('active');
  });

  it('«Papel» pone el modo transparente, y «Sólido» lo cambia', () => {
    const store = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Sólido' }));
    expect(store.getState().renderSettings.backgroundMode).toBe('solid');
    fireEvent.click(screen.getByRole('button', { name: 'Papel' }));
    expect(store.getState().renderSettings.backgroundMode).toBe('transparent');
    expect(setBackgroundMode('transparent').payload).toBe('transparent');
  });
});
