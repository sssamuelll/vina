/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { cambiarPuente } from '../../../store/puenteSlice';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import TopBar from '../TopBar';
import { COMANDO_CLAUDE_CODE } from '../PuertaDelAgente';
import { conectarTuAgente, desconectarTuAgente } from '../../../copilot/puente/puenteDeLaApp';
import { COMMANDS } from '../unifiedBarCommandDefs';

vi.mock('../../../copilot/puente/puenteDeLaApp', () => ({ conectarTuAgente: vi.fn(), desconectarTuAgente: vi.fn() }));

/** La puerta «Tu agente» (spec 2026-10-09, P1 y § 4.3): el enchufe al lado de «IA» y su hoja de papel. */
function Atajos() {
  useKeyboardShortcuts();
  return null;
}

function montar() {
  return render(
    <Provider store={store}>
      <ShortcutProvider>
        <Atajos />
        <TopBar onOpenPanel={() => {}} onImportDXF={() => {}} />
      </ShortcutProvider>
    </Provider>,
  );
}

const poner = (estado: Parameters<typeof cambiarPuente>[0]) => act(() => { store.dispatch(cambiarPuente(estado)); });
const hoja = () => document.querySelector<HTMLElement>('.hoja-del-agente');

beforeEach(() => {
  poner({ estado: 'apagado' });
  vi.mocked(conectarTuAgente).mockClear();
  vi.mocked(desconectarTuAgente).mockClear();
});
afterEach(cleanup);

describe('el enchufe', () => {
  it('en reposo se llama «Tu agente» y no lleva punto; conectado dice con quién y lleva el punto', () => {
    montar();
    const enchufe = screen.getByRole('button', { name: 'Tu agente' });
    expect(enchufe.querySelector('.puerta-del-agente__punto')).toBeNull();
    poner({ estado: 'conectado', agente: 'Claude Code' });
    const conectado = screen.getByRole('button', { name: 'Claude Code está conectado' });
    expect(conectado.querySelector('.puerta-del-agente__punto')).not.toBeNull();
    poner({ estado: 'conectado', agente: null });
    expect(screen.getByRole('button', { name: 'Tu agente está conectado' })).toBeTruthy();
  });
});

describe('la hoja', () => {
  it('abre en papel, como menú, con el foco en «Conectar»; Conectar conecta', async () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Tu agente' }));
    const h = hoja()!;
    expect(h.getAttribute('data-material')).toBe('papel');
    expect(h.getAttribute('data-superficie')).toBe('menu');
    expect(h.parentElement).toBe(document.body);
    expect(h.textContent).toContain('Claude Code, Claude Desktop o Cursor pueden leer y cambiar este patrón.');
    const conectar = within(h).getByRole('button', { name: 'Conectar' });
    await vi.waitFor(() => expect(document.activeElement).toBe(conectar));
    fireEvent.click(conectar);
    expect(conectarTuAgente).toHaveBeenCalledTimes(1);
  });

  it('esperando: lo dice, deja la configuración y Desconectar desconecta', () => {
    poner({ estado: 'buscando' });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Tu agente' }));
    const h = hoja()!;
    expect(h.textContent).toContain('Esperando a tu agente');
    expect(h.textContent).toContain('Configura tu agente una sola vez');
    fireEvent.click(within(h).getByRole('button', { name: 'Desconectar' }));
    expect(desconectarTuAgente).toHaveBeenCalledTimes(1);
  });

  it('conectado: con quién, y sin la configuración', () => {
    poner({ estado: 'conectado', agente: 'Claude Code' });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Claude Code está conectado' }));
    const h = hoja()!;
    expect(h.textContent).toContain('Conectado a Claude Code');
    expect(h.textContent).not.toContain('Configura tu agente');
  });

  it('bloqueado e intercambiado: cada uno con su salida', () => {
    poner({ estado: 'bloqueado' });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Tu agente' }));
    expect(hoja()!.textContent).toContain('Tu navegador bloqueó la conexión');
    fireEvent.click(within(hoja()!).getByRole('button', { name: 'Intentar de nuevo' }));
    poner({ estado: 'reemplazado' });
    expect(hoja()!.textContent).toContain('Otra pestaña de Vina tomó la conexión');
    fireEvent.click(within(hoja()!).getByRole('button', { name: 'Conectar aquí' }));
    expect(conectarTuAgente).toHaveBeenCalledTimes(2);
  });

  it('Copiar pone el comando en el portapapeles y dice «Copiado»', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Tu agente' }));
    const copiar = within(hoja()!).getByRole('button', { name: 'Copiar el comando de Claude Code' });
    fireEvent.click(copiar);
    expect(writeText).toHaveBeenCalledWith(COMANDO_CLAUDE_CODE);
    await vi.waitFor(() => expect(copiar.textContent).toBe('Copiado'));
  });

  it('la nota del permiso sale solo si el navegador va a preguntar', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'prompt' });
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Tu agente' }));
    await vi.waitFor(() => expect(hoja()!.textContent).toContain('Haz clic en «Permitir».'));
    expect(query).toHaveBeenCalledWith({ name: 'local-network-access' });
    cleanup();
    query.mockResolvedValue({ state: 'granted' });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Tu agente' }));
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    expect(hoja()!.textContent).not.toContain('Permitir');
  });

  it('Esc la cierra y el foco vuelve al enchufe; un clic fuera también la cierra', async () => {
    montar();
    const enchufe = screen.getByRole('button', { name: 'Tu agente' });
    fireEvent.click(enchufe);
    await vi.waitFor(() => expect(hoja()!.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(hoja()).toBeNull();
    expect(document.activeElement).toBe(enchufe);
    fireEvent.click(enchufe);
    expect(hoja()).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(hoja()).toBeNull();
  });
});

describe('la paleta', () => {
  it('conecta y desconecta a tu agente', () => {
    const conectar = COMMANDS.find(c => c.id === 'conectar-tu-agente')!;
    const desconectar = COMMANDS.find(c => c.id === 'desconectar-tu-agente')!;
    expect([conectar.name, conectar.description]).toEqual(['Conectar tu agente', 'Deja que Claude Code, Claude Desktop o Cursor trabajen en este patrón']);
    expect([desconectar.name, desconectar.description]).toEqual(['Desconectar tu agente', 'Tu agente deja de ver y cambiar este patrón']);
    conectar.action(store.dispatch, { onOpenPanel: () => {} });
    desconectar.action(store.dispatch, { onOpenPanel: () => {} });
    expect(conectarTuAgente).toHaveBeenCalledTimes(1);
    expect(desconectarTuAgente).toHaveBeenCalledTimes(1);
  });
});
