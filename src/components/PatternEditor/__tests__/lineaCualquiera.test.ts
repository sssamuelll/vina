/**
 * Las utilidades de Editar patrón, sobre una línea cualquiera (spec
 * 2026-09-24 § 3.1). Hasta la fase 1 solo sabían del contorno; una interna es
 * otro `path` en el mismo marco de la pieza, y tiene que leerse igual.
 */
import { describe, it, expect } from 'vitest';
import type { PathCommand, PatternPiece } from '../../../types/types';
import { extractNodes, extractNodesFromPath } from '../nodeEditorUtils';
import { classifyAnchorsOfPath, classifyEditableAnchors } from '../anchorRoles';
import { arrivingReference, arrivingReferenceOnPath } from '../angleReference';
import { cotasDelNodo, cotasDelNodoEnPath, puntoUnicoDeLinea } from '../cotas/nodo';

const cuadrado: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
];

// Una interna abierta en L: (20,20) → (120,20) → (120,120).
const ele: PathCommand[] = [
  { type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] },
];

function pieza(): PatternPiece {
  return {
    id: 'p', name: 'P', outline: cuadrado, position: { x: 0, y: 0 }, rotation: 0,
    mirrored: false, active: true, seamAllowance: 0, edges: [],
    internals: [{ id: 'i', type: 'reference', path: ele }],
  } as unknown as PatternPiece;
}

describe('extractNodesFromPath', () => {
  it('lee los nodos de una interna con la pieza como dueña', () => {
    const nodes = extractNodesFromPath(ele, 'p');
    expect(nodes.map(n => n.position)).toEqual([{ x: 20, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 120 }]);
    expect(nodes.every(n => n.ref.pieceId === 'p')).toBe(true);
  });

  it('extractNodes es el mismo cálculo sobre el contorno', () => {
    expect(extractNodes(pieza())).toEqual(extractNodesFromPath(cuadrado, 'p'));
  });
});

describe('classifyAnchorsOfPath', () => {
  it('una línea abierta tiene dos extremos y una esquina', () => {
    const roles = classifyAnchorsOfPath(ele, extractNodesFromPath(ele, 'p')).map(a => a.role);
    expect(roles).toEqual(['openEndpoint', 'corner', 'openEndpoint']);
  });

  it('un ancla que toca una curva es de curva; el extremo sigue siendo extremo', () => {
    const curva: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'C', values: [130, 0, 150, 30, 150, 60] },
    ];
    const roles = classifyAnchorsOfPath(curva, extractNodesFromPath(curva, 'p')).map(a => a.role);
    expect(roles).toEqual(['openEndpoint', 'bezierAnchor', 'openEndpoint']);
  });

  it('classifyEditableAnchors es el mismo cálculo sobre el contorno', () => {
    const p = pieza();
    expect(classifyEditableAnchors(p, extractNodes(p))).toEqual(classifyAnchorsOfPath(cuadrado, extractNodes(p)));
  });
});

describe('arrivingReferenceOnPath', () => {
  const p = pieza();

  it('al punto de en medio le llega el primer tramo, que va a la derecha: 0°', () => {
    const r = arrivingReferenceOnPath(p, ele, 1);
    expect(r.kind).toBe('border');
    expect(r.baseDeg).toBeCloseTo(0, 6);
  });

  it('al último le llega el tramo que baja: −90° (la y crece hacia abajo)', () => {
    expect(arrivingReferenceOnPath(p, ele, 2).baseDeg).toBeCloseTo(-90, 6);
  });

  it('al primero no le llega nada: hace de marco el tramo que sale', () => {
    expect(arrivingReferenceOnPath(p, ele, 0).baseDeg).toBeCloseTo(0, 6);
  });

  it('arrivingReference es el mismo cálculo sobre el contorno', () => {
    for (let i = 0; i < 4; i++) {
      expect(arrivingReference(p, i)).toEqual(arrivingReferenceOnPath(p, cuadrado, i));
    }
  });
});

describe('cotasDelNodoEnPath', () => {
  const p = pieza();

  it('en una interna: sus dos vecinos, con la línea en el id y en la acción', () => {
    const cotas = cotasDelNodoEnPath(p, ele, 1, 'i');
    expect(cotas.map(c => c.valueMm)).toEqual([100, 100]);
    expect(cotas.map(c => c.id)).toEqual(['nodo-i-1-anterior', 'nodo-i-1-siguiente']);
    expect(cotas[0].apply(50)).toEqual({
      kind: 'nodo', pieceId: 'p', commandIndex: 1, destino: { x: 70, y: 20 }, lineId: 'i',
    });
  });

  it('en una punta: un solo vecino', () => {
    expect(cotasDelNodoEnPath(p, ele, 0, 'i')).toHaveLength(1);
  });

  it('cotasDelNodo es el mismo cálculo sobre el contorno', () => {
    const viejas = cotasDelNodo(p, 1).map(c => [c.id, c.valueMm, c.apply(10)]);
    const nuevas = cotasDelNodoEnPath(p, cuadrado, 1).map(c => [c.id, c.valueMm, c.apply(10)]);
    expect(viejas).toEqual(nuevas);
  });
});

describe('puntoUnicoDeLinea', () => {
  const gemelas: PathCommand[] = [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [50, 0] },
    { type: 'L', values: [50, 0] }, { type: 'L', values: [50, 80] },
  ];

  it('un grupo de gemelas es un solo punto', () => {
    expect(puntoUnicoDeLinea(gemelas, new Set([1, 2]))).toBe(1);
  });

  it('dos puntos distintos no son uno', () => {
    expect(puntoUnicoDeLinea(gemelas, new Set([0, 3]))).toBeNull();
  });

  it('nada elegido no es un punto', () => {
    expect(puntoUnicoDeLinea(gemelas, new Set())).toBeNull();
  });
});
