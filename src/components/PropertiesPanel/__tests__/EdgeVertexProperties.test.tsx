// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece } from '../../../store/projectSlice';
import editorReducer, { selectSaEdges } from '../../../store/editorSlice';
import EdgePropertiesSection from '../EdgePropertiesSection';
import VertexPropertiesSection from '../VertexPropertiesSection';
import PropertiesPanel from '../PropertiesPanel';
import type { PatternPiece, SemanticEdge } from '../../../types/types';

afterEach(cleanup);

const square = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
] as PatternPiece['outline'];

const hem: SemanticEdge = { id: 'p:hem', name: 'hem', segmentRange: [3, 4], edgeType: 'hem' };

function piece(over: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'p', name: 'Front', outline: square, position: { x: 0, y: 0 }, rotation: 0,
    mirrored: false, active: true, seamAllowance: 10, internals: [], edges: [hem], ...over,
  } as unknown as PatternPiece;
}

function mount(node: React.ReactElement, p: PatternPiece) {
  const store = configureStore({ reducer: { project: projectReducer, editor: editorReducer } });
  store.dispatch(addPiece(p));
  render(<Provider store={store}>{node}</Provider>);
  return store;
}

describe('EdgePropertiesSection', () => {
  it('un borde sin tramos enseña el panel de hoy, sin filas nuevas', () => {
    mount(<EdgePropertiesSection items={[{ pieceId: 'p', edgeId: 'p:hem' }]} />, piece());

    expect(screen.queryByText('Tramos del margen')).toBeNull();
    expect((screen.getByLabelText('Margen (mm)') as HTMLInputElement).value).toBe('10');
  });

  it('shows the edge name and the effective width (inherited)', () => {
    mount(<EdgePropertiesSection items={[{ pieceId: 'p', edgeId: 'p:hem' }]} />, piece());
    expect(screen.getByText(/hem/i)).toBeTruthy();
    expect((screen.getByLabelText(/margen/i) as HTMLInputElement).value).toBe('10');
  });

  it('commits a per-edge width on Enter', () => {
    const store = mount(<EdgePropertiesSection items={[{ pieceId: 'p', edgeId: 'p:hem' }]} />, piece());
    const input = screen.getByLabelText(/margen/i);
    fireEvent.change(input, { target: { value: '40' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const e = store.getState().project.pieces[0].edges!.find(x => x.id === 'p:hem')!;
    expect(e.seamAllowanceWidth).toBe(40);
  });

  it('Inherit clears the per-edge override', () => {
    const store = mount(<EdgePropertiesSection items={[{ pieceId: 'p', edgeId: 'p:hem' }]} />, piece({ edges: [{ ...hem, seamAllowanceWidth: 40 }] }));
    fireEvent.click(screen.getByRole('button', { name: /usar el de la pieza/i }));
    const e = store.getState().project.pieces[0].edges!.find(x => x.id === 'p:hem')!;
    expect(e.seamAllowanceWidth).toBeUndefined();
  });

  it('revisión #1106: "Sin margen (0)" escribe 0 explícito, sin importar si ya había override', () => {
    const store = mount(<EdgePropertiesSection items={[{ pieceId: 'p', edgeId: 'p:hem' }]} />, piece({ edges: [{ ...hem, seamAllowanceWidth: 40 }] }));
    fireEvent.click(screen.getByRole('button', { name: /sin margen/i }));
    const e = store.getState().project.pieces[0].edges!.find(x => x.id === 'p:hem')!;
    expect(e.seamAllowanceWidth).toBe(0);
  });

  it('multi-edge: divergent widths show Mixed; commit writes the same width to all', () => {
    const twoEdges: SemanticEdge[] = [
      { id: 'p:hem', name: 'hem', segmentRange: [3, 4], edgeType: 'hem', seamAllowanceWidth: 40 },
      { id: 'p:side', name: 'side', segmentRange: [2, 3], edgeType: 'seam', seamAllowanceWidth: 10 },
    ];
    const store = mount(
      <EdgePropertiesSection items={[{ pieceId: 'p', edgeId: 'p:hem' }, { pieceId: 'p', edgeId: 'p:side' }]} />,
      piece({ edges: twoEdges }),
    );
    expect(screen.getByText('2 bordes')).toBeTruthy();
    const input = screen.getByLabelText(/margen/i) as HTMLInputElement;
    expect(input.value).toBe('');                       // divergent → Varios (empty)
    expect(input.placeholder).toBe('Varios');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const edges = store.getState().project.pieces[0].edges!;
    expect(edges.find(x => x.id === 'p:hem')!.seamAllowanceWidth).toBe(12);
    expect(edges.find(x => x.id === 'p:side')!.seamAllowanceWidth).toBe(12);
  });

  it('un borde con tramos enseña una fila por tramo y el ancho heredado', () => {
    const edgeWithSpans: SemanticEdge = {
      ...hem,
      seamAllowanceSpans: [
        { tStart: 0.1, tEnd: 0.3, width: 8 },
        { tStart: 0.5, tEnd: 0.8, width: 14 },
      ],
    };
    mount(
      <EdgePropertiesSection items={[{ pieceId: 'p', edgeId: 'p:hem' }]} />,
      piece({ edges: [edgeWithSpans] }),
    );

    expect(screen.getByText('Tramos del margen')).toBeTruthy();
    expect(screen.getByText('Tramo 1')).toBeTruthy();
    expect(screen.getByText('Tramo 2')).toBeTruthy();
    expect((screen.getByLabelText('Margen fuera de los tramos (mm)') as HTMLInputElement).value).toBe('10');
  });

  it('editar el ancho de un tramo despacha solo ese tramo', () => {
    const edgeWithSpans: SemanticEdge = {
      ...hem,
      seamAllowanceSpans: [
        { tStart: 0.1, tEnd: 0.3, width: 8 },
        { tStart: 0.5, tEnd: 0.8, width: 14 },
      ],
    };
    const store = mount(
      <EdgePropertiesSection items={[{ pieceId: 'p', edgeId: 'p:hem' }]} />,
      piece({ edges: [edgeWithSpans] }),
    );

    const widths = screen.getAllByLabelText('Margen (mm)');
    fireEvent.change(widths[1], { target: { value: '18' } });
    fireEvent.blur(widths[1]);

    expect(store.getState().project.pieces[0].edges?.[0].seamAllowanceSpans).toEqual([
      { tStart: 0.1, tEnd: 0.3, width: 8 },
      { tStart: 0.5, tEnd: 0.8, width: 18 },
    ]);
  });

  it('eliminar un tramo devuelve esa zona a heredar', () => {
    const edgeWithSpans: SemanticEdge = {
      ...hem,
      seamAllowanceSpans: [
        { tStart: 0.1, tEnd: 0.3, width: 8 },
        { tStart: 0.5, tEnd: 0.8, width: 14 },
      ],
    };
    const store = mount(
      <EdgePropertiesSection items={[{ pieceId: 'p', edgeId: 'p:hem' }]} />,
      piece({ edges: [edgeWithSpans] }),
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar tramo' })[0]);

    expect(store.getState().project.pieces[0].edges?.[0].seamAllowanceSpans).toEqual([
      { tStart: 0.5, tEnd: 0.8, width: 14 },
    ]);
  });

  it('los extremos se leen y se editan en mm de arco, no en fracción', () => {
    const edgeWithSpan: SemanticEdge = {
      ...hem,
      // El borde recto mide 100 mm: 0,25–0,75 son exactamente 25–75 mm.
      seamAllowanceSpans: [{ tStart: 0.25, tEnd: 0.75, width: 12 }],
    };
    const store = mount(
      <EdgePropertiesSection items={[{ pieceId: 'p', edgeId: 'p:hem' }]} />,
      piece({ edges: [edgeWithSpan] }),
    );

    const from = screen.getByLabelText('Desde (mm)') as HTMLInputElement;
    const to = screen.getByLabelText('Hasta (mm)') as HTMLInputElement;
    expect(from.value).toBe('25');
    expect(to.value).toBe('75');

    fireEvent.change(from, { target: { value: '20' } });
    fireEvent.blur(from);
    const nextTo = screen.getByLabelText('Hasta (mm)');
    fireEvent.change(nextTo, { target: { value: '90' } });
    fireEvent.blur(nextTo);

    expect(store.getState().project.pieces[0].edges?.[0].seamAllowanceSpans).toEqual([
      { tStart: 0.2, tEnd: 0.9, width: 12 },
    ]);
  });
});

describe('PropertiesPanel edge switching', () => {
  it('the width field reflects the newly selected edge (no stale value)', () => {
    const store = configureStore({ reducer: { project: projectReducer, editor: editorReducer } });
    const twoEdges: SemanticEdge[] = [
      { id: 'p:hem', name: 'hem', segmentRange: [3, 4], edgeType: 'hem', seamAllowanceWidth: 40 },
      { id: 'p:side', name: 'side', segmentRange: [2, 3], edgeType: 'seam', seamAllowanceWidth: 10 },
    ];
    store.dispatch(addPiece(piece({ edges: twoEdges })));
    render(<Provider store={store}><PropertiesPanel /></Provider>);

    act(() => { store.dispatch(selectSaEdges({ items: [{ pieceId: 'p', edgeId: 'p:hem' }] })); });
    expect((screen.getByLabelText(/margen/i) as HTMLInputElement).value).toBe('40');

    act(() => { store.dispatch(selectSaEdges({ items: [{ pieceId: 'p', edgeId: 'p:side' }] })); });
    expect((screen.getByLabelText(/margen/i) as HTMLInputElement).value).toBe('10');
  });
});

describe('VertexPropertiesSection', () => {
  it('lists corner types and applies the chosen one to the vertex', () => {
    const store = mount(<VertexPropertiesSection pieceId="p" vertexIndex={2} />, piece());
    fireEvent.click(screen.getByRole('button', { name: /^cuadrada$/i }));
    expect(store.getState().project.pieces[0].cornerTypes?.[2]).toBe('squared');
  });

  it('can apply a corner type to all corners (default)', () => {
    const store = mount(<VertexPropertiesSection pieceId="p" vertexIndex={2} />, piece());
    fireEvent.click(screen.getByRole('button', { name: /cuadrada/i }));
    fireEvent.click(screen.getByRole('button', { name: /todas las esquinas/i }));
    expect(store.getState().project.pieces[0].defaultCornerType).toBe('squared');
  });

  it('enables the Empatada chip and applies match to the vertex', () => {
    const store = mount(<VertexPropertiesSection pieceId="p" vertexIndex={2} />, piece());
    const chip = screen.getByRole('button', { name: /empatada/i }) as HTMLButtonElement;
    expect(chip.disabled).toBe(false);
    fireEvent.click(chip);
    expect(store.getState().project.pieces[0].cornerTypes?.[2]).toBe('match');
  });

  // Revisión #1098 (María audio 30-08): el panel pintaba "Inglete" como
  // elegido cuando en realidad nadie había tocado nada — era el fallback
  // `?? 'mitered'` colapsado con una elección real.
  it('#1098 — sin elección explícita, ningún chip se pinta activo y aparece de qué se aplica por defecto', () => {
    mount(<VertexPropertiesSection pieceId="p" vertexIndex={2} />, piece());
    const inglete = screen.getByRole('button', { name: /^inglete$/i }) as HTMLButtonElement;
    expect(inglete.className).not.toMatch(/panel-chip-btn--active/);
    expect(screen.getByText(/por defecto/i).textContent).toMatch(/inglete/i);
  });

  it('#1098 — con un tipo elegido para toda la pieza, su chip se pinta activo y no hay aviso de "por defecto"', () => {
    mount(<VertexPropertiesSection pieceId="p" vertexIndex={2} />, piece({ defaultCornerType: 'squared' }));
    const chip = screen.getByRole('button', { name: /^cuadrada$/i }) as HTMLButtonElement;
    expect(chip.className).toMatch(/panel-chip-btn--active/);
    expect(screen.queryByText(/por defecto/i)).toBeNull();
  });

  it('#1098 — con un override por vértice, ese chip se pinta activo aunque el default de la pieza sea otro', () => {
    mount(<VertexPropertiesSection pieceId="p" vertexIndex={2} />, piece({ defaultCornerType: 'squared', cornerTypes: { 2: 'match' } }));
    const chip = screen.getByRole('button', { name: /^empatada$/i }) as HTMLButtonElement;
    expect(chip.className).toMatch(/panel-chip-btn--active/);
    expect(screen.queryByText(/por defecto/i)).toBeNull();
  });
});
