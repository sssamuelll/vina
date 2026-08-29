// @vitest-environment jsdom
/**
 * Regla de teclado (spec 2026-08-29 § 8): un gesto vivo es dueño de sus
 * teclas EN CAPTURA, y las teclas que nacen dentro de un campo editable
 * pertenecen al campo. Medido en el árbol: `ShortcutProvider` escucha en
 * `document` (burbuja) y corre ANTES que el router de herramientas en
 * `window` (burbuja) — un Retroceso con la anfitriona seleccionada borraba
 * la pieza antes de que el trazo lo viera. Solo la captura en `window` llega
 * primero.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import projectReducer from '../../../store/projectSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import { useEditorInteractions } from '../useEditorInteractions';
import type { Tool2D } from '../../../types/types';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  clearJournal();
});

const keysJournaled = () => getJournal().events.filter((e) => e.kind === 'gesture' && e.name === 'key');

type Tools = Parameters<typeof useEditorInteractions>[4];
type Fn = ReturnType<typeof vi.fn>;

function makeTools(): Tools {
  const cache: Record<string, Record<string, Fn>> = {};
  return new Proxy({}, {
    get(_t, tool: string) {
      cache[tool] ??= {};
      return new Proxy(cache[tool], {
        get(bag, method: string) {
          bag[method] ??= vi.fn();
          return bag[method];
        },
      });
    },
  }) as unknown as Tools;
}

function setup(tool: Tool2D) {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, inputScheme: inputSchemeReducer },
  });
  const tools = makeTools();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  renderHook(() => useEditorInteractions(tool, 1, { x: 0, y: 0 }, [], tools), { wrapper });
  const documentSpy = vi.fn();
  document.addEventListener('keydown', documentSpy);
  return { tools, documentSpy };
}

const press = (target: EventTarget, key: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('teclado en captura — línea interna', () => {
  it('con trazo vivo, el motor consume Escape y el evento no llega a document', () => {
    const { tools, documentSpy } = setup('internalShape');
    (tools.internalShapeTool.isTracing as unknown as Fn).mockReturnValue(true);
    (tools.internalShapeTool.handleKeyDown as unknown as Fn).mockReturnValue(true);
    press(document.body, 'Escape');
    expect(tools.internalShapeTool.handleKeyDown).toHaveBeenCalledTimes(1);
    expect(documentSpy).not.toHaveBeenCalled();
  });

  it('si el motor no consume, la tecla fluye al global', () => {
    const { tools, documentSpy } = setup('internalShape');
    (tools.internalShapeTool.isTracing as unknown as Fn).mockReturnValue(true);
    (tools.internalShapeTool.handleKeyDown as unknown as Fn).mockReturnValue(false);
    press(document.body, 'Escape');
    expect(documentSpy).toHaveBeenCalledTimes(1);
  });

  it('Retroceso con trazo vivo se consume: la pieza seleccionada no se borra por debajo', () => {
    const { tools, documentSpy } = setup('internalShape');
    (tools.internalShapeTool.isTracing as unknown as Fn).mockReturnValue(true);
    (tools.internalShapeTool.handleKeyDown as unknown as Fn).mockReturnValue(true);
    press(document.body, 'Backspace');
    expect(documentSpy).not.toHaveBeenCalled();
  });

  it('sin trazo vivo el motor ni se consulta', () => {
    const { tools, documentSpy } = setup('internalShape');
    (tools.internalShapeTool.isTracing as unknown as Fn).mockReturnValue(false);
    press(document.body, 'Escape');
    expect(tools.internalShapeTool.handleKeyDown).not.toHaveBeenCalled();
    expect(documentSpy).toHaveBeenCalledTimes(1);
  });

  it('una tecla que nace dentro de un campo editable pertenece al campo', () => {
    const { tools } = setup('internalShape');
    (tools.internalShapeTool.isTracing as unknown as Fn).mockReturnValue(true);
    const input = document.createElement('input');
    document.body.appendChild(input);
    press(input, 'Backspace');
    expect(tools.internalShapeTool.handleKeyDown).not.toHaveBeenCalled();
  });
});

describe('teclado en captura — pluma', () => {
  it('Enter consumido por la pluma no llega a document', () => {
    const { tools, documentSpy } = setup('pen');
    (tools.pen.handleKeyDown as unknown as Fn).mockReturnValue(true);
    press(document.body, 'Enter');
    expect(tools.pen.handleKeyDown).toHaveBeenCalledTimes(1);
    expect(documentSpy).not.toHaveBeenCalled();
  });

  it('una tecla que la pluma no consume sigue su camino', () => {
    const { tools, documentSpy } = setup('pen');
    (tools.pen.handleKeyDown as unknown as Fn).mockReturnValue(false);
    press(document.body, 'Escape');
    expect(documentSpy).toHaveBeenCalledTimes(1);
  });
});

describe('la bitácora ve cada tecla en la puerta', () => {
  it('registra la tecla y quién la consumió', () => {
    const { tools } = setup('internalShape');
    (tools.internalShapeTool.isTracing as unknown as Fn).mockReturnValue(true);
    (tools.internalShapeTool.handleKeyDown as unknown as Fn).mockReturnValue(true);
    press(document.body, 'Enter');
    expect(keysJournaled()).toEqual([
      expect.objectContaining({ data: { tool: 'internalShape', key: 'Enter', ctrl: false, shift: false, alt: false, consumedBy: 'internalShape' } }),
    ]);
  });

  it('una tecla que nadie consume queda con consumedBy null', () => {
    const { tools } = setup('pen');
    (tools.pen.handleKeyDown as unknown as Fn).mockReturnValue(false);
    press(document.body, 'Escape');
    expect(keysJournaled()[0].data).toMatchObject({ tool: 'pen', key: 'Escape', consumedBy: null });
  });

  it('una tecla nacida en un campo editable no se registra', () => {
    setup('select');
    const input = document.createElement('input');
    document.body.appendChild(input);
    press(input, 'Escape');
    expect(keysJournaled()).toHaveLength(0);
  });

  it('la repetición automática de una tecla sostenida no se registra', () => {
    setup('select');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true, bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(keysJournaled()).toHaveLength(1);
  });
});
