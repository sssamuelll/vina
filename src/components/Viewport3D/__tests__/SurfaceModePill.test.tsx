/**
 * @vitest-environment jsdom
 *
 * Guards the SurfaceModePill — the floating 9-way surface-mode picker for the
 * 3D viewport (spec 2026-06-04 display-toggles-resurface §3).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import simulationReducer, { setSurfaceMode3D } from '../../../store/simulationSlice';
import SurfaceModePill from '../SurfaceModePill';

afterEach(cleanup);

function renderPill() {
  const store = configureStore({ reducer: { simulation: simulationReducer } });
  render(<Provider store={store}><SurfaceModePill /></Provider>);
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
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Modo de superficie' })).toBeNull();
  });

  it('a mousedown outside the pill closes the flyout', () => {
    renderPill();
    fireEvent.click(screen.getByRole('button', { name: /^modo de superficie:/i }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('group', { name: 'Modo de superficie' })).toBeNull();
  });
});
