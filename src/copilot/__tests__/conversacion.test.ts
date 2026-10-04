// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProviderResponse } from '../providers/types';

/**
 * La conversación vive fuera de la barra (spec 2026-10-02 § 6.2): se envía, el
 * agente trabaja con la barra cerrada, y la respuesta llega igual al store.
 * El proveedor es de mentira (ollama no pide clave). Entre tests se limpia por
 * el camino de verdad: las acciones del slice, y el aviso de `ConnectionsList`
 * que invalida la conexión y el loop. Recargar los módulos en cada test costaba
 * 2,7 s por test y, con la suite entera, pasaba de los 5 s.
 */
const estado = vi.hoisted(() => ({
  conConexion: true,
  responder: (async () => ({ content: 'Hola, María.', toolCalls: [] })) as () => Promise<ProviderResponse>,
}));

vi.mock('../connections/storage', () => ({
  loadConnectionsState: vi.fn(async () => ({})),
  getActiveConnection: vi.fn(() => (estado.conConexion ? { id: 'c1' } : null)),
}));
vi.mock('../connections/types', () => ({
  connectionToProviderConfig: vi.fn(() => ({ provider: 'ollama', apiKey: '', model: 'de-mentira' })),
}));
vi.mock('../providers/ollama', () => ({
  ollamaProvider: { send: vi.fn(() => estado.responder()) },
}));

import { store } from '../../store';
import * as conv from '../conversacion';
import * as ia from '../../store/iaSlice';

async function cargar() {
  return { store, ...conv, ...ia };
}

beforeEach(() => {
  estado.conConexion = true;
  estado.responder = async () => ({ content: 'Hola, María.', toolCalls: [] });
  store.dispatch(ia.terminarTurno());
  store.dispatch(ia.olvidarConversacion());
  store.dispatch(ia.ocultarIA());
  window.dispatchEvent(new CustomEvent('vina:provider-config-changed'));
});

describe('la conversación', () => {
  it('lo que se envía y lo que responde la IA quedan en el store', async () => {
    const { store, enviar } = await cargar();
    await enviar('hola');
    expect(store.getState().ia.mensajes.map((m) => [m.role, m.content])).toEqual([['user', 'hola'], ['assistant', 'Hola, María.']]);
    expect(store.getState().ia.trabajando).toBe(false);
  });

  it('con la barra oculta el agente sigue: la respuesta llega igual', async () => {
    let soltar!: (r: ProviderResponse) => void;
    estado.responder = () => new Promise((r) => { soltar = r; });
    const { store, enviar, abrirIA, ocultarIA } = await cargar();
    store.dispatch(abrirIA());
    const enviando = enviar('acorta el escote');
    await vi.waitFor(() => expect(store.getState().ia.trabajando).toBe(true));
    store.dispatch(ocultarIA());
    await vi.waitFor(() => expect(soltar).toBeTypeOf('function'));
    soltar({ content: 'Acorté el escote.', toolCalls: [] });
    await enviando;
    expect(store.getState().ia.mensajes.at(-1)?.content).toBe('Acorté el escote.');
    expect(store.getState().ia).toMatchObject({ abierta: false, trabajando: false });
  });

  it('detener: lo que estaba en camino no se ejecuta y la conversación lo dice', async () => {
    let soltar!: (r: ProviderResponse) => void;
    estado.responder = () => new Promise((r) => { soltar = r; });
    const { store, enviar, detener } = await cargar();
    const { RESPUESTA_DETENIDA } = await import('../reasoning/bridge/AgenticLoop');
    const enviando = enviar('acorta el escote');
    await vi.waitFor(() => expect(soltar).toBeTypeOf('function'));
    detener();
    soltar({ content: '', toolCalls: [{ id: 't1', name: 'getGarmentState', arguments: '{}' }] });
    await enviando;
    expect(store.getState().ia.mensajes.at(-1)?.content).toBe(RESPUESTA_DETENIDA);
    expect(store.getState().ia.mensajes.at(-1)?.toolCalls ?? []).toEqual([]);
  });

  it('sin conexión, la respuesta dice dónde se agrega', async () => {
    estado.conConexion = false;
    const { store, enviar, SIN_CONEXION } = await cargar();
    await enviar('hola');
    expect(store.getState().ia.mensajes.at(-1)).toMatchObject({ role: 'assistant', content: SIN_CONEXION });
  });

  it('los pasos del agente llegan sin su resultado: el store no guarda funciones', async () => {
    let vuelta = 0;
    estado.responder = async () => {
      vuelta += 1;
      return vuelta === 1
        ? { content: 'Miro la prenda.', toolCalls: [{ id: 't1', name: 'getGarmentState', arguments: '{}' }] }
        : { content: 'Hecho.', toolCalls: [] };
    };
    const { store, enviar } = await cargar();
    await enviar('mira la prenda');
    const pasos = store.getState().ia.mensajes.at(-1)?.toolCalls ?? [];
    // Que el caso se ejerza: la herramienta terminó, así que traía un resultado.
    expect(pasos.some((p) => p.name === 'getGarmentState' && p.status === 'done')).toBe(true);
    for (const p of pasos) expect(p).not.toHaveProperty('result');
    expect(pasos[0].reason).toBe('Miro la prenda.');
  });
});
