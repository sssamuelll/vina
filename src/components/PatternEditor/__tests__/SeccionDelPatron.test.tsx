/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer from '../../../store/toolSlice';
import editorReducer, { setActiveTool, setDefaultSAWidth } from '../../../store/editorSlice';
import { toolRegistry } from '../../../tools';
import type { ToolDefinition } from '../../../tools/types';
import type { Tool2D } from '../../../types/types';
import { ShortcutProvider, DEFAULT_SHORTCUTS } from '../../../shortcuts';
import { displayShortcutBinding } from '../../shell/shortcutDisplay';
import SeccionDelPatron from '../SeccionDelPatron';
import type { FraseDelPie } from '../fraseDeLaFase';

/**
 * La sección del patrón de la línea al pie (spec 2026-10-02 § 5.3 y § 5.4):
 * hereda los casos de la tarjeta de la esquina (`ToolStrip2D`, borrada en
 * P2b) y mide lo nuevo: el nombre del margen, las superficies `pie` y
 * `pista`, la prioridad de la frase y el contexto de los atajos.
 */
const IconoVacio: React.FC<{ size?: number }> = () => null;
const CON_OPCIONES: ToolDefinition = {
  id: '__pie_con_opciones',
  name: 'Herramienta de prueba',
  context: '2d',
  icon: IconoVacio,
  options: [
    { id: 'numero', label: 'Un número', type: 'number', value: 5, min: 0, max: 10, step: 1 },
    { id: 'lista', label: 'Una lista', type: 'select', value: 'a', choices: [{ label: 'Opción A', value: 'a' }, { label: 'Opción B', value: 'b' }] },
    { id: 'interruptor', label: 'Un interruptor', type: 'toggle', value: false },
  ],
};
const SIN_OPCIONES: ToolDefinition = { id: '__pie_sin_opciones', name: 'Herramienta pelada', context: '2d', icon: IconoVacio };
toolRegistry.registerTool(CON_OPCIONES);
toolRegistry.registerTool(SIN_OPCIONES);

afterEach(cleanup);

function crearStore(activeTool: string) {
  const store = configureStore({ reducer: { tools: toolReducer, editor: editorReducer } });
  store.dispatch(setActiveTool(activeTool as Tool2D));
  return store;
}

function montar(
  activeTool: string,
  props: { frase?: FraseDelPie | null; onClearMeasurements?: () => void; hasMeasurements?: boolean } = {},
) {
  const store = crearStore(activeTool);
  const utils = render(
    <Provider store={store}>
      <SeccionDelPatron
        frase={props.frase ?? null}
        onClearMeasurements={props.onClearMeasurements}
        hasMeasurements={props.hasMeasurements}
      />
    </Provider>,
  );
  return { store, ...utils };
}

describe('quién', () => {
  it('sin opciones sigue presente con el nombre: la puerta no se pierde', () => {
    montar('__pie_sin_opciones');
    expect(screen.getByRole('group', { name: 'Herramienta activa' })).toBeTruthy();
    expect(screen.getByText('Herramienta pelada')).toBeTruthy();
  });

  it('una del margen se llama como en el margen', () => {
    montar('seamAllowance');
    expect(screen.getByText('Margen de costura')).toBeTruthy();
  });

  it('enseña la tecla efectiva, en un kbd', () => {
    const store = crearStore('notch');
    render(
      <Provider store={store}>
        <ShortcutProvider>
          <SeccionDelPatron frase={null} />
        </ShortcutProvider>
      </Provider>,
    );
    const def = DEFAULT_SHORTCUTS.find((s) => s.id === 'tool.notch')!;
    const esperado = displayShortcutBinding({ key: def.key, ctrl: def.ctrl, shift: def.shift, alt: def.alt });
    expect(esperado).not.toBe('');
    expect(screen.getByText(esperado).tagName).toBe('KBD');
  });
});

describe('las opciones', () => {
  it('un control por opción, y cada cambio despacha setToolOption', () => {
    const { store } = montar('__pie_con_opciones');
    fireEvent.click(screen.getByRole('button', { name: 'Opción B' }));
    fireEvent.change(screen.getByLabelText('Un número'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Un interruptor' }));
    const v = store.getState().tools.toolOptions.__pie_con_opciones;
    expect(v.lista).toBe('b');
    expect(v.numero).toBe(7);
    expect(v.interruptor).toBe(true);
  });

  it('con opciones hay UNA superficie «pie», y cada control es su hijo directo; sin opciones, ninguna', () => {
    const { container } = montar('__pie_con_opciones');
    const pie = container.querySelectorAll('[data-superficie="pie"]');
    expect(pie).toHaveLength(1);
    expect([...pie[0].children].filter((h) => h.classList.contains('opcion-del-pie'))).toHaveLength(3);
    cleanup();
    expect(montar('__pie_sin_opciones').container.querySelector('[data-superficie="pie"]')).toBeNull();
  });

  it('con el rectángulo no pinta Ancho ni Alto: son cotas sobre la pieza', () => {
    const { container } = montar('rectangle');
    expect(screen.queryByLabelText('Ancho')).toBeNull();
    expect(screen.queryByLabelText('Alto')).toBeNull();
    expect(screen.getByText('Rectángulo')).toBeTruthy();
    expect(container.querySelector('[data-superficie="pie"]')).toBeNull();
  });

  it('#1100 — «Margen del próximo clic» escribe el margen del próximo clic, acotado, y refleja el store', () => {
    const { store } = montar('seamAllowance');
    const campo = screen.getByLabelText('Margen del próximo clic (mm)') as HTMLInputElement;
    expect(campo.value).toBe(String(store.getState().editor.defaultSeamAllowanceWidth));
    fireEvent.change(campo, { target: { value: '18.5' } });
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(18.5);
    fireEvent.change(campo, { target: { value: '80' } });
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(50);
    fireEvent.blur(campo);
    act(() => { store.dispatch(setDefaultSAWidth(12)); });
    expect(campo.value).toBe('12');
    fireEvent.click(screen.getByRole('button', { name: 'Sumar' }));
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(12.5);
  });

  it('#1100 — las demás herramientas no enseñan ni tocan el margen del próximo clic', () => {
    const { store } = montar('__pie_sin_opciones');
    const antes = store.getState().editor.defaultSeamAllowanceWidth;
    expect(screen.queryByLabelText('Margen del próximo clic (mm)')).toBeNull();
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(antes);
  });

  it('Borrar mediciones: con Medir está, apagado sin mediciones; con mediciones, borra', () => {
    const borrar = vi.fn();
    montar('measure', { onClearMeasurements: borrar, hasMeasurements: false });
    expect((screen.getByRole('button', { name: 'Borrar mediciones' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    montar('measure', { onClearMeasurements: borrar, hasMeasurements: true });
    fireEvent.click(screen.getByRole('button', { name: 'Borrar mediciones' }));
    expect(borrar).toHaveBeenCalledTimes(1);
  });
});

describe('la frase', () => {
  it('la de la fase es una «pista» llana; lo que falta, con relleno; el desenlace, con su riel', () => {
    for (const tipo of ['fase', 'falta', 'desenlace'] as const) {
      const { container } = montar('__pie_sin_opciones', { frase: { texto: `una ${tipo}`, tipo } });
      const texto = container.querySelector('[data-superficie="pista"]')!;
      expect(texto.textContent).toBe(`una ${tipo}`);
      expect(texto.classList.contains(`seccion-del-patron__texto--${tipo}`)).toBe(true);
      expect(texto.getAttribute('title'), 'recortada, entera en el título').toBe(`una ${tipo}`);
      cleanup();
    }
  });

  it('la región viva está montada siempre, también sin frase (los lectores anuncian cambios dentro de una región que ya existía)', () => {
    const { container } = montar('__pie_sin_opciones', { frase: null });
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(container.querySelector('[data-superficie="pista"]')).toBeNull();
  });
});

describe('el teclado', () => {
  it('es contexto 2D de los atajos: con el foco en un botón del pie, las teclas siguen siendo las del patrón', () => {
    const { container } = montar('__pie_con_opciones');
    expect(container.querySelector('.seccion-del-patron')!.getAttribute('data-shortcut-context')).toBe('2d');
  });

  it('el selector devuelve una referencia estable cuando no hay valores guardados', () => {
    const avisos: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { avisos.push(args.map(String).join(' ')); });
    montar('__pie_sin_opciones');
    spy.mockRestore();
    expect(avisos.filter((a) => a.includes('Selector unknown returned a different result'))).toEqual([]);
  });
});
