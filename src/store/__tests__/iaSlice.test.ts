import { describe, it, expect } from 'vitest';
import reducer, { abrirIA, ocultarIA, agregarMensaje, empezarTurno, progresoDelTurno, terminarTurno, olvidarConversacion } from '../iaSlice';

/**
 * La IA convocada (spec 2026-10-02 § 6.2): no existe en reposo, y cerrar la
 * barra no pierde la conversación ni corta al agente. Por eso todo vive aquí y
 * no en el componente.
 */
const inicial = reducer(undefined, { type: '@@init' });

describe('iaSlice', () => {
  it('en reposo, cerrada y sin conversación', () => {
    expect(inicial).toEqual({ abierta: false, modoDeApertura: 'conversacion', aperturas: 0, mensajes: [], trabajando: false, enCurso: [] });
  });

  it('abrir dice con qué se abrió y cuenta la apertura; ocultar no borra nada', () => {
    let s = reducer(inicial, abrirIA('comandos'));
    expect(s).toMatchObject({ abierta: true, modoDeApertura: 'comandos', aperturas: 1 });
    s = reducer(s, agregarMensaje({ id: 'm1', role: 'user', content: 'hola' }));
    s = reducer(s, ocultarIA());
    expect(s.abierta).toBe(false);
    expect(s.mensajes).toHaveLength(1);
    s = reducer(s, abrirIA());
    expect(s).toMatchObject({ abierta: true, modoDeApertura: 'conversacion', aperturas: 2 });
  });

  it('un turno: trabajando con sus pasos en vivo, y al terminar se limpian', () => {
    let s = reducer(inicial, empezarTurno());
    expect(s.trabajando).toBe(true);
    s = reducer(s, progresoDelTurno([{ name: 'leerPieza', status: 'running' }]));
    expect(s.enCurso).toEqual([{ name: 'leerPieza', status: 'running' }]);
    s = reducer(s, terminarTurno());
    expect(s).toMatchObject({ trabajando: false, enCurso: [] });
  });

  it('olvidar la conversación deja la barra como estaba', () => {
    let s = reducer(reducer(inicial, abrirIA()), agregarMensaje({ id: 'm1', role: 'user', content: 'hola' }));
    s = reducer(s, olvidarConversacion());
    expect(s).toMatchObject({ abierta: true, mensajes: [], enCurso: [] });
  });
});
