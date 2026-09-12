import { describe, it, expect } from 'vitest';
import type { PathCommand } from '../../../../types/types';
import {
  anclasDeTrazo, puntasDeTrazo, quitarTramo, moverPunta, tramoMasCercano, cruceDeRectas, crucesDeTrazos,
} from '../trazoPath';

const L = (x: number, y: number): PathCommand => ({ type: 'L', values: [x, y] });
const M = (x: number, y: number): PathCommand => ({ type: 'M', values: [x, y] });
const tres: PathCommand[] = [M(0, 0), L(100, 0), L(100, 100), L(0, 100)]; // 4 anclas, 3 tramos

describe('trazoPath — anclas y puntas', () => {
  it('lista las anclas en orden y las dos puntas', () => {
    expect(anclasDeTrazo(tres)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
    expect(puntasDeTrazo(tres)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 100 }]);
    expect(puntasDeTrazo([M(0, 0)])).toBeNull();
  });
});

describe('trazoPath — quitarTramo (contrato 08-09 § 5: Supr borra solo BC)', () => {
  it('del medio: dos trazos, cada uno con sus anclas', () => {
    const [izq, der] = quitarTramo(tres, 2); // tramo (100,0)→(100,100)
    expect(izq).toEqual([M(0, 0), L(100, 0)]);
    expect(der).toEqual([M(100, 100), L(0, 100)]);
  });
  it('el primero: solo queda la derecha', () => {
    const [izq, der] = quitarTramo(tres, 1);
    expect(izq).toBeNull();
    expect(der).toEqual([M(100, 0), L(100, 100), L(0, 100)]);
  });
  it('el último: solo queda la izquierda', () => {
    const [izq, der] = quitarTramo(tres, 3);
    expect(izq).toEqual([M(0, 0), L(100, 0), L(100, 100)]);
    expect(der).toBeNull();
  });
  it('de un trazo de dos anclas no queda nada', () => {
    expect(quitarTramo([M(0, 0), L(10, 0)], 1)).toEqual([null, null]);
  });
  it('un índice fuera de rango no toca el trazo', () => {
    expect(quitarTramo(tres, 0)).toEqual([tres, null]);
    expect(quitarTramo(tres, 9)).toEqual([tres, null]);
  });
});

describe('trazoPath — moverPunta', () => {
  it('mueve la primera y la última punta sin tocar las demás', () => {
    expect(anclasDeTrazo(moverPunta(tres, 0, { x: 5, y: 5 }))[0]).toEqual({ x: 5, y: 5 });
    const movido = moverPunta(tres, 1, { x: -1, y: 99 });
    expect(anclasDeTrazo(movido)[3]).toEqual({ x: -1, y: 99 });
    expect(anclasDeTrazo(movido).slice(0, 3)).toEqual(anclasDeTrazo(tres).slice(0, 3));
    expect(tres[3].values).toEqual([0, 100]); // no muta el original
  });
  it('en una curva C arrastra el manejador de llegada con el ancla', () => {
    const curva: PathCommand[] = [M(0, 0), { type: 'C', values: [10, 0, 90, 0, 100, 0] }];
    const movido = moverPunta(curva, 1, { x: 100, y: 50 });
    expect(movido[1].values).toEqual([10, 0, 90, 50, 100, 50]);
  });
  it('la punta de salida arrastra el manejador de salida, que vive en el C siguiente', () => {
    const curva: PathCommand[] = [M(0, 0), { type: 'C', values: [10, 0, 90, 0, 100, 0] }];
    const movido = moverPunta(curva, 0, { x: 0, y: 50 });
    expect(movido[0].values).toEqual([0, 50]);
    // el cp1 del C es el manejador SALIENTE del ancla movida: sube con ella
    expect(movido[1].values).toEqual([10, 50, 90, 0, 100, 0]);
    expect(curva[1].values).toEqual([10, 0, 90, 0, 100, 0]); // no muta el original
  });
});

describe('trazoPath — tramoMasCercano', () => {
  it('devuelve el tramo, la distancia y el punto proyectado', () => {
    const hit = tramoMasCercano(tres, { x: 50, y: 3 });
    expect(hit).toEqual({ distance: 3, segmentIndex: 1, point: { x: 50, y: 0 } });
    expect(tramoMasCercano([M(0, 0)], { x: 1, y: 1 })).toBeNull();
  });
});

describe('trazoPath — cruces', () => {
  it('dos rectas que se cruzan por dentro dan un punto; paralelas o en la punta, no', () => {
    expect(cruceDeRectas({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toEqual({ x: 5, y: 5 });
    expect(cruceDeRectas({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBeNull();
    expect(cruceDeRectas({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })).toBeNull();
  });
  it('crucesDeTrazos cruza tramos rectos de trazos distintos y del mismo trazo si no son vecinos', () => {
    const a = { id: 'a', path: [M(0, 5), L(10, 5)] };
    const b = { id: 'b', path: [M(5, 0), L(5, 10)] };
    expect(crucesDeTrazos([a, b])).toEqual([{ x: 5, y: 5 }]);
    const zeta = { id: 'z', path: [M(0, 0), L(10, 0), L(0, 10), L(10, 10)] }; // el 1.º y el 3.º tramo no se tocan
    expect(crucesDeTrazos([zeta])).toEqual([]);
    const curva = { id: 'c', path: [M(0, 5), { type: 'C' as const, values: [3, 5, 7, 5, 10, 5] }] };
    expect(crucesDeTrazos([curva, b])).toEqual([]); // las curvas no cruzan (spec § 6)
  });
});
