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
  it('shows the edge name and the effective width (inherited)', () => {
    mount(<EdgePropertiesSection items={[{ pieceId: 'p', edgeId: 'p:hem' }]} />, piece());
    expect(screen.getByText(/hem/i)).toBeTruthy();
    expect((screen.getByLabelText(/ancho/i) as HTMLInputElement).value).toBe('10');
  });

  it('commits a per-edge width on Enter', () => {
    const store = mount(<EdgePropertiesSection items={[{ pieceId: 'p', edgeId: 'p:hem' }]} />, piece());
    const input = screen.getByLabelText(/ancho/i);
    fireEvent.change(input, { target: { value: '40' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const e = store.getState().project.pieces[0].edges!.find(x => x.id === 'p:hem')!;
    expect(e.seamAllowanceWidth).toBe(40);
  });

  it('Inherit clears the per-edge override', () => {
    const store = mount(<EdgePropertiesSection items={[{ pieceId: 'p', edgeId: 'p:hem' }]} />, piece({ edges: [{ ...hem, seamAllowanceWidth: 40 }] }));
    fireEvent.click(screen.getByRole('button', { name: /heredar/i }));
    const e = store.getState().project.pieces[0].edges!.find(x => x.id === 'p:hem')!;
    expect(e.seamAllowanceWidth).toBeUndefined();
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
    const input = screen.getByLabelText(/ancho/i) as HTMLInputElement;
    expect(input.value).toBe('');                       // divergent → Varios (empty)
    expect(input.placeholder).toBe('Varios');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const edges = store.getState().project.pieces[0].edges!;
    expect(edges.find(x => x.id === 'p:hem')!.seamAllowanceWidth).toBe(12);
    expect(edges.find(x => x.id === 'p:side')!.seamAllowanceWidth).toBe(12);
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
    expect((screen.getByLabelText(/ancho/i) as HTMLInputElement).value).toBe('40');

    act(() => { store.dispatch(selectSaEdges({ items: [{ pieceId: 'p', edgeId: 'p:side' }] })); });
    expect((screen.getByLabelText(/ancho/i) as HTMLInputElement).value).toBe('10');
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
});
