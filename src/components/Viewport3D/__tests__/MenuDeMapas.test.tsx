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
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';
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

// El foco, como «Más» en la línea al pie: con el teclado (`detail` 0: Enter o Espacio)
// entra a la hoja —cuelga de <body> y Tab desde «Mapa» no llegaría— y vuelve al
// disparador al elegir o con Escape; con el ratón no se mueve, porque los botones de
// la barra no toman el foco y un `focus()` de más deja a Espacio siendo «del botón»
// (`esTeclaDeBotonera`) en vez de alternar la simulación. Los tests de arriba usan
// `fireEvent.click`, que trae `detail: 0`: solo ejercían el camino del teclado.
describe('MenuDeMapas ▸ el foco', () => {
  const clicDeRaton = (el: Element) => { fireEvent.mouseDown(el); fireEvent.mouseUp(el); fireEvent.click(el, { detail: 1 }); };

  it('abierto con el teclado, el foco entra a la hoja', () => {
    montar();
    simulando();
    abrir();
    expect(menu()!.contains(document.activeElement), 'el foco se quedó fuera de la hoja').toBe(true);
  });

  it('abierto con el ratón, el foco se queda donde estaba', () => {
    montar();
    simulando();
    const antes = document.activeElement;
    clicDeRaton(disparador());
    expect(menu(), 'el caso no se ejerce: no abrió').not.toBeNull();
    expect(document.activeElement, 'abrir con el ratón movió el foco a la hoja').toBe(antes);
  });

  it('Escape, con el foco dentro de la hoja, lo devuelve a «Mapa»', () => {
    montar();
    simulando();
    abrir();
    escape();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(disparador());
  });

  it('elegir un mapa con el teclado devuelve el foco a «Mapa»', () => {
    montar();
    simulando();
    abrir();
    fireEvent.click(screen.getByTitle('Mapa de estiramiento (Alt+7)'));
    expect(document.activeElement).toBe(disparador());
  });

  it('elegir un mapa con el ratón no deja el foco en «Mapa»', () => {
    montar();
    simulando();
    clicDeRaton(disparador());
    clicDeRaton(screen.getByTitle('Mapa de estiramiento (Alt+7)'));
    expect(store.getState().simulation.fitMapMode, 'el caso no se ejerce: no se eligió el mapa').toBe('strain');
    expect(document.activeElement, 'el menú dejó el foco en un botón de la barra').toBe(document.body);
  });

  it('«Ajustes del mapa…»: con el teclado el foco pasa a sus campos; con el ratón se queda donde estaba', () => {
    montar();
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes del mapa…' }));
    expect(screen.getByRole('group', { name: 'Ajustes del mapa' }).contains(document.activeElement), 'con el teclado el foco no pasó a los campos').toBe(true);
    cleanup();
    montar();
    clicDeRaton(disparador());
    const antes = document.activeElement;
    clicDeRaton(screen.getByRole('button', { name: 'Ajustes del mapa…' }));
    expect(screen.getByRole('group', { name: 'Ajustes del mapa' }), 'el caso no se ejerce').toBeTruthy();
    expect(document.activeElement, 'con el ratón el foco se movió a los campos').toBe(antes);
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

describe('MenuDeMapas ▸ los campos, el cierre y la bitácora', () => {
  const abrirAjustes = () => { abrir(); fireEvent.click(screen.getByRole('button', { name: 'Ajustes del mapa…' })); };

  it('cada campo escribe su sitio, con su escala (mínimos y umbrales)', () => {
    montar();
    abrirAjustes();
    fireEvent.change(screen.getByLabelText('Tensión mín'), { target: { value: '5' } });
    expect(store.getState().simulation.fitMapConfig.stressRange).toEqual([5, 100]);
    fireEvent.change(screen.getByLabelText('Estiramiento mín'), { target: { value: '95' } });
    expect(store.getState().simulation.fitMapConfig.strainRange[0]).toBeCloseTo(0.95);
    fireEvent.change(screen.getByLabelText('Umbral apretado'), { target: { value: '70' } });
    expect(store.getState().simulation.fitMapConfig.fitThresholds[0]).toBeCloseTo(0.7);
    fireEvent.change(screen.getByLabelText('Umbral no entra'), { target: { value: '110' } });
    expect(store.getState().simulation.fitMapConfig.fitThresholds[1]).toBeCloseTo(1.1);
  });

  it('cada campo enseña la configuración en su unidad', () => {
    act(() => { store.dispatch(updateFitMapConfig({ strainRange: [1, 1.25], fitThresholds: [0.75, 0.9], pressureDistance: 0.004 })); });
    montar();
    abrirAjustes();
    expect((screen.getByLabelText('Estiramiento máx') as HTMLInputElement).value).toBe('125');
    expect((screen.getByLabelText('Umbral no entra') as HTMLInputElement).value).toBe('90');
    expect((screen.getByLabelText('Distancia de presión') as HTMLInputElement).value).toBe('4');
  });

  it('se cierra con un clic fuera, con un cambio de tamaño y con otro clic en «Mapa»', () => {
    montar();
    abrir();
    fireEvent.mouseDown(document.body);
    expect(menu(), 'un clic fuera no la cierra').toBeNull();
    abrir();
    fireEvent(window, new Event('resize'));
    expect(menu(), 'cambiar el tamaño no la cierra').toBeNull();
    abrir();
    fireEvent.click(disparador());
    expect(menu(), 'otro clic en «Mapa» no la cierra').toBeNull();
  });

  it('en reposo «Mapa» dice qué hacer, y ningún mapa sale marcado aunque el modo siga puesto', () => {
    act(() => { store.dispatch(setFitMapMode('strain')); });
    montar();
    expect(disparador().title).toBe('Simula para ver los mapas de ajuste');
    abrir();
    expect(screen.getByTitle(/^Mapa de estiramiento/).getAttribute('aria-pressed')).toBe('false');
  });

  it('abrir y cerrar quedan en la bitácora', () => {
    clearJournal();
    montar();
    abrir();
    escape();
    const hojas = getJournal().events.filter((e) => e.kind === 'ui' && e.name === 'mapas').map((e) => (e.data as { hoja: unknown }).hoja);
    expect(hojas).toEqual(['lista', null]);
  });
});
