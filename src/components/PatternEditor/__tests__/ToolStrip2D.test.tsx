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
import ToolStrip2D from '../ToolStrip2D';

/**
 * La tira de herramienta (spec 2026-08-30 § 6) hereda los casos del unitario
 * de la barra desmontada (#1049): mide LA TIRA con dos herramientas de prueba
 * propias, no el catálogo real. Lo nuevo: la línea de sujeto, y que Ancho/Alto
 * del rectángulo ya no se pintan (son cotas sobre la pieza).
 */
const IconoVacio: React.FC<{ size?: number }> = () => null;
const CON_OPCIONES: ToolDefinition = {
  id: '__tira_con_opciones',
  name: 'Herramienta de prueba',
  context: '2d',
  icon: IconoVacio,
  options: [
    { id: 'numero', label: 'Un número', type: 'number', value: 5, min: 0, max: 10, step: 1 },
    { id: 'medida', label: 'Una medida', type: 'number', value: 100, min: 1, max: 3000, step: 1, control: 'input' },
    { id: 'lista', label: 'Una lista', type: 'select', value: 'a', choices: [{ label: 'Opción A', value: 'a' }, { label: 'Opción B', value: 'b' }] },
    { id: 'interruptor', label: 'Un interruptor', type: 'toggle', value: false },
    { id: 'color', label: 'Un color', type: 'color', value: '#334455' },
  ],
};
const SIN_OPCIONES: ToolDefinition = { id: '__tira_sin_opciones', name: 'Herramienta pelada', context: '2d', icon: IconoVacio };
toolRegistry.registerTool(CON_OPCIONES);
toolRegistry.registerTool(SIN_OPCIONES);

afterEach(cleanup);

function crearStore(activeTool: string) {
  const store = configureStore({ reducer: { tools: toolReducer, editor: editorReducer } });
  store.dispatch(setActiveTool(activeTool as Tool2D));
  return store;
}

function montar(activeTool: string, lineaDeSujeto: string | null = null) {
  const store = crearStore(activeTool);
  const utils = render(
    <Provider store={store}>
      <ToolStrip2D lineaDeSujeto={lineaDeSujeto} />
    </Provider>,
  );
  return { store, ...utils };
}

describe('ToolStrip2D', () => {
  it('pinta un control por cada opción declarada, de cada tipo', () => {
    montar('__tira_con_opciones');
    expect(screen.getByLabelText('Un número').getAttribute('type')).toBe('range');
    expect(screen.getByLabelText('Una medida').getAttribute('type')).toBe('number');
    expect(screen.getByLabelText('Una lista').tagName).toBe('SELECT');
    expect(screen.getByRole('button', { name: 'Un interruptor' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByLabelText('Un color').getAttribute('type')).toBe('color');
  });

  it('despacha setToolOption al cambiar un desplegable, mover un deslizador (como número) y pulsar un interruptor', () => {
    const { store } = montar('__tira_con_opciones');
    fireEvent.change(screen.getByLabelText('Una lista'), { target: { value: 'b' } });
    fireEvent.change(screen.getByLabelText('Un número'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Un interruptor' }));
    const v = store.getState().tools.toolOptions.__tira_con_opciones;
    expect(v.lista).toBe('b');
    expect(v.numero).toBe(7);
    expect(v.interruptor).toBe(true);
  });

  it('el input numérico despacha con Number() y no despacha si el campo queda vacío', () => {
    const { store } = montar('__tira_con_opciones');
    const medida = screen.getByLabelText('Una medida');
    fireEvent.change(medida, { target: { value: '300' } });
    expect(store.getState().tools.toolOptions.__tira_con_opciones.medida).toBe(300);
    fireEvent.change(medida, { target: { value: '' } });
    expect(store.getState().tools.toolOptions.__tira_con_opciones.medida).toBe(300);
  });

  it('conserva id="opcion-<id>" en los controles (los e2e de piquete y tijeras lo usan)', () => {
    montar('__tira_con_opciones');
    expect(screen.getByLabelText('Una lista').id).toBe('opcion-lista');
  });

  it('muestra el atajo efectivo cuando la herramienta tiene uno', () => {
    const store = crearStore('notch');
    render(
      <Provider store={store}>
        <ShortcutProvider>
          <ToolStrip2D lineaDeSujeto={null} />
        </ShortcutProvider>
      </Provider>,
    );
    const def = DEFAULT_SHORTCUTS.find((s) => s.id === 'tool.notch')!;
    const esperado = displayShortcutBinding({ key: def.key, ctrl: def.ctrl, shift: def.shift, alt: def.alt });
    expect(esperado).not.toBe('');
    expect(screen.getByText(esperado).tagName).toBe('KBD');
  });

  it('sin opciones sigue presente con el nombre (la puerta no se pierde)', () => {
    montar('__tira_sin_opciones');
    expect(screen.getByRole('group', { name: 'Herramienta activa' })).toBeTruthy();
    expect(screen.getByText('Herramienta pelada')).toBeTruthy();
  });

  it('la línea de sujeto se pinta cuando la hay y no cuando es null', () => {
    montar('__tira_con_opciones', 'Editando: la pieza nueva');
    expect(screen.getByText('Editando: la pieza nueva')).toBeTruthy();
    cleanup();
    const { container } = montar('__tira_con_opciones', null);
    expect(container.querySelector('.tool-strip__subject')).toBeNull();
  });

  it('con rectángulo no pinta Ancho ni Alto: son cotas sobre la pieza', () => {
    montar('rectangle', 'Un clic crea 300 × 150 mm · arrastra para dibujar');
    expect(screen.queryByLabelText('Ancho')).toBeNull();
    expect(screen.queryByLabelText('Alto')).toBeNull();
    expect(screen.getByText('Rectángulo')).toBeTruthy();
    expect(screen.getByText('Un clic crea 300 × 150 mm · arrastra para dibujar')).toBeTruthy();
  });

  it('#1100 — el margen del próximo clic se confirma con Enter y refleja cambios del store', () => {
    const { store } = montar('seamAllowance');
    const input = screen.getByLabelText('Margen del próximo clic') as HTMLInputElement;

    expect(input.value).toBe('9.5');
    expect(screen.getByText('mm')).toBeTruthy();

    fireEvent.change(input, { target: { value: '18.5' } });
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(9.5);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(18.5);

    act(() => { store.dispatch(setDefaultSAWidth(12)); });
    expect(input.value).toBe('12');
  });

  it('#1100 — el margen del próximo clic se confirma al salir del campo', () => {
    const { store } = montar('seamAllowance');
    const input = screen.getByLabelText('Margen del próximo clic');

    fireEvent.change(input, { target: { value: '24' } });
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(9.5);
    fireEvent.blur(input);
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(24);
  });

  it('#1100 — otras herramientas no muestran ni modifican el margen por accidente', () => {
    const { store } = montar('__tira_sin_opciones');
    expect(screen.queryByLabelText('Margen del próximo clic')).toBeNull();
    expect(store.getState().editor.defaultSeamAllowanceWidth).toBe(9.5);
  });

  it('el selector devuelve una referencia estable cuando no hay valores guardados', () => {
    const avisos: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { avisos.push(args.map(String).join(' ')); });
    montar('__tira_sin_opciones');
    spy.mockRestore();
    expect(avisos.filter((a) => a.includes('Selector unknown returned a different result'))).toEqual([]);
  });
});
