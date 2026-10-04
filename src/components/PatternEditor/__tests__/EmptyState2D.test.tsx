/**
 * @vitest-environment jsdom
 *
 * Guards the 2D-canvas onboarding empty-state. shouldShowEmptyState decides
 * when it mounts (idle Select tool, no pieces); the component renders the four
 * affordances and wires Import DXF + Draw-from-scratch.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import toolsReducer from '../../../store/toolSlice';
import EmptyState2D, { shouldShowEmptyState } from '../EmptyState2D';
import iaReducer from '../../../store/iaSlice';

afterEach(cleanup);

function renderWithStore(props: { onImportDXF?: () => void } = {}) {
  const store = configureStore({ reducer: { editor: editorReducer, tools: toolsReducer, ia: iaReducer } });
  render(
    <Provider store={store}>
      <EmptyState2D {...props} />
    </Provider>,
  );
  return store;
}

describe('shouldShowEmptyState', () => {
  it('shows on the Select tool with no pieces', () => {
    expect(shouldShowEmptyState(0, 'select')).toBe(true);
  });
  it('hides once at least one piece exists', () => {
    expect(shouldShowEmptyState(1, 'select')).toBe(false);
  });
  it('hides when any drawing tool is active', () => {
    expect(shouldShowEmptyState(0, 'pen')).toBe(false);
    expect(shouldShowEmptyState(0, 'rectangle')).toBe(false);
  });
});

describe('EmptyState2D', () => {
  it('renders the heading and all four affordances', () => {
    renderWithStore({ onImportDXF: () => {} });
    expect(screen.getByText('Trae tu patrón')).toBeTruthy();
    expect(screen.getByRole('button', { name: /importar dxf/i })).toBeTruthy();
    expect(screen.getByText(/suelta tu \.dxf/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /dibujar desde cero/i })).toBeTruthy();
    expect(screen.getByText(/descríbelo a la/i)).toBeTruthy();
  });

  it('calls onImportDXF when the primary button is clicked', () => {
    const onImportDXF = vi.fn();
    renderWithStore({ onImportDXF });
    fireEvent.click(screen.getByRole('button', { name: /importar dxf/i }));
    expect(onImportDXF).toHaveBeenCalledTimes(1);
  });

  it('activates the Pen tool in both slices when Draw from scratch is clicked', () => {
    const store = renderWithStore({ onImportDXF: () => {} });
    expect(store.getState().editor.activeTool).toBe('select');
    fireEvent.click(screen.getByRole('button', { name: /dibujar desde cero/i }));
    expect(store.getState().editor.activeTool).toBe('pen');
    expect(store.getState().tools.activeTool2D).toBe('pen');
  });

  it('disables the Import DXF button when no handler is provided', () => {
    renderWithStore();
    const btn = screen.getByRole('button', { name: /importar dxf/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('el aviso de la IA la convoca (spec 2026-10-02 § 6.2): la barra no existe en reposo', () => {
    const store = renderWithStore({ onImportDXF: () => {} });
    fireEvent.click(screen.getByRole('button', { name: /describe tu patrón a la ia/i }));
    expect(store.getState().ia.abierta).toBe(true);
  });
});
