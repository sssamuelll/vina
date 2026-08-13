// @vitest-environment jsdom
/**
 * El panel habla en milímetros, pero el solver conserva fracciones de arco.
 * Estos casos fijan esa frontera para que la unidad visible no se filtre al
 * modelo ni convierta un borde degenerado en NaN.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addSeam } from '../../../store/projectSlice';
import editorReducer from '../../../store/editorSlice';
import SeamPropertiesPanel from '../SeamPropertiesPanel';
import type { Seam } from '../../../types/types';

afterEach(cleanup);

function makeSeam(overrides: Partial<Seam> = {}): Seam {
  return {
    id: 's1',
    pieceA: { pieceId: 'p1', edgeName: 'sideSeam' },
    pieceB: { pieceId: 'p2', edgeName: 'sideSeam' },
    type: 'standard',
    tension: 100,
    strength: 1.0,
    active: true,
    taped: false,
    tapeWidth: 10,
    ...overrides,
  };
}

function mount(seam: Seam, lengths: { a?: number; b?: number } = {}) {
  const store = configureStore({ reducer: { project: projectReducer, editor: editorReducer } });
  store.dispatch(addSeam(seam));
  render(
    <Provider store={store}>
      <SeamPropertiesPanel
        seam={seam}
        pieceAName="Front"
        pieceBName="Back"
        edgeALengthMm={lengths.a}
        edgeBLengthMm={lengths.b}
        collapsed={false}
        onToggle={() => {}}
      />
    </Provider>,
  );
  return store;
}

describe('SeamPropertiesPanel — rango cosido', () => {
  it('lee cada extremo en mm sobre el largo real de su borde', () => {
    mount(
      makeSeam({ pieceA: { pieceId: 'p1', edgeName: 'sideSeam', tStart: 0.125, tEnd: 0.75 } }),
      { a: 240 },
    );
    expect((screen.getByLabelText('Desde (mm) — Front') as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText('Hasta (mm) — Front') as HTMLInputElement).value).toBe('180');
  });

  it('escribir mm guarda el t equivalente y deja intacta la otra mitad', () => {
    const store = mount(makeSeam(), { a: 250, b: 400 });
    fireEvent.change(screen.getByLabelText('Desde (mm) — Front'), { target: { value: '37.5' } });
    const seam = store.getState().project.seams[0];
    expect(seam.pieceA.tStart).toBe(0.15);
    expect(seam.pieceA.tEnd).toBe(1);
    expect('tStart' in seam.pieceB).toBe(false);
  });

  it('convierte también el extremo final sin redondearlo a porcentaje entero', () => {
    const store = mount(makeSeam(), { a: 250 });
    fireEvent.change(screen.getByLabelText('Hasta (mm) — Front'), { target: { value: '188.75' } });
    const half = store.getState().project.seams[0].pieceA;
    expect(half.tStart).toBe(0);
    expect(half.tEnd).toBe(0.755);
  });

  it('el rango completo se sigue guardando como campos ausentes', () => {
    const store = mount(
      makeSeam({ pieceA: { pieceId: 'p1', edgeName: 'sideSeam', tStart: 0.3, tEnd: 1 } }),
      { a: 250 },
    );
    fireEvent.change(screen.getByLabelText('Desde (mm) — Front'), { target: { value: '0' } });
    const seam = store.getState().project.seams[0];
    expect('tStart' in seam.pieceA).toBe(false);
    expect('tEnd' in seam.pieceA).toBe(false);
  });

  it('conserva el mínimo previo de 1% cuando un extremo cruza al otro', () => {
    const store = mount(
      makeSeam({ pieceA: { pieceId: 'p1', edgeName: 'sideSeam', tStart: 0.2, tEnd: 0.5 } }),
      { a: 200 },
    );
    fireEvent.change(screen.getByLabelText('Desde (mm) — Front'), { target: { value: '160' } });
    const seam = store.getState().project.seams[0];
    expect(seam.pieceA.tStart).toBe(0.8);
    expect(seam.pieceA.tEnd).toBe(0.81);
  });

  it('muestra el largo cosido en mm y conserva la alerta de desajuste', () => {
    mount(
      makeSeam({ pieceB: { pieceId: 'p2', edgeName: 'sideSeam', tStart: 0, tEnd: 0.5 } }),
      { a: 400, b: 300 },
    );
    expect(screen.getByText('400 mm cosidos')).toBeTruthy();
    expect(screen.getByText('150 mm cosidos')).toBeTruthy();
    expect(screen.getByText(/Los largos cosidos difieren un 63%/)).toBeTruthy();
  });

  it('deshabilita los extremos cuando no conoce el largo del borde', () => {
    mount(makeSeam());
    const from = screen.getByLabelText('Desde (mm) — Front') as HTMLInputElement;
    const to = screen.getByLabelText('Hasta (mm) — Front') as HTMLInputElement;
    expect(from.disabled).toBe(true);
    expect(to.disabled).toBe(true);
    expect(from.value).toBe('');
    expect(to.value).toBe('');
    expect(screen.queryByText(/mm cosidos/)).toBeNull();
    expect(screen.queryByText(/Los largos cosidos difieren/)).toBeNull();
  });

  it('un borde de 0 mm no divide por cero ni escribe rangos inválidos', () => {
    const store = mount(makeSeam(), { a: 0 });
    const from = screen.getByLabelText('Desde (mm) — Front') as HTMLInputElement;
    expect(from.disabled).toBe(true);
    fireEvent.change(from, { target: { value: '1' } });
    const half = store.getState().project.seams[0].pieceA;
    expect('tStart' in half).toBe(false);
    expect('tEnd' in half).toBe(false);
  });
});
