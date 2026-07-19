// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
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
  return <div data-shortcut-context="2d" tabIndex={0} data-testid="pattern-focus" />;
}

describe('tool.editPattern shortcut contract', () => {
  it('is plain q in 2d context', () => {
    const def = DEFAULT_SHORTCUTS.find((item) => item.id === 'tool.editPattern');
    expect(def).toMatchObject({ key: 'q', context: '2d', label: 'Editar patrón' });
    expect(def?.ctrl ?? false).toBe(false);
    expect(def?.shift ?? false).toBe(false);
  });

  it('keeps q contextual and gives combined context to the earlier 2d definition', () => {
    const registry = new ShortcutRegistry(DEFAULT_SHORTCUTS);
    const event = new KeyboardEvent('keydown', { key: 'q' });
    expect(registry.matchEvent(event, ['global', '2d'])).toBe('tool.editPattern');
    expect(registry.matchEvent(event, ['global', '3d'])).toBe('tool3d.camera');
    expect(registry.matchEvent(event, ['global', '2d', '3d'])).toBe('tool.editPattern');
  });

  it('pressing q with 2d focus activates both 2d tool authorities', () => {
    const store = makeStore();
    const view = render(
      <Provider store={store}>
        <ShortcutProvider><Hooked /></ShortcutProvider>
      </Provider>,
    );
    const focusTarget = view.getByTestId('pattern-focus');
    focusTarget.focus();
    act(() => {
      focusTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
    });
    expect(store.getState().editor.activeTool).toBe('editPattern');
    expect(store.getState().tools.activeTool2D).toBe('editPattern');
  });
});
