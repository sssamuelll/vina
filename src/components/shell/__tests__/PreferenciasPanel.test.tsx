/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import PreferenciasPanel from '../PreferenciasPanel';
import { PREFERENCES_MENU } from '../LogoMenu';
import { COMMANDS } from '../unifiedBarCommandDefs';

/**
 * Preferencias (spec 2026-10-02 § 6.1): lo que era el «modo ajustes» de la
 * barra de IA pasa a un panel, con puerta en Vina › Preferencias y en la
 * paleta. El panel ya tiene título y ✕: AgentSettings no pinta los suyos.
 */
afterEach(cleanup);

describe('el panel «IA y ratón»', () => {
  it('trae el esquema del ratón y los ajustes de la IA, sin una segunda cabecera ni un segundo «Cerrar»', () => {
    render(<Provider store={store}><PreferenciasPanel alCerrar={() => {}} /></Provider>);
    expect(screen.getByText('Ratón (CLO3D)')).toBeTruthy();
    expect(screen.getByText('Idioma')).toBeTruthy();
    expect(screen.queryByText('Ajustes del agente')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
  });

  it('«Guardar preferencias» guarda y cierra el panel', () => {
    const alCerrar = vi.fn();
    render(<Provider store={store}><PreferenciasPanel alCerrar={alCerrar} /></Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar preferencias' }));
    expect(alCerrar).toHaveBeenCalled();
  });
});

describe('sus puertas', () => {
  it('Vina › Preferencias › «IA y ratón...»', () => {
    expect(PREFERENCES_MENU).toContainEqual(expect.objectContaining({ label: 'IA y ratón...', panel: 'Preferences' }));
  });

  it('la paleta: Paneles › «IA y ratón»', () => {
    const onOpenPanel = vi.fn();
    const cmd = COMMANDS.find((c) => c.name === 'IA y ratón');
    expect(cmd?.category).toBe('Paneles');
    cmd!.action(store.dispatch, { onOpenPanel } as never);
    expect(onOpenPanel).toHaveBeenCalledWith('Preferences');
  });
});
