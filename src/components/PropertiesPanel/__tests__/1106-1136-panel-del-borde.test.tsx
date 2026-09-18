// @vitest-environment jsdom
/**
 * Dos frentes que caen en el mismo archivo:
 *
 * #1106 punto 5 — «El panel de borde no enseña ids ni nombres de objeto;
 * enseña "Borde 3 · margen 20 mm"». Hasta hoy titulaba `Borde · armhole`: el
 * nombre técnico del borde semántico, en inglés y sin traducir.
 *
 * #1136 — el panel es la SEGUNDA puerta de escritura del margen (la primera es
 * el gesto en el lienzo). Escribir 33 + Enter aquí llegaba a `setEdgesSeamAllowance`
 * aunque la pieza tuviera candado.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece, setLayerLocked } from '../../../store/projectSlice';
import editorReducer from '../../../store/editorSlice';
import EdgePropertiesSection from '../EdgePropertiesSection';
import type { PatternPiece, SemanticEdge } from '../../../types/types';

afterEach(cleanup);

const square = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
] as PatternPiece['outline'];

const top: SemanticEdge = { id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam' };
const armhole: SemanticEdge = { id: 'p:armhole', name: 'armhole', segmentRange: [2, 3], edgeType: 'seam' };
const hem: SemanticEdge = { id: 'p:hem', name: 'hem', segmentRange: [3, 4], edgeType: 'hem' };

function piece(over: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'p', name: 'Front', outline: square, position: { x: 0, y: 0 }, rotation: 0,
    mirrored: false, active: true, seamAllowance: 10, internals: [],
    edges: [top, armhole, hem], ...over,
  } as unknown as PatternPiece;
}

function mount(p: PatternPiece, items: { pieceId: string; edgeId: string }[], capaBloqueada?: number) {
  const store = configureStore({ reducer: { project: projectReducer, editor: editorReducer } });
  store.dispatch(addPiece(p));
  if (capaBloqueada != null) store.dispatch(setLayerLocked({ layer: capaBloqueada, locked: true }));
  render(<Provider store={store}><EdgePropertiesSection items={items} /></Provider>);
  return store;
}

describe('#1106 — el panel del borde no enseña nombres de objeto', () => {
  it('el título dice qué borde es por número y cuánto margen tiene', () => {
    mount(piece(), [{ pieceId: 'p', edgeId: 'p:armhole' }]);
    // Segundo de la lista de bordes → «Borde 2».
    expect(screen.getByText('Borde 2 · margen 10 mm')).toBeTruthy();
  });

  it('no queda ni rastro del nombre técnico en inglés', () => {
    mount(piece(), [{ pieceId: 'p', edgeId: 'p:armhole' }]);
    expect(screen.queryByText(/armhole/i)).toBeNull();
  });

  it('el margen del título usa coma, como el resto de la interfaz', () => {
    mount(piece({ seamAllowance: 9.5 }), [{ pieceId: 'p', edgeId: 'p:top' }]);
    expect(screen.getByText('Borde 1 · margen 9,5 mm')).toBeTruthy();
  });

  it('con varios bordes sigue diciendo cuántos son', () => {
    mount(piece(), [{ pieceId: 'p', edgeId: 'p:top' }, { pieceId: 'p', edgeId: 'p:hem' }]);
    expect(screen.getByText('2 bordes')).toBeTruthy();
  });
});

describe('#1136 — el panel tampoco escribe en una pieza bloqueada', () => {
  it('el campo del margen no se puede escribir con la pieza bloqueada', () => {
    mount(piece({ locked: true }), [{ pieceId: 'p', edgeId: 'p:top' }]);
    expect((screen.getByLabelText(/margen/i) as HTMLInputElement).disabled).toBe(true);
  });

  it('el candado de la capa pesa igual', () => {
    mount(piece({ layer: 4 }), [{ pieceId: 'p', edgeId: 'p:top' }], 4);
    expect((screen.getByLabelText(/margen/i) as HTMLInputElement).disabled).toBe(true);
  });

  it('los dos chips que también escriben quedan apagados', () => {
    mount(piece({ locked: true }), [{ pieceId: 'p', edgeId: 'p:top' }]);
    expect((screen.getByText('Sin margen') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText(/Usar el de la pieza/) as HTMLButtonElement).disabled).toBe(true);
  });

  it('el panel dice por qué, no se apaga en silencio', () => {
    mount(piece({ locked: true }), [{ pieceId: 'p', edgeId: 'p:top' }]);
    expect(screen.getByText(/bloqueada/i)).toBeTruthy();
  });

  it('escribir y pulsar Enter sobre una pieza bloqueada no cambia el margen', () => {
    const store = mount(piece({ locked: true }), [{ pieceId: 'p', edgeId: 'p:top' }]);
    const input = screen.getByLabelText(/margen/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '33' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const edge = store.getState().project.pieces[0].edges?.find(e => e.id === 'p:top');
    expect(edge?.seamAllowanceWidth).toBeUndefined();
  });

  it('CONTROL: sin candado, escribir 33 sí cambia el margen', () => {
    const store = mount(piece(), [{ pieceId: 'p', edgeId: 'p:top' }]);
    const input = screen.getByLabelText(/margen/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '33' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const edge = store.getState().project.pieces[0].edges?.find(e => e.id === 'p:top');
    expect(edge?.seamAllowanceWidth).toBe(33);
  });
});

/**
 * #1143 — los tramos de margen del LADO DE CIERRE.
 *
 * El panel prefiere el `length` que el borde trae guardado y solo mide cuando
 * no lo hay — y el esquema lo declara opcional, así que un proyecto guardado
 * sin él es legal. Cuando toca medir, medía el `segmentRange` crudo: el tramo
 * de cierre se rotula con el índice de la `M`, que no dibuja, así que salía 0,
 * y con 0 las casillas «Desde/Hasta» nacen DESHABILITADAS. La usuaria ve un
 * tramo de margen que no puede tocar, sin una palabra que lo explique.
 */
describe('#1143 — el tramo de margen del lado de cierre se puede editar', () => {
  // Sin `length`, como los demás bordes de este archivo, y con el rango que
  // apunta a la `M`: es el lado izquierdo del cuadrado, 100 mm.
  const cierre: SemanticEdge = {
    id: 'p:cierre', name: 'cierre', segmentRange: [0, 1], edgeType: 'seam',
    seamAllowanceSpans: [{ tStart: 0, tEnd: 0.5, width: 12 }],
  };

  it('las casillas del tramo no nacen apagadas', () => {
    mount(piece({ edges: [top, armhole, hem, cierre] }), [{ pieceId: 'p', edgeId: 'p:cierre' }]);
    const desde = screen.getByLabelText(/Desde \(mm\)/i) as HTMLInputElement;
    expect(desde.disabled, 'el tramo del lado de cierre sale muerto y sin explicación').toBe(false);
  });

  it('y enseñan los milímetros del lado, no cero', () => {
    mount(piece({ edges: [top, armhole, hem, cierre] }), [{ pieceId: 'p', edgeId: 'p:cierre' }]);
    const hasta = screen.getByLabelText(/Hasta \(mm\)/i) as HTMLInputElement;
    expect(Number(hasta.value), 'medio lado de 100 mm son 50').toBeCloseTo(50, 1);
  });
});
