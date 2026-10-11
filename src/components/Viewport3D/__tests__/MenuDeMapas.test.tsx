// @vitest-environment jsdom
/**
 * El menú «Mapa» (spec 2026-10-02 § 4.2, P5): los cuatro mapas de ajuste y sus
 * ajustes, en un menú de papel que cuelga de la barra superior. Antes eran una
 * barra oscura flotante sobre el visor (`FitMapToggle`, #1010).
 *
 * Lo que no cambia: los `title` de los cuatro elementos (los e2e los buscan por
 * ahí), los atajos Alt+6 a Alt+9 (los maneja `useKeyboardShortcuts`, sin este
 * menú abierto ni montado), y que en reposo se ve apagado y dice qué hacer.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { subirPeldano } from '../../../shortcuts/escaleraDeLoLlamado';
import { startSimulation, resetSimulation, setFitMapMode, updateFitMapConfig } from '../../../store/simulationSlice';
import { DEFAULT_FIT_MAP_CONFIG } from '../../../utils/cloth/fitMaps';
import MenuDeMapas from '../MenuDeMapas';
import { MODOS_DE_MAPA } from '../modosDeMapa';

let bajarIA: (() => void) | null = null;
afterEach(() => {
  bajarIA?.();
  bajarIA = null;
  cleanup();
  act(() => {
    store.dispatch(resetSimulation());
    store.dispatch(setFitMapMode('none'));
    store.dispatch(updateFitMapConfig(DEFAULT_FIT_MAP_CONFIG));
  });
});

const montar = () => render(<Provider store={store}><ShortcutProvider><MenuDeMapas /></ShortcutProvider></Provider>);
const disparador = () => screen.getByRole('button', { name: 'Mapa' });
const abrir = () => fireEvent.click(disparador());
const menu = () => screen.queryByRole('group', { name: 'Mapas de ajuste' });
const simulando = () => act(() => { store.dispatch(startSimulation()); });
const escape = () => act(() => {
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
});

describe('MODOS_DE_MAPA', () => {
  it('son los cuatro de siempre, en el orden de sus atajos', () => {
    expect(MODOS_DE_MAPA.map((m) => [m.mode, m.label, m.shortcut])).toEqual([
      ['stress', 'Mapa de tensión', 'Alt+6'],
      ['strain', 'Mapa de estiramiento', 'Alt+7'],
      ['fit', 'Mapa de ajuste', 'Alt+8'],
      ['pressure', 'Puntos de presión', 'Alt+9'],
    ]);
  });
});

describe('MenuDeMapas', () => {
  it('cerrado por defecto: el disparador «Mapa» y ningún elemento', () => {
    montar();
    expect(disparador()).toBeTruthy();
    expect(menu()).toBeNull();
  });

  it('en reposo se ve apagado y, al abrirlo, los cuatro están apagados y dicen qué hacer', () => {
    montar();
    expect(disparador().className).toContain('menu-de-mapas__disparador--apagado');
    abrir();
    expect(menu(), 'el caso no se ejerce').not.toBeNull();
    for (const { label } of MODOS_DE_MAPA) {
      const boton = screen.getByTitle(new RegExp(`^${label}`)) as HTMLButtonElement;
      expect(boton.disabled, label).toBe(true);
      expect(boton.title, label).toMatch(/simula/i);
    }
    // Y apagado de verdad: un clic no cambia el mapa.
    fireEvent.click(screen.getByTitle(/Mapa de estiramiento/));
    expect(store.getState().simulation.fitMapMode).toBe('none');
  });

  it('con la simulación en marcha, los cuatro tienen su título con el atajo y están encendidos', () => {
    montar();
    simulando();
    abrir();
    expect(disparador().className).not.toContain('--apagado');
    for (const { label, shortcut } of MODOS_DE_MAPA) {
      const boton = screen.getByTitle(`${label} (${shortcut})`) as HTMLButtonElement;
      expect(boton.disabled, label).toBe(false);
    }
  });

  it('elegir un mapa lo enciende, cierra el menú y queda marcado al volver a abrirlo', () => {
    montar();
    simulando();
    abrir();
    fireEvent.click(screen.getByTitle('Mapa de estiramiento (Alt+7)'));
    expect(store.getState().simulation.fitMapMode).toBe('strain');
    expect(menu()).toBeNull();
    expect(disparador().className, 'con un mapa puesto el disparador se enciende').toContain('menu-de-mapas__disparador--activo');
    abrir();
    expect(screen.getByTitle('Mapa de estiramiento (Alt+7)').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTitle('Mapa de tensión (Alt+6)').getAttribute('aria-pressed')).toBe('false');
  });

  it('elegir el mapa que ya está puesto lo apaga', () => {
    montar();
    simulando();
    act(() => { store.dispatch(setFitMapMode('fit')); });
    abrir();
    fireEvent.click(screen.getByTitle('Mapa de ajuste (Alt+8)'));
    expect(store.getState().simulation.fitMapMode).toBe('none');
  });

  it('es un menú de papel que cuelga de <body>: «todo portal nace papel»', () => {
    const { container } = montar();
    abrir();
    const grupo = menu()!;
    expect(grupo.getAttribute('data-material')).toBe('papel');
    expect(grupo.getAttribute('data-superficie')).toBe('menu');
    expect(container.contains(grupo), 'el menú quedó dentro de la barra: nada fixed escapa de un contexto de apilamiento').toBe(false);
  });

  it('Escape lo cierra por la escalera: la barra de IA sigue, y el siguiente Escape es de la barra', () => {
    const alEscapeIA = vi.fn();
    bajarIA = subirPeldano('ia', 'ia', alEscapeIA);
    montar();
    abrir();
    expect(menu(), 'el caso no se ejerce').not.toBeNull();
    escape();
    expect(menu()).toBeNull();
    expect(alEscapeIA).not.toHaveBeenCalled();
    escape();
    expect(alEscapeIA).toHaveBeenCalledTimes(1);
  });
});

describe('MenuDeMapas ▸ Ajustes del mapa…', () => {
  it('abre los rangos, y los campos escriben en la configuración', () => {
    montar();
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes del mapa…' }));
    expect(menu(), 'abrir los ajustes cierra el menú').toBeNull();
    expect(screen.getByText(/Rango de tensión/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tensión máx'), { target: { value: '200' } });
    expect(store.getState().simulation.fitMapConfig.stressRange[1]).toBe(200);
    fireEvent.change(screen.getByLabelText('Estiramiento máx'), { target: { value: '150' } });
    expect(store.getState().simulation.fitMapConfig.strainRange[1]).toBeCloseTo(1.5);
    fireEvent.change(screen.getByLabelText('Distancia de presión'), { target: { value: '3' } });
    expect(store.getState().simulation.fitMapConfig.pressureDistance).toBeCloseTo(0.003);
  });

  it('«Restablecer valores» vuelve a los de fábrica', () => {
    montar();
    act(() => { store.dispatch(updateFitMapConfig({ stressRange: [10, 500] })); });
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes del mapa…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer valores' }));
    expect(store.getState().simulation.fitMapConfig).toEqual(DEFAULT_FIT_MAP_CONFIG);
  });

  it('el popover de ajustes es papel, también colgado de <body>, y Escape lo cierra', () => {
    const { container } = montar();
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes del mapa…' }));
    const popover = screen.getByText(/Rango de tensión/i).closest('[data-material="papel"]')!;
    expect(popover).toBeTruthy();
    expect(container.contains(popover)).toBe(false);
    escape();
    expect(screen.queryByText(/Rango de tensión/i)).toBeNull();
  });
});
