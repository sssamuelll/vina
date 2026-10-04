/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { abrirIA, ocultarIA, empezarTurno, terminarTurno, olvidarConversacion } from '../../../store/iaSlice';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import TopBar from '../TopBar';
import UnifiedBar from '../UnifiedBar';

/**
 * La IA convocada (spec 2026-10-02 § 6.2 y § 4.2): no existe en reposo; un
 * modo; el botón «IA» dice sus tres estados; Esc con texto lo borra y con el
 * campo vacío la oculta, antes que la selección.
 */
beforeEach(() => {
  act(() => {
    store.dispatch(ocultarIA());
    store.dispatch(terminarTurno());
    store.dispatch(olvidarConversacion());
    store.dispatch({ type: 'editor/clearSelection' });
  });
});
afterEach(cleanup);

/** Los atajos de la app de verdad: sin ellos, un Escape que no deselecciona no prueba nada. */
function Atajos() {
  useKeyboardShortcuts();
  return null;
}

function montar(hijos: ReactNode) {
  return render(
    <Provider store={store}>
      <ShortcutProvider>
        <Atajos />
        {hijos}
      </ShortcutProvider>
    </Provider>,
  );
}

describe('el botón «IA», en sus tres estados', () => {
  it('cerrada: en reposo; abierta: marcado; trabajando con la barra oculta: marcado y con señal', () => {
    montar(<TopBar onOpenPanel={() => {}} onImportDXF={() => {}} />);
    const ia = screen.getByRole('button', { name: 'Conversar con la IA' });
    expect(ia.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(ia);
    expect(store.getState().ia.abierta).toBe(true);
    expect(screen.getByRole('button', { name: 'Conversar con la IA' }).getAttribute('aria-pressed')).toBe('true');
    act(() => { store.dispatch(empezarTurno()); store.dispatch(ocultarIA()); });
    const trabajando = screen.getByRole('button', { name: 'La IA está trabajando' });
    expect(trabajando.getAttribute('aria-pressed')).toBe('true');
    expect(trabajando.querySelector('.boton-ia__actividad')).not.toBeNull();
  });
});

describe('la cápsula', () => {
  it('un solo modo: ni botones de modo ni «Enviar» hasta que hay texto; es papel', () => {
    act(() => { store.dispatch(abrirIA()); });
    montar(<UnifiedBar onOpenPanel={() => {}} />);
    const campo = screen.getByPlaceholderText('Pide algo o pregunta');
    expect(document.activeElement).toBe(campo);
    expect(document.querySelector('.unified-bar__modes')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull();
    fireEvent.change(campo, { target: { value: 'hola' } });
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeTruthy();
    expect(document.querySelector('.unified-bar')?.getAttribute('data-material')).toBe('papel');
  });

  it('«/» al empezar son comandos; Retroceso con el campo vacío vuelve a la conversación', () => {
    act(() => { store.dispatch(abrirIA()); });
    montar(<UnifiedBar onOpenPanel={() => {}} />);
    const campo = screen.getByPlaceholderText('Pide algo o pregunta') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '/' } });
    expect(campo.value).toBe('');
    expect(screen.getByPlaceholderText('Escribe un comando')).toBe(campo);
    expect(document.querySelector('.unified-bar__panel')).not.toBeNull();
    fireEvent.keyDown(campo, { key: 'Backspace' });
    expect(screen.getByPlaceholderText('Pide algo o pregunta')).toBe(campo);
  });

  it('Ctrl+K abre con los comandos', () => {
    act(() => { store.dispatch(abrirIA('comandos')); });
    montar(<UnifiedBar onOpenPanel={() => {}} />);
    expect(screen.getByPlaceholderText('Escribe un comando')).toBeTruthy();
  });

  it('Esc con texto lo borra; con el campo vacío la oculta, y la pieza sigue seleccionada', () => {
    act(() => { store.dispatch(abrirIA()); store.dispatch({ type: 'editor/selectPiece', payload: 'p1' }); });
    expect(store.getState().editor.selectedPieceIds, 'el caso no se ejerce').toEqual(['p1']);
    montar(<UnifiedBar onOpenPanel={() => {}} />);
    const campo = screen.getByPlaceholderText('Pide algo o pregunta') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: 'acorta' } });
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(campo.value).toBe('');
    expect(store.getState().ia.abierta).toBe(true);
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(store.getState().ia.abierta).toBe(false);
    expect(store.getState().editor.selectedPieceIds, 'el Escape de la barra soltó la pieza').toEqual(['p1']);
  });
});

describe('los atajos', () => {
  it('Ctrl+/ es global y abre la conversación; ya no hay panel del chat que mostrar u ocultar', async () => {
    const { DEFAULT_SHORTCUTS } = await import('../../../shortcuts/defaults');
    expect(DEFAULT_SHORTCUTS.find((s) => s.id === 'copilot.focusChat')).toMatchObject({ key: '/', ctrl: true, context: 'global', label: 'Conversar con la IA' });
    expect(DEFAULT_SHORTCUTS.find((s) => s.id === 'copilot.togglePanel')).toBeUndefined();
  });

  it('Ctrl+/ y Ctrl+K desde el lienzo abren la barra, cada uno en su modo', () => {
    montar(<div data-shortcut-context="2d" tabIndex={0} data-testid="lienzo" />);
    const lienzo = screen.getByTestId('lienzo');
    lienzo.focus();
    fireEvent.keyDown(lienzo, { key: '/', ctrlKey: true });
    expect(store.getState().ia).toMatchObject({ abierta: true, modoDeApertura: 'conversacion' });
    act(() => { store.dispatch(ocultarIA()); });
    fireEvent.keyDown(lienzo, { key: 'k', ctrlKey: true });
    expect(store.getState().ia).toMatchObject({ abierta: true, modoDeApertura: 'comandos' });
  });
});
