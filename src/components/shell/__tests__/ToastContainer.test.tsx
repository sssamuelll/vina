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
import { NEW_PROJECT } from '../../../store/actions';
import ToastContainer from '../ToastContainer';

afterEach(cleanup);

// Probe reducer: records whether the toast's actionPayload was dispatched.
function probeReducer(state = { newProjectFired: false }, action: UnknownAction) {
  return action.type === NEW_PROJECT.type ? { newProjectFired: true } : state;
}

function makeStore() {
  return configureStore({ reducer: { copilotUI: copilotUIReducer, probe: probeReducer } });
}

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
