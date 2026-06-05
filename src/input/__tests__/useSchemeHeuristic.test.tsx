/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import inputSchemeReducer, { setUserScheme } from '../../store/inputSchemeSlice';
import copilotUIReducer from '../../store/copilotUISlice';
import { useSchemeHeuristic } from '../useSchemeHeuristic';

function makeStore() {
  return configureStore({
    reducer: { inputScheme: inputSchemeReducer, copilotUI: copilotUIReducer },
  });
}

function wrapperFor(store: ReturnType<typeof makeStore>) {
  return ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
}

describe('useSchemeHeuristic', () => {
  it('switches to trackpad + shows toast on first ctrlKey wheel (synthesized pinch)', () => {
    const store = makeStore();
    renderHook(() => useSchemeHeuristic(), { wrapper: wrapperFor(store) });
    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -3 }));
    });
    expect(store.getState().inputScheme).toEqual({ scheme: 'trackpad', source: 'auto' });
    expect(store.getState().copilotUI.toasts).toHaveLength(1);
    expect(store.getState().copilotUI.toasts[0].type).toBe('info');
  });

  it('ignores plain wheel and ⌘+wheel', () => {
    const store = makeStore();
    renderHook(() => useSchemeHeuristic(), { wrapper: wrapperFor(store) });
    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, metaKey: true, deltaY: 1 }));
    });
    expect(store.getState().inputScheme.source).toBe('default');
  });

  it('never fires once the user chose explicitly', () => {
    const store = makeStore();
    store.dispatch(setUserScheme('mouse'));
    renderHook(() => useSchemeHeuristic(), { wrapper: wrapperFor(store) });
    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -3 }));
    });
    expect(store.getState().inputScheme).toEqual({ scheme: 'mouse', source: 'user' });
    expect(store.getState().copilotUI.toasts).toHaveLength(0);
  });

  it('fires at most once (source flips to auto → listeners removed)', () => {
    const store = makeStore();
    renderHook(() => useSchemeHeuristic(), { wrapper: wrapperFor(store) });
    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -3 }));
    });
    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -3 }));
    });
    expect(store.getState().copilotUI.toasts).toHaveLength(1);
  });

  it('fires at most once even when two events arrive before re-render (same act)', () => {
    const store = makeStore();
    renderHook(() => useSchemeHeuristic(), { wrapper: wrapperFor(store) });
    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -3 }));
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -3 }));
    });
    expect(store.getState().copilotUI.toasts).toHaveLength(1);
  });
});
