/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { UnknownAction } from '@reduxjs/toolkit';
import copilotUIReducer, {
  showToast,
  cleanupExpiredToasts,
} from '../../../store/copilotUISlice';
import editorReducer, { setViewMode } from '../../../store/editorSlice';
import { NEW_PROJECT } from '../../../store/actions';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ToastContainer from '../ToastContainer';

afterEach(cleanup);

// Probe reducer: records whether the toast's actionPayload was dispatched.
function probeReducer(state = { newProjectFired: false }, action: UnknownAction) {
  return action.type === NEW_PROJECT.type ? { newProjectFired: true } : state;
}

function makeStore() {
  return configureStore({ reducer: { copilotUI: copilotUIReducer, probe: probeReducer, editor: editorReducer } });
}

describe('ToastContainer ▸ con el margen del 3D a la vista (2026-10-11)', () => {
  // Al pie del margen del 3D va el estado de la simulación. Los avisos, a 16 px del borde,
  // le caían encima y se tragaban sus clics durante 3 a 5 s: justo cuando sale el aviso de
  // una costura que no cose, que es cuando el ⚠ del estado aparece.
  it('en 2D se queda en su sitio; con el visor se aparta a la izquierda del margen', () => {
    const store = makeStore();
    act(() => { store.dispatch(setViewMode('2d')); store.dispatch(showToast({ type: 'info', message: 'Hola', duration: 0 })); });
    const container = renderWithStore(store);
    const pila = () => container.querySelector('.toast-container')!;
    expect(pila().classList.contains('toast-container--con-margen-3d')).toBe(false);
    act(() => { store.dispatch(setViewMode('split')); });
    expect(pila().classList.contains('toast-container--con-margen-3d')).toBe(true);
    act(() => { store.dispatch(setViewMode('3d')); });
    expect(pila().classList.contains('toast-container--con-margen-3d')).toBe(true);
  });

  it('se aparta el ancho del margen, que es un token', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/shell/ToastContainer.css'), 'utf8');
    const regla = css.match(/\.toast-container--con-margen-3d\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(regla).toMatch(/right:\s*calc\(var\(--margen-ancho\)\s*\+\s*16px\)/);
    expect(readFileSync(join(process.cwd(), 'src/components/shell/Dock.css'), 'utf8')).toMatch(/min-width:\s*var\(--margen-ancho\)/);
  });
});

function renderWithStore(store: ReturnType<typeof makeStore>) {
  const { container } = render(
    <Provider store={store}>
      <ToastContainer />
    </Provider>
  );
  return container;
}

describe('ToastContainer', () => {
  it('renders nothing when there are no toasts', () => {
    const store = makeStore();
    const container = renderWithStore(store);
    // No .toast nodes — component returns null
    expect(container.querySelector('.toast')).toBeNull();
  });

  it('renders one .toast per toast with message text and toast--<type> class', () => {
    const store = makeStore();
    act(() => {
      store.dispatch(showToast({ type: 'success', message: 'Exported', duration: 5000 }));
      store.dispatch(showToast({ type: 'error', message: 'Something failed', duration: 5000 }));
      store.dispatch(showToast({ type: 'warning', message: 'Watch out', duration: 5000 }));
      store.dispatch(showToast({ type: 'info', message: 'FYI', duration: 5000 }));
    });
    const container = renderWithStore(store);
    const toasts = container.querySelectorAll('.toast');
    expect(toasts.length).toBe(4);

    // Verify types are applied as modifier classes
    expect(container.querySelector('.toast--success')).toBeTruthy();
    expect(container.querySelector('.toast--error')).toBeTruthy();
    expect(container.querySelector('.toast--warning')).toBeTruthy();
    expect(container.querySelector('.toast--info')).toBeTruthy();

    // Verify message text is present
    expect(container.textContent).toContain('Exported');
    expect(container.textContent).toContain('Something failed');
    expect(container.textContent).toContain('Watch out');
    expect(container.textContent).toContain('FYI');
  });

  it('clicking the dismiss button removes the toast from the store', () => {
    const store = makeStore();
    act(() => {
      store.dispatch(showToast({ type: 'success', message: 'Exported', duration: 5000 }));
    });
    const container = renderWithStore(store);
    const dismiss = container.querySelector('button[aria-label="Cerrar notificación"]');
    expect(dismiss).toBeTruthy();
    fireEvent.click(dismiss!);
    expect(store.getState().copilotUI.toasts.length).toBe(0);
  });

  it('renders an action button when actionLabel + actionPayload are present', () => {
    const store = makeStore();
    act(() => {
      store.dispatch(showToast({
        type: 'info',
        message: 'Restauré tu proyecto: 5 piezas',
        actionLabel: 'Empezar de cero',
        actionPayload: NEW_PROJECT(),
        duration: 8000,
      }));
    });
    const container = renderWithStore(store);
    const action = container.querySelector('.toast__action');
    expect(action).toBeTruthy();
    expect(action!.textContent).toBe('Empezar de cero');
  });

  it('clicking the action dispatches the actionPayload and dismisses the toast', () => {
    const store = makeStore();
    act(() => {
      store.dispatch(showToast({
        type: 'info',
        message: 'Restauré tu proyecto: 5 piezas',
        actionLabel: 'Empezar de cero',
        actionPayload: NEW_PROJECT(),
        duration: 8000,
      }));
    });
    const container = renderWithStore(store);
    fireEvent.click(container.querySelector('.toast__action')!);

    expect((store.getState() as { probe: { newProjectFired: boolean } }).probe.newProjectFired).toBe(true);
    expect(store.getState().copilotUI.toasts.length).toBe(0);
  });

  it('toasts without actionLabel render no action button', () => {
    const store = makeStore();
    act(() => {
      store.dispatch(showToast({ type: 'success', message: 'Plain', duration: 3000 }));
    });
    const container = renderWithStore(store);
    expect(container.querySelector('.toast__action')).toBeNull();
  });

  it('expired toasts are cleaned up by the interval; duration:0 survives', () => {
    vi.useFakeTimers();
    const store = makeStore();
    act(() => {
      store.dispatch(showToast({ type: 'info', message: 'Ephemeral', duration: 1000 }));
      store.dispatch(showToast({ type: 'warning', message: 'Persistent', duration: 0 }));
    });
    renderWithStore(store);

    // Advance fake time past the 1000ms duration
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    // The container's setInterval fires cleanupExpiredToasts; run it
    act(() => {
      store.dispatch(cleanupExpiredToasts());
    });

    const toasts = store.getState().copilotUI.toasts;
    expect(toasts.some(t => t.message === 'Ephemeral')).toBe(false);
    expect(toasts.some(t => t.message === 'Persistent')).toBe(true);

    vi.useRealTimers();
  });
});
