/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tools } from '../action/tools/definitions/memoryTools';
import * as memory from '../memory';
import { DesignLogManager } from '../perception/designLog';
import { resolveCallback, rejectCallback, _resetCallbacksForTest } from '../../hooks/useGuardedAction';

/**
 * Security study #4: clearProjectMemory / clearDesignLog are NOT undoable
 * (no Ctrl+Z), yet the agent can invoke them. They must ask before wiping.
 *
 * Actualizado 2026-08-14: antes esto se apoyaba en `window.confirm` y el test
 * lo espiaba. El nativo se fue —el navegador puede desactivarlo, y entonces
 * `confirm()` devuelve `false` sin preguntar, lo que convertía el borrado en un
 * no-op silencioso— y ahora la pregunta va por `pendingConfirmation`, la
 * superficie que `ConfirmDialog` pinta.
 *
 * Lo que el test protege NO cambió: sin un sí explícito no se borra nada, y con
 * un sí se borra. Lo único que cambia es por dónde llega ese sí. Se agrega
 * además el caso que el mecanismo viejo no podía cubrir: que la pregunta se
 * haga de verdad, con título y etiqueta de acción.
 */

const clearMem = tools.find((t) => t.name === 'clearProjectMemory')!;
const clearLog = tools.find((t) => t.name === 'clearDesignLog')!;
const getState = () => ({ project: { id: 'p1' } }) as never;

/** Dispatch que captura la confirmación y deja responderla como la usuaria. */
function dispatchQueResponde(respuesta: boolean) {
  const vistas: Array<Record<string, unknown>> = [];
  const dispatch = ((accion: { type: string; payload?: Record<string, unknown> }) => {
    if (accion?.type === 'copilotUI/showConfirmation' && accion.payload) {
      vistas.push(accion.payload);
      const key = accion.payload.callbackKey as string;
      // Responder en un microtask, como haría un clic real: el `execute` está
      // esperando la promesa cuando esto ocurre.
      queueMicrotask(() => {
        if (respuesta) resolveCallback(key)?.();
        else rejectCallback(key);
      });
    }
    return accion;
  }) as never;
  return { dispatch, vistas };
}

beforeEach(() => _resetCallbacksForTest());
afterEach(() => vi.restoreAllMocks());

describe('irreversible memory-clear tools require confirmation (#4)', () => {
  it('clearProjectMemory does NOT clear when the user cancels', async () => {
    const { dispatch, vistas } = dispatchQueResponde(false);
    const clear = vi.spyOn(memory, 'clearLongTermMemory').mockResolvedValue(undefined as never);
    const res = (await clearMem.execute({}, dispatch, getState)) as { success: boolean };
    expect(vistas).toHaveLength(1);
    expect(clear).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
  });

  it('clearProjectMemory clears when the user confirms', async () => {
    const { dispatch } = dispatchQueResponde(true);
    const clear = vi.spyOn(memory, 'clearLongTermMemory').mockResolvedValue(undefined as never);
    const res = (await clearMem.execute({}, dispatch, getState)) as { success: boolean };
    expect(clear).toHaveBeenCalledWith('p1');
    expect(res.success).toBe(true);
  });

  it('clearDesignLog does NOT clear when the user cancels', async () => {
    const { dispatch } = dispatchQueResponde(false);
    const clear = vi.spyOn(DesignLogManager, 'clear').mockImplementation(() => {});
    const res = (await clearLog.execute({}, dispatch, getState)) as { success: boolean };
    expect(clear).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
  });

  it('clearDesignLog clears when the user confirms', async () => {
    const { dispatch } = dispatchQueResponde(true);
    const clear = vi.spyOn(DesignLogManager, 'clear').mockImplementation(() => {});
    const res = (await clearLog.execute({}, dispatch, getState)) as { success: boolean };
    expect(clear).toHaveBeenCalledWith('p1');
    expect(res.success).toBe(true);
  });

  it('la pregunta que se hace nombra lo que se pierde y lo que hace el botón', () => {
    // El mecanismo viejo (window.confirm con un string) no permitía verificar
    // esto: el botón decía "Aceptar" y nada más.
    const { dispatch, vistas } = dispatchQueResponde(false);
    vi.spyOn(memory, 'clearLongTermMemory').mockResolvedValue(undefined as never);
    void clearMem.execute({}, dispatch, getState);
    expect(vistas[0].title).toMatch(/memoria/i);
    expect(vistas[0].destructive).toBe(true);
    // El botón nombra el resultado, no dice "Aceptar".
    expect(String(vistas[0].confirmLabel)).toMatch(/borrar/i);
    expect(vistas[0].consequences).toContain('No se puede deshacer');
  });

  it('sin dispatch (contexto no-navegador) procede, como antes', async () => {
    const clear = vi.spyOn(memory, 'clearLongTermMemory').mockResolvedValue(undefined as never);
    const res = (await clearMem.execute({}, undefined as never, getState)) as { success: boolean };
    expect(clear).toHaveBeenCalledWith('p1');
    expect(res.success).toBe(true);
  });
});
