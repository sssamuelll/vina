// @vitest-environment jsdom
/**
 * #1115 — el contrato P1 de `useEditPattern`, al nivel del gancho.
 *
 * El e2e hermano (`tests/e2e/supr-borra-lo-que-se-ve.spec.ts`) mide el DUELO:
 * quién gana la tecla entre el atajo global y el dueño local. Eso no se puede
 * probar aquí, porque jsdom no reproduce el orden real de los oyentes y el
 * duelo ES el orden.
 *
 * Lo que sí se fija aquí es la otra mitad, y es la que se rompe de un tecleo:
 * **qué devuelve el gancho**. De ese booleano cuelga todo lo demás — el router
 * solo hace `stopPropagation` cuando es `true`, así que un `false` de más
 * entrega la tecla al global y desaparece la pieza.
 *
 * Las tres reglas, en tres frases:
 *
 *   · Sin sujeto local devuelve `false` y la tecla sigue. No hacerlo apagaría
 *     el borrado normal por el hecho de estar dentro de una herramienta.
 *   · Con sujeto local devuelve `true`, borre o no borre algo.
 *   · **Rendirse también es consumir.** Un tramo (que no se puede borrar) y un
 *     nodo que dejaría la pieza con menos de tres puntos consumen igual.
 */
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { setup, mouseAt, pieceLocalToPattern } from './editPatternHarness';

afterEach(() => { cleanup(); });

const tecla = (key: string) => new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });

function rect(): PatternPiece {
  return {
    id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, internals: [],
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
  } as PatternPiece;
}

/** Un triángulo: quitarle un nodo lo dejaría con dos, y eso no se permite. */
function triangulo(): PatternPiece {
  return {
    ...rect(),
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [50, 100] },
      { type: 'Z', values: [] },
    ],
  } as PatternPiece;
}

const contorno = (store: ReturnType<typeof setup>['store']) =>
  store.getState().project.pieces[0].outline;

describe('#1115 — el gancho dice la verdad sobre si se quedó la tecla', () => {
  it('sin nada agarrado devuelve false, para que Supr siga borrando la pieza', () => {
    const { ref } = setup(rect());

    let consumio = true;
    act(() => { consumio = ref.current!.handleKeyDown(tecla('Delete')); });

    expect(consumio, 'entrar a Editar patrón apagaría el borrado normal').toBe(false);
  });

  it('con un NODO agarrado se queda la tecla y borra el nodo', () => {
    const piece = rect();
    const { ref, store } = setup(piece);
    act(() => { ref.current!.handleMouseDown(mouseAt(pieceLocalToPattern({ x: 0, y: 0 }, piece))); });
    expect(ref.current!.selectedNodes.size, 'no se agarró el nodo: el caso no se ejerce').toBeGreaterThan(0);

    const antes = contorno(store).length;
    let consumio = false;
    act(() => { consumio = ref.current!.handleKeyDown(tecla('Delete')); });

    expect(consumio).toBe(true);
    expect(contorno(store).length, 'el nodo no se borró').toBe(antes - 1);
  });

  it('con un TRAMO agarrado se queda la tecla aunque no haya nada que borrar', () => {
    // No existe «borrar lado» en el CONTORNO (spec 2026-09-24 § 4.6 — una
    // interna sí tiene su tramo). El contrato es que no pase nada — no que la
    // pieza desaparezca, que es lo que ocurría al soltar la tecla al global.
    const piece = rect();
    const { ref, store } = setup(piece);
    act(() => { ref.current!.handleMouseDown(mouseAt(pieceLocalToPattern({ x: 50, y: 0 }, piece))); });
    expect(ref.current!.selectedSegments.size, 'no se agarró el tramo: el caso no se ejerce').toBeGreaterThan(0);
    expect(ref.current!.selectedNodes.size, 'se agarró un nodo, no un tramo').toBe(0);

    const antes = contorno(store).length;
    let consumio = false;
    act(() => { consumio = ref.current!.handleKeyDown(tecla('Delete')); });

    expect(consumio, 'con el tramo resaltado, la tecla se fue al global').toBe(true);
    expect(contorno(store).length, 'un tramo del contorno no se borra').toBe(antes);
  });

  it('y cuando el nodo no se puede borrar, rendirse también es consumir', () => {
    // El comentario viejo llamaba «seguro» a soltar la tecla aquí. Era cierto
    // sobre los defaults del navegador y falso sobre todo lo demás: el global
    // la recogía y «no puedo borrar el nodo» terminaba borrando la pieza.
    const piece = triangulo();
    const { ref, store } = setup(piece);
    act(() => { ref.current!.handleMouseDown(mouseAt(pieceLocalToPattern({ x: 0, y: 0 }, piece))); });
    expect(ref.current!.selectedNodes.size, 'no se agarró el nodo: el caso no se ejerce').toBeGreaterThan(0);

    const antes = contorno(store).length;
    let consumio = false;
    act(() => { consumio = ref.current!.handleKeyDown(tecla('Delete')); });

    expect(consumio, 'el aviso salió y la tecla se fue al global de todas formas').toBe(true);
    expect(contorno(store).length, 'el contorno se tocó pese al aviso').toBe(antes);
  });

  it('Retroceso hace exactamente lo mismo que Supr', () => {
    // `edit.deleteAlt` está en Retroceso y llama al MISMO `deleteSelection`,
    // así que las dos teclas tienen el mismo duelo y el mismo contrato.
    const piece = rect();
    const { ref, store } = setup(piece);
    act(() => { ref.current!.handleMouseDown(mouseAt(pieceLocalToPattern({ x: 0, y: 0 }, piece))); });

    const antes = contorno(store).length;
    let consumio = false;
    act(() => { consumio = ref.current!.handleKeyDown(tecla('Backspace')); });

    expect(consumio).toBe(true);
    expect(contorno(store).length).toBe(antes - 1);
  });

  it('una tecla que no es suya nunca se la queda', () => {
    // La red contra el arreglo perezoso de todos: devolver `true` siempre
    // dejaría a María sin atajos dentro de la herramienta.
    const piece = rect();
    const { ref } = setup(piece);
    act(() => { ref.current!.handleMouseDown(mouseAt(pieceLocalToPattern({ x: 0, y: 0 }, piece))); });

    for (const k of ['a', 'z', 'Enter', 'Tab', 'ArrowLeft']) {
      let consumio = true;
      act(() => { consumio = ref.current!.handleKeyDown(tecla(k)); });
      expect(consumio, `se quedó «${k}», que no es suya`).toBe(false);
    }
  });
});
