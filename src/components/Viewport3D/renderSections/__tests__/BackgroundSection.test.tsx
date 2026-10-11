/**
 * @vitest-environment jsdom
 *
 * El fondo de fábrica del escenario es el papel (spec 2026-10-02 § 4.5): el
 * modo transparente, con el color de la hoja puesto por CSS detrás del lienzo,
 * se llama «Papel» en el panel de render. Las demás opciones siguen.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import renderSettingsReducer, { setBackgroundMode } from '../../../../store/renderSettingsSlice';
import BackgroundSection from '../BackgroundSection';
import EnvironmentSetup from '../../EnvironmentSetup';

// `EnvironmentSetup` le habla al renderer de three por `useThree`: aquí es un doble
// que anota el último `setClearColor` y deja ver `scene.background`.
const tres = vi.hoisted(() => ({ gl: { setClearColor: vi.fn(), toneMapping: 0, toneMappingExposure: 1 }, scene: { background: 'algo' as unknown } }));
vi.mock('@react-three/fiber', () => ({ useThree: () => tres }));
vi.mock('@react-three/drei', () => ({ Environment: () => null }));

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

describe('EnvironmentSetup ▸ con «Papel» el lienzo es transparente de verdad', () => {
  it('el renderer limpia con alfa 0 y la escena no tiene fondo', () => {
    const store = configureStore({ reducer: { renderSettings: renderSettingsReducer } });
    render(<Provider store={store}><EnvironmentSetup /></Provider>);
    expect(tres.scene.background).toBeNull();
    expect(tres.gl.setClearColor).toHaveBeenLastCalledWith(0x000000, 0);
  });
});
