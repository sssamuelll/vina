/**
 * @vitest-environment jsdom
 *
 * Guards the reachability of the 3D manual-sewing tool. Sew3DTool only mounts
 * when activeTool3D === 'sew3d', and the legacy Toolbar3D that used to set it
 * is no longer mounted in the AppShell — so the "Sew" pill in these floating
 * controls is the only entry point. If this test breaks, sewing is unreachable.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolsReducer from '../../../store/toolSlice';
import FloatingControls3D from '../FloatingControls3D';

afterEach(cleanup);

function renderWithStore() {
  const store = configureStore({
    reducer: { editor: editorReducer, simulation: simulationReducer, tools: toolsReducer },
  });
  render(
    <Provider store={store}>
      <FloatingControls3D />
    </Provider>,
  );
  return store;
}

describe('FloatingControls3D — Sew tool reachability', () => {
  it('renders a Sew pill that activates the 3D sewing tool', () => {
    const store = renderWithStore();
    expect(store.getState().tools.activeTool3D).toBe('camera');

    fireEvent.click(screen.getByText('Sew'));

    // The only thing that makes Sew3DTool mount.
    expect(store.getState().tools.activeTool3D).toBe('sew3d');
    // Sew edits static pieces: sim reset to idle + arrange view.
    expect(store.getState().simulation.simulationState).toBe('idle');
    expect(store.getState().simulation.viewMode3D).toBe('arrange');
  });

  it('toggles back out of sewing to the camera tool', () => {
    const store = renderWithStore();
    fireEvent.click(screen.getByText('Sew'));
    expect(store.getState().tools.activeTool3D).toBe('sew3d');

    // Label flips to "Sewing…" while active; clicking it exits.
    fireEvent.click(screen.getByText('Sewing…'));
    expect(store.getState().tools.activeTool3D).toBe('camera');
  });
});
