// @vitest-environment jsdom
/**
 * La bitácora ve cada atajo que hace match: quién era y si alguien lo atendió.
 * Un match sin handler registrado era silencio (spec caja-negra § 3.4).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ShortcutProvider } from '../ShortcutProvider';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import editorReducer from '../../store/editorSlice';
import projectReducer from '../../store/projectSlice';
import simulationReducer from '../../store/simulationSlice';
import toolReducer from '../../store/toolSlice';
import { clearJournal, getJournal } from '../../utils/telemetry/journal';

afterEach(cleanup);
beforeEach(clearJournal);

const shortcuts = () => getJournal().events.filter((e) => e.kind === 'shortcut');

function makeStore() {
  return configureStore({
    reducer: { editor: editorReducer, project: projectReducer, simulation: simulationReducer, tools: toolReducer },
  });
}

function Hooked() {
  useKeyboardShortcuts();
  return <div data-shortcut-context="2d" tabIndex={0} data-testid="pattern-focus" />;
}

const press = (target: Element, key: string) =>
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });

describe('ShortcutProvider — bitácora', () => {
  it('un atajo atendido queda con handled true', () => {
    const store = makeStore();
    const view = render(<Provider store={store}><ShortcutProvider><Hooked /></ShortcutProvider></Provider>);
    const focusTarget = view.getByTestId('pattern-focus');
    focusTarget.focus();
    press(focusTarget, 'q');
    expect(store.getState().editor.activeTool).toBe('editPattern');
    expect(shortcuts()).toEqual([
      expect.objectContaining({ name: 'tool.editPattern', data: { key: 'q', ctrl: false, shift: false, alt: false, handled: true } }),
    ]);
  });

  it('un match sin handler registrado queda con handled false, y una tecla sin match no deja nada', () => {
    const view = render(<ShortcutProvider><div data-shortcut-context="2d" tabIndex={0} data-testid="bare" /></ShortcutProvider>);
    const bare = view.getByTestId('bare');
    bare.focus();
    press(bare, 'q');
    press(bare, 'ñ');
    expect(shortcuts()).toEqual([
      expect.objectContaining({ name: 'tool.editPattern', data: expect.objectContaining({ handled: false }) }),
    ]);
  });
});
