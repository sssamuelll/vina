// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { setup, mouseAt } from './editPatternHarness';

/**
 * #1122 — la selección de Editar patrón sobrevive por índice a un cambio de
 * longitud del contorno y pasa a denotar OTRA geometría.
 *
 * `dispatchAndRefresh` reemplaza solo `nodes`. Si el verbo insertó comandos,
 * `selectedNodes` sigue guardando el número de antes — y ese número ahora
 * apunta a otro punto. Un Supr en ese momento borra la esquina equivocada.
 *
 * La pieza que hace falta ya la nombra el issue: seleccionar el `M[0]` y
 * convertir el CIERRE en curva crea el grupo coincidente `[0,4]`, y el Supr
 * sobre `{0}` borra solo el `M`, promueve el `L` siguiente y deja la esquina
 * duplicada viva en el `C`. O sea la borra A MEDIAS, que es peor que no
 * borrarla: el contorno queda con una púa que nadie pidió.
 *
 * Dos precisiones que el reconocimiento le hizo al issue, y que este test
 * respeta para no medir lo que no es:
 *
 * - `convertToLine` NUNCA cambia la longitud (reemplaza en el sitio), y
 *   `convertToCurve` solo la cambia cuando el objetivo es el cierre. Un test
 *   que convirtiera un lado cualquiera daría verde vacío.
 * - Arrastrar tampoco la cambia, y hay un test verde que EXIGE que la
 *   selección sobreviva a un arrastre. La limpieza va con guarda de longitud,
 *   nunca en cada llamada.
 */

const CUADRADO: PatternPiece = {
  id: 'p1',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 200] },
    { type: 'L', values: [0, 200] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

describe('#1122 — un índice que sobrevive denota otra geometría', () => {
  it('convertir el cierre en curva suelta la selección que ya no significa lo mismo', () => {
    const { ref } = setup(CUADRADO);

    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 0, y: 0 })); });
    expect([...ref.current!.selectedNodes]).toEqual([0]);

    // El cierre es el comando 4. Convertirlo en curva INSERTA una C, así que
    // todo lo que venía después corre un puesto.
    act(() => { ref.current!.convertSegment(4, true); });

    expect(ref.current!.selectedNodes.size).toBe(0);
  });

  it('y por eso un Supr justo después no parte la esquina por la mitad', () => {
    const { ref, store } = setup(CUADRADO);

    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 0, y: 0 })); });
    act(() => { ref.current!.convertSegment(4, true); });

    const antes = store.getState().project.pieces[0].outline.length;
    act(() => {
      ref.current!.handleKeyDown(new KeyboardEvent('keydown', { key: 'Delete' }));
    });

    // Sin selección viva, Supr no tiene sujeto y no toca nada. Lo que no puede
    // pasar —y pasaba— es el resultado intermedio: un comando menos y la
    // esquina partida en dos.
    expect(store.getState().project.pieces[0].outline.length).toBe(antes);
  });

  it('el hover tampoco puede sobrevivir a un cambio de longitud', () => {
    const { ref } = setup(CUADRADO);

    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 200, y: 0 })); });
    expect(ref.current!.hoveredNode).not.toBeNull();

    act(() => { ref.current!.convertSegment(4, true); });

    expect(ref.current!.hoveredNode).toBeNull();
  });

  it('control: arrastrar NO cambia la longitud, así que la selección sigue viva', () => {
    const { ref } = setup(CUADRADO);

    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 200, y: 0 })); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 210, y: 0 })); });
    act(() => { ref.current!.handleMouseUp(); });

    expect([...ref.current!.selectedNodes]).toEqual([1]);
  });
});
