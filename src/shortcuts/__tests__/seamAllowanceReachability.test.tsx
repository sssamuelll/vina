// @vitest-environment jsdom
/**
 * Reachability contract for the seamAllowance tool (María, hallazgo #2).
 *
 * The tool existed in the registry since the old shell but had NO activator:
 * not in DOCK_2D_CATALOG, no shortcut. These tests pin the full activation
 * chain: ShortcutDef → registry match → useKeyboardShortcuts handler →
 * activate2DTool (both editor.activeTool AND tools.activeTool2D, per the
 * single-writer convention in store/toolActivation.ts).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { DEFAULT_SHORTCUTS } from '../defaults';
import { ShortcutRegistry } from '../ShortcutRegistry';
import { ShortcutProvider } from '../ShortcutProvider';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import editorReducer from '../../store/editorSlice';
import projectReducer from '../../store/projectSlice';
import simulationReducer from '../../store/simulationSlice';
import toolReducer from '../../store/toolSlice';

afterEach(cleanup);

describe('tool.seamAllowance shortcut definition', () => {
  it('exists as a plain "o" binding in 2d context', () => {
    const def = DEFAULT_SHORTCUTS.find(d => d.id === 'tool.seamAllowance');
    expect(def).toBeTruthy();
    expect(def!.key).toBe('o');
    expect(def!.context).toBe('2d');
    expect(def!.ctrl ?? false).toBe(false);
    expect(def!.shift ?? false).toBe(false);
  });

  it('wins the match for plain "o" when the 2d context is active', () => {
    // Dual-context key precedent: 'w' = tool.pin (2d) + tool3d.pin (3d).
    // 'o' pairs with tool3d.meshGrab (3d) the same way; with 2d active the
    // 2D definition must resolve first.
    const registry = new ShortcutRegistry(DEFAULT_SHORTCUTS);
    const match = registry.matchEvent(
      new KeyboardEvent('keydown', { key: 'o' }),
      ['global', '2d', '3d'],
    );
    expect(match).toBe('tool.seamAllowance');
  });
});

describe('seamAllowance activation chain (integration)', () => {
  function makeStore() {
    return configureStore({
      reducer: {
        editor: editorReducer,
        project: projectReducer,
        simulation: simulationReducer,
        tools: toolReducer,
      },
    });
  }

  function Hooked() {
    useKeyboardShortcuts();
    return null;
  }

  it('pressing "o" activates the seamAllowance tool through both writers', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <ShortcutProvider>
          <Hooked />
        </ShortcutProvider>
      </Provider>,
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }));
    });

    expect(store.getState().editor.activeTool).toBe('seamAllowance');
    expect(store.getState().tools.activeTool2D).toBe('seamAllowance');
  });

  it('does NOT fire while a <select> has focus (Properties panel dropdowns)', () => {
    // ShortcutProvider skips input/textarea but selects also swallow typed
    // letters — pressing 'o' while choosing a fabric code must not switch
    // tools under the user.
    const store = makeStore();
    render(
      <Provider store={store}>
        <ShortcutProvider>
          <Hooked />
          <select aria-label="probe-select"><option>SELF</option></select>
        </ShortcutProvider>
      </Provider>,
    );
    const select = document.querySelector('select')!;
    select.focus();

    act(() => {
      select.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }));
    });

    expect(store.getState().editor.activeTool).not.toBe('seamAllowance');
  });
});
