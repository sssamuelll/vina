import { describe, it, expect } from 'vitest';
import { rangoMedibleDeBorde, indiceSegunLosBordes } from '../../../utils/semanticEdges';
import { resolveEdgeName } from '../sewingUtils';
import { vecinosDelNodo, cotasDelNodo } from '../cotas/nodo';
import type { PathCommand, PatternPiece } from '../../../types/types';

const dosSubcaminos: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 50] },
  { type: 'Z', values: [] },
  { type: 'M', values: [200, 0] },
  { type: 'L', values: [300, 0] },
  { type: 'L', values: [300, 50] },
  { type: 'Z', values: [] },
];

describe('probe', () => {
  it('rangoMedibleDeBorde con dos subcaminos', () => {
    console.log('subcamino 1 cierre [0,1] ->', rangoMedibleDeBorde(dosSubcaminos, [0, 1]));
    console.log('subcamino 2 cierre [4,5] ->', rangoMedibleDeBorde(dosSubcaminos, [4, 5]));
    expect(true).toBe(true);
  });
  it('indiceSegunLosBordes con dos subcaminos', () => {
    console.log('Z del sub1 (3) ->', indiceSegunLosBordes(dosSubcaminos, 3));
    console.log('Z del sub2 (7) ->', indiceSegunLosBordes(dosSubcaminos, 7));
  });
  it('resolveEdgeName cuando el borde ancho empieza en la M', () => {
    const piece = {
      id: 'p', outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 50] },
        { type: 'L', values: [0, 50] },
        { type: 'Z', values: [] },
      ] as PathCommand[],
      edges: [
        { id: 'e0', name: 'contorno', segmentRange: [0, 5] },
        { id: 'e1', name: 'arriba', segmentRange: [1, 2] },
      ],
    } as unknown as PatternPiece;
    console.log('clic en Z (4) ->', resolveEdgeName(piece, 4));
    console.log('clic en L1 (1) ->', resolveEdgeName(piece, 1));
  });
  it('cotasDelNodo sobre pieza girada 90', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 50] },
      { type: 'L', values: [0, 50] },
      { type: 'Z', values: [] },
    ];
    const p = { id: 'p', outline, internals: [], position: { x: 0, y: 0 }, rotation: 90, mirrored: false } as unknown as PatternPiece;
    const c = cotasDelNodo(p, 1);
    for (const k of c) console.log(k.id, 'a=', k.a, 'b=', k.b, 'outward=', k.outward, 'valor=', k.valueMm);
  });
  it('vecinosDelNodo en contorno abierto y con curvas', () => {
    const curvo: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, 40, 90, 40, 100, 0] },
      { type: 'L', values: [100, 50] },
      { type: 'Z', values: [] },
    ];
    console.log('vecinos del C (1):', JSON.stringify(vecinosDelNodo(curvo, 1)));
    const p = { id: 'p', outline: curvo, internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false } as unknown as PatternPiece;
    const c = cotasDelNodo(p, 1);
    for (const k of c) console.log(k.id, 'valor(cuerda)=', k.valueMm);
  });
});
