// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import copilotUIReducer, { showConfirmation } from '../../../store/copilotUISlice';
import workflowReducer from '../../../store/workflowSlice';
import ConfirmDialog from '../ConfirmDialog';
import { useGuardedAction, registerCallback, _resetCallbacksForTest } from '../../../hooks/useGuardedAction';

/**
 * El ciclo de confirmación estaba ROTO EN LA UNIÓN.
 *
 * `useGuardedAction` registra un callback, despacha `showConfirmation` y espera
 * que alguien pinte el diálogo y resuelva el callback. Ese "alguien" —el
 * `CopilotUIOverlay` que su propio comentario nombra— nunca se escribió.
 * Medido en la app corriendo el 2026-08-14: al despachar `showConfirmation`, el
 * estado entra al store y `document.body.innerHTML` no cambia **ni un carácter**.
 *
 * `memoryTools.ts` lo dice en un comentario: *"The Redux confirmation dialog is
 * a dark surface (nothing renders `pendingConfirmation`), so we use the native
 * confirm"*. O sea: se sabía, y en vez de encender la superficie se rodeó con
 * un `window.confirm`.
 *
 * Los tests que ya existían cubrían el registro de callbacks EN AISLAMIENTO
 * (`registerCallback` guarda, `resolveCallback` recupera). Las dos mitades
 * verdes, la unión sin probar. Estos tests prueban la unión.
 */

function makeStore() {
  return configureStore({
    reducer: { copilotUI: copilotUIReducer, workflow: workflowReducer },
    middleware: (gdm) => gdm({ serializableCheck: false }),
  });
}

function renderConDialogo(store: ReturnType<typeof makeStore>, extra?: React.ReactNode) {
  return render(<Provider store={store}><ConfirmDialog />{extra}</Provider>);
}

beforeEach(() => _resetCallbacksForTest());
afterEach(cleanup);

describe('ConfirmDialog — la superficie deja de estar oscura', () => {
  it('pinta el título, la descripción y las consecuencias que trae el store', () => {
    const store = makeStore();
    renderConDialogo(store);
    act(() => {
      store.dispatch(showConfirmation({
        title: '¿Dividir la pieza?',
        description: 'La pieza original se reemplaza por dos.',
        consequences: ['Se pierde el margen de costura del borde cortado'],
        destructive: true,
      }));
    });
    expect(screen.getByText('¿Dividir la pieza?')).toBeTruthy();
    expect(screen.getByText('La pieza original se reemplaza por dos.')).toBeTruthy();
    expect(screen.getByText(/margen de costura del borde cortado/)).toBeTruthy();
  });

  it('sin confirmación pendiente no pinta nada', () => {
    const store = makeStore();
    const { container } = renderConDialogo(store);
    expect(container.textContent).toBe('');
  });
});

describe('el ciclo se cierra: confirmar ejecuta el callback', () => {
  it('confirmar ejecuta el callback registrado y limpia el estado', () => {
    const store = makeStore();
    const ejecutar = vi.fn();
    renderConDialogo(store);
    act(() => {
      store.dispatch(showConfirmation({
        source: 'hook',
        title: '¿Dividir la pieza?',
        description: 'x',
        consequences: [],
        destructive: true,
        callbackKey: registerCallback(ejecutar),
      }));
    });
    expect(ejecutar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /dividir|confirmar|eliminar/i }));

    expect(ejecutar).toHaveBeenCalledTimes(1);
    expect(store.getState().copilotUI.pendingConfirmation).toBeNull();
  });

  it('cancelar NO ejecuta el callback y limpia el estado', () => {
    const store = makeStore();
    const ejecutar = vi.fn();
    renderConDialogo(store);
    act(() => {
      store.dispatch(showConfirmation({
        source: 'hook', title: 't', description: 'x', consequences: [],
        destructive: true, callbackKey: registerCallback(ejecutar),
      }));
    });
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(ejecutar).not.toHaveBeenCalled();
    expect(store.getState().copilotUI.pendingConfirmation).toBeNull();
  });

  it('Escape cancela', () => {
    const store = makeStore();
    const ejecutar = vi.fn();
    renderConDialogo(store);
    act(() => {
      store.dispatch(showConfirmation({
        source: 'hook', title: 't', description: 'x', consequences: [],
        destructive: true, callbackKey: registerCallback(ejecutar),
      }));
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(ejecutar).not.toHaveBeenCalled();
    expect(store.getState().copilotUI.pendingConfirmation).toBeNull();
  });
});

describe('useGuardedAction de punta a punta', () => {
  /** Botón de prueba que usa el hook real, como lo usan Tijeras y Fusionar. */
  function BotonGuardado({ onRun }: { onRun: () => void }) {
    const guard = useGuardedAction();
    return <button onClick={() => guard('splitPiece', onRun)}>disparar</button>;
  }

  it('con expertMode apagado pregunta primero y ejecuta al confirmar', () => {
    const store = makeStore();
    const onRun = vi.fn();
    renderConDialogo(store, <BotonGuardado onRun={onRun} />);

    fireEvent.click(screen.getByText('disparar'));
    // No se ejecuta todavía…
    expect(onRun).not.toHaveBeenCalled();
    // …pero la usuaria VE por qué. Éste es el eslabón que faltaba: antes el
    // estado quedaba colgado en el store y en pantalla no pasaba nada.
    expect(store.getState().copilotUI.pendingConfirmation).not.toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /dividir|confirmar|eliminar/i }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('con expertMode encendido ejecuta directo y no pinta diálogo', () => {
    const store = makeStore();
    const onRun = vi.fn();
    act(() => { store.dispatch({ type: 'workflow/setExpertMode', payload: true }); });
    renderConDialogo(store, <BotonGuardado onRun={onRun} />);

    fireEvent.click(screen.getByText('disparar'));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('la acción destructiva se distingue de la que no lo es', () => {
  it('marca el diálogo como destructivo para que el botón no sea uno más', () => {
    const store = makeStore();
    renderConDialogo(store);
    act(() => {
      store.dispatch(showConfirmation({
        title: '¿Eliminar el perfil?', description: 'x', consequences: [], destructive: true,
      }));
    });
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.getAttribute('data-destructive')).toBe('true');
  });
});
