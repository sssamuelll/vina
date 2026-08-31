// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import workflowReducer from '../../store/workflowSlice';
import copilotUIReducer from '../../store/copilotUISlice';
import { resolveCallback, registerCallback, _resetCallbacksForTest, useGuardedAction } from '../useGuardedAction';

describe('useGuardedAction callback store', () => {
  beforeEach(() => {
    _resetCallbacksForTest();
  });

  it('registerCallback stores and returns a key', () => {
    const fn = vi.fn();
    const key = registerCallback(fn);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('resolveCallback retrieves and removes a stored callback', () => {
    const fn = vi.fn();
    const key = registerCallback(fn);
    const resolved = resolveCallback(key);
    expect(resolved).toBe(fn);
    expect(resolveCallback(key)).toBeUndefined();
  });

  it('resolveCallback returns undefined for unknown key', () => {
    expect(resolveCallback('nonexistent')).toBeUndefined();
  });

  it('multiple callbacks are independent', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const key1 = registerCallback(fn1);
    const key2 = registerCallback(fn2);
    expect(resolveCallback(key1)).toBe(fn1);
    expect(resolveCallback(key2)).toBe(fn2);
  });

  it('_resetCallbacksForTest clears all callbacks', () => {
    const fn = vi.fn();
    const key = registerCallback(fn);
    _resetCallbacksForTest();
    expect(resolveCallback(key)).toBeUndefined();
  });

  it('resolveCallback on dismiss cleans up without executing', () => {
    const fn = vi.fn();
    const key = registerCallback(fn);
    // Simulate cancel/dismiss: resolve removes callback but caller discards it
    const cb = resolveCallback(key);
    expect(cb).toBe(fn);
    // Callback was removed — second resolve returns undefined
    expect(resolveCallback(key)).toBeUndefined();
    // The callback was NOT called (dismiss scenario — caller just doesn't invoke it)
    expect(fn).not.toHaveBeenCalled();
  });
});

// #1105 (María audio 30-08): "eliminar... parece que vaya a eliminar la
// pieza cuando no la elimina... no es muy intuitivo" — el diálogo de Tijeras
// usaba el copy genérico en inglés de useGuardedAction, con el botón
// "Eliminar" por defecto. El botón tiene que nombrar el resultado real: la
// pieza original SIEMPRE se sustituye por 2 piezas nuevas (no hay una
// variante que la conserve), así que el copy no puede prometer eso.
describe('useGuardedAction — copy del diálogo de Tijeras (#1105)', () => {
  function setup() {
    const store = configureStore({ reducer: { workflow: workflowReducer, copilotUI: copilotUIReducer } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const { result } = renderHook(() => useGuardedAction(), { wrapper });
    return { store, result };
  }

  it('splitPiece pide confirmación en español y el botón nombra el resultado real, no "Eliminar"', () => {
    const { store, result } = setup();
    act(() => { result.current('splitPiece', vi.fn()); });
    const pending = store.getState().copilotUI.pendingConfirmation;
    expect(pending).toBeTruthy();
    expect(pending!.title.toLowerCase()).toMatch(/dividir/);
    expect(pending!.description.toLowerCase()).not.toMatch(/split/); // nada de inglés
    expect(pending!.confirmLabel).toBeDefined();
    expect(pending!.confirmLabel!.toLowerCase()).not.toBe('eliminar');
    expect(pending!.confirmLabel!.toLowerCase()).not.toMatch(/^confirmar$/);
  });

  it('la descripción de splitPiece dice honestamente que la original se sustituye (no promete conservarla)', () => {
    const { store, result } = setup();
    act(() => { result.current('splitPiece', vi.fn()); });
    const pending = store.getState().copilotUI.pendingConfirmation;
    expect(pending!.description.toLowerCase()).toMatch(/sustituy|reemplaz/);
  });
});
