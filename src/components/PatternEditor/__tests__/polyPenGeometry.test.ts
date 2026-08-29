import { describe, it, expect } from 'vitest';
import { nodesToCommands, commandsToPathD, type PolyPenNode } from '../polyPenGeometry';
import { chainHandles } from '../../../utils/geometry/catmullRom';

/**
 * Geometría del trazo de línea interna (spec 2026-08-29 § 4.5): cada tramo
 * toma en cada extremo el manejador que su nodo aporta. Un bezier aporta el
 * suyo; un nodo de curva por puntos aporta el de Catmull-Rom de su bloque; un
 * recto no aporta. Las cadenas son abiertas, como el contorno.
 */

const P = (x: number, y: number) => ({ x, y });
const straight = (x: number, y: number): PolyPenNode => ({ point: P(x, y), type: 'straight' });
const curve = (x: number, y: number): PolyPenNode => ({ point: P(x, y), type: 'curvePoints' });
const bezier = (x: number, y: number, out: [number, number]): PolyPenNode => ({
  point: P(x, y), type: 'bezier',
  handleOut: P(out[0], out[1]), handleIn: P(2 * x - out[0], 2 * y - out[1]),
});

describe('nodesToCommands', () => {
  it('con menos de dos nodos no hay path', () => {
    expect(nodesToCommands([], false)).toEqual([]);
    expect(nodesToCommands([straight(0, 0)], false)).toEqual([]);
  });

  it('recta-recta es M L', () => {
    expect(nodesToCommands([straight(0, 0), straight(10, 0)], false)).toEqual([
      { type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] },
    ]);
  });

  it('recta-curva-curva-recta da M C C C con los manejadores de Catmull-Rom', () => {
    const nodes = [straight(0, 0), curve(10, 10), curve(20, 10), straight(30, 0)];
    const cmds = nodesToCommands(nodes, false);
    expect(cmds.map(c => c.type)).toEqual(['M', 'C', 'C', 'C']);
    const handles = chainHandles([P(0, 0), P(10, 10), P(20, 10), P(30, 0)], false);
    for (let k = 0; k < 3; k++) {
      const [cp1, cp2] = handles[k];
      expect(cmds[k + 1].values.slice(0, 4)).toEqual([cp1.x, cp1.y, cp2.x, cp2.y]);
    }
    expect(cmds[3].values.slice(4)).toEqual([30, 0]);
  });

  it('un bezier aporta su manejador y el nodo recto vecino pone su ancla', () => {
    const cmds = nodesToCommands([bezier(0, 0, [5, 5]), straight(10, 0)], false);
    expect(cmds[1]).toEqual({ type: 'C', values: [5, 5, 10, 0, 10, 0] });
  });

  it('bezier junto a un bloque de curva: cada extremo aporta lo suyo', () => {
    const nodes = [bezier(0, 0, [5, 5]), curve(10, 10), straight(20, 0)];
    const cmds = nodesToCommands(nodes, false);
    const handles = chainHandles([P(0, 0), P(10, 10), P(20, 0)], false);
    // tramo 0→1: cp1 del bezier, cp2 de Catmull-Rom
    expect(cmds[1].values.slice(0, 2)).toEqual([5, 5]);
    expect(cmds[1].values.slice(2, 4)).toEqual([handles[0][1].x, handles[0][1].y]);
    // tramo 1→2: es frontera del bloque, así que el recto recibe su manejador
    // calculado por la cadena, como el ancla de arranque del contorno
    expect(cmds[2].values.slice(0, 2)).toEqual([handles[1][0].x, handles[1][0].y]);
    expect(cmds[2].values.slice(2, 4)).toEqual([handles[1][1].x, handles[1][1].y]);
  });

  it('cerrar con rectas emite Z pelado', () => {
    const cmds = nodesToCommands([straight(0, 0), straight(10, 0), straight(10, 10)], true);
    expect(cmds.map(c => c.type)).toEqual(['M', 'L', 'L', 'Z']);
  });

  it('cerrar con un bezier en el primer nodo emite C de vuelta y luego Z', () => {
    const cmds = nodesToCommands([bezier(0, 0, [5, -5]), straight(10, 0), straight(10, 10)], true);
    expect(cmds.map(c => c.type)).toEqual(['M', 'C', 'L', 'C', 'Z']);
    // el tramo de cierre entra con el ancla del recto y sale por handleIn del bezier
    expect(cmds[3].values).toEqual([10, 10, -5, 5, 0, 0]);
  });

  it('las cadenas son abiertas: un bloque de curva no cruza el cierre', () => {
    const nodes = [curve(0, 0), straight(10, 0), straight(10, 10), curve(0, 10)];
    const cmds = nodesToCommands(nodes, true);
    expect(cmds.map(c => c.type)).toEqual(['M', 'C', 'L', 'C', 'C', 'Z']);
    // bloque A = [n0, n1] (phantom por delante); bloque B = [n2, n3, n0]: aparte
    const a = chainHandles([P(0, 0), P(10, 0)], false);
    const b = chainHandles([P(10, 10), P(0, 10), P(0, 0)], false);
    expect(cmds[1].values.slice(0, 4)).toEqual([a[0][0].x, a[0][0].y, a[0][1].x, a[0][1].y]);
    expect(cmds[3].values.slice(0, 4)).toEqual([b[0][0].x, b[0][0].y, b[0][1].x, b[0][1].y]);
    expect(cmds[4].values.slice(0, 4)).toEqual([b[1][0].x, b[1][0].y, b[1][1].x, b[1][1].y]);
  });
});

describe('commandsToPathD', () => {
  it('serializa como el resto del editor', () => {
    expect(commandsToPathD([{ type: 'M', values: [1, 2] }, { type: 'L', values: [3, 4] }, { type: 'Z', values: [] }]))
      .toBe('M1,2 L3,4 Z');
  });
});
