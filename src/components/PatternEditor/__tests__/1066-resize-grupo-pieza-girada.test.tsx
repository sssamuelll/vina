// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PatternPiece, PathCommand } from '../../../types/types';
import { outlineBBoxCenter, rotatePoint } from '../../../utils/geometry/transform';
import { useTransformTool } from '../useTransformTool';

afterEach(cleanup);

/**
 * Hermano no reportado de #1064, encontrado en la pasada adversarial de #1034.
 *
 * `computeBoundingBox` devuelve DOS cajas distintas segun cuantas piezas haya
 * seleccionadas, y no son el mismo espacio:
 *
 *  - una pieza  -> `piecePoints(p, false)`: contorno CRUDO + posicion, y la
 *    caja lleva `rotation: piece.rotation`. El ancla vive en el marco sin girar.
 *  - varias     -> `piecePoints(p, true)`: geometria YA GIRADA, y la caja lleva
 *    `rotation: 0`. El ancla vive en espacio de patron real.
 *
 * El resize de `useTransformTool` esta escrito para la primera: resta la
 * posicion a pelo para llevar el ancla a local (`anchor - snap.position`, sin
 * des-girar) y compensa el pivote con `snappedBbox.rotation`, que en grupo es
 * cero aunque la pieza gire 90. Con una sola pieza los dos marcos coinciden y
 * nada se nota; en cuanto hay dos y una esta girada, los marcos se cruzan.
 *
 * El invariante que el propio codigo declara —"el ancla no se mueve en
 * pantalla"— es lo que se mide aca, porque es lo unico que la usuaria ve.
 */

const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [40, 0] },
  { type: 'L', values: [40, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

function pieza(id: string, x: number, rotation: number): PatternPiece {
  return {
    id, name: id, position: { x, y: 0 }, rotation,
    outline: RECT.map(c => ({ ...c, values: [...c.values] })),
    internals: [], mirrored: false, seamAllowance: 0, active: true,
  } as unknown as PatternPiece;
}

type Update = { id: string; outline: PathCommand[]; position: { x: number; y: number }; rotation: number };

function pointer(x: number, y: number) {
  return {
    button: 0, shiftKey: false, clientX: x, clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

/** Donde caen los puntos de la pieza EN PANTALLA: el transform del renderizador. */
function enPantalla(u: Update): { x: number; y: number }[] {
  const centro = outlineBBoxCenter(u.outline);
  const rad = (u.rotation * Math.PI) / 180;
  const pts: { x: number; y: number }[] = [];
  for (const cmd of u.outline) {
    for (let i = 0; i + 1 < cmd.values.length; i += 2) {
      const p = rad
        ? rotatePoint({ x: cmd.values[i], y: cmd.values[i + 1] }, centro, rad)
        : { x: cmd.values[i], y: cmd.values[i + 1] };
      pts.push({ x: p.x + u.position.x, y: p.y + u.position.y });
    }
  }
  return pts;
}

const minX = (u: Update) => Math.min(...enPantalla(u).map(p => p.x));

/**
 * `a` recta en x 0..40. `b` girada 90 en x 200: su rectangulo de 40x100 gira
 * sobre su centro (20,50) y ocupa x 170..270 en pantalla.
 * Caja del grupo, ya girada: x 0..270, y -30..130. Tirador `e` en (270, 50).
 */
function gesto(to: [number, number]) {
  const onTransform = vi.fn();
  const piezas = [pieza('a', 0, 0), pieza('b', 200, 90)];
  const hook = renderHook(() =>
    useTransformTool(1, { x: 0, y: 0 }, piezas, ['a', 'b'], onTransform));
  act(() => { hook.result.current.handleMouseDown(pointer(270, 50)); });
  act(() => { hook.result.current.handleMouseMove(pointer(...to)); });
  act(() => { hook.result.current.handleMouseUp(); });
  return onTransform;
}

function estirarGrupo(to: [number, number]): Update[] {
  const onTransform = gesto(to);
  expect(onTransform).toHaveBeenCalled();
  return onTransform.mock.calls[0][0] as Update[];
}

describe('#1034 — resize de grupo con una pieza girada', () => {
  it('el tirador este deja el borde oeste del grupo clavado en 0', () => {
    const [a, b] = estirarGrupo([340, 50]);
    // El ancla del tirador `e` es el lado oeste de la caja del grupo: x = 0,
    // que es el borde izquierdo de `a`. Ese punto no lo arrastra nadie.
    expect(minX(a)).toBeCloseTo(0);
    // La caja va de 0 a 270 y el tirador se lleva a 340: escala 340/270.
    // `b` empieza en 170, asi que su borde oeste tiene que caer en 170*340/270.
    expect(minX(b)).toBeCloseTo(170 * 340 / 270);
  });

  it('el grupo con una pieza girada se escala uniforme, no en un solo eje', () => {
    // El tirador `e` toca solo X. Con `b` girada, estirar solo en X la
    // convertiria en un paralelogramo que el modelo no sabe escribir, asi que
    // el escalado se fuerza uniforme y el alto crece en la misma proporcion.
    const [a] = estirarGrupo([340, 50]);
    const ys = enPantalla(a).map(p => p.y);
    const alto = Math.max(...ys) - Math.min(...ys);
    expect(alto).toBeCloseTo(100 * 340 / 270);
  });
});

describe('#1067 — enganchar un tirador no es arrastrarlo', () => {
  it('soltar sin mover no commitea nada', () => {
    // Antes esto escribia una transformacion de escala 1: una entrada de
    // deshacer vacia, y `reanchorTransformedNotches` reescribiendo anclas.
    expect(gesto([270, 50])).not.toHaveBeenCalled();
  });

  it('un temblor por debajo del umbral tampoco', () => {
    expect(gesto([273, 51])).not.toHaveBeenCalled();
  });

  it('cruzar el umbral si commitea', () => {
    expect(gesto([274, 50])).toHaveBeenCalled();
  });
});
