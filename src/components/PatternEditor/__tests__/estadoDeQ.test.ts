/**
 * El estado de Q con sus internas (spec 2026-09-24 §§ 3-4): las operaciones
 * puras que dejan escribir los gestos una sola vez para cualquier línea.
 */
import { describe, it, expect } from 'vitest';
import type { InternalLine, PathCommand, PatternPiece } from '../../../types/types';
import {
  algoElegido, arrastreDe, conLinea, estadoDeEntrada, extraerInternas, hoverDe,
  internaElegidaDe, marcoSelecciona, mismosPaths, pathsEditables, refrescarLineas,
  resyncStateToPiece, sinHover, sinSeleccion, vistas,
} from '../estadoDeQ';
import { CLAVE_CONTORNO, claveDeInterna } from '../lineaEditable';

const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
];
const ELE: InternalLine = {
  id: 'L', type: 'reference',
  path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] }],
};
const PIQUETE: InternalLine = { id: 'N', type: 'notch', path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 8] }] };
const PLIEGUE: InternalLine = {
  id: 'F', type: 'fold', foldOptions: { direction: 'valley', creaseAngleDeg: 180, pleatId: 'pl' },
  path: [{ type: 'M', values: [50, 0] }, { type: 'L', values: [50, 150] }],
};
const pieza = (internals: InternalLine[] = [ELE, PIQUETE, PLIEGUE]): PatternPiece => ({
  id: 'p', name: 'P', outline: RECT, position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  active: true, seamAllowance: 0, edges: [], internals,
} as unknown as PatternPiece);

describe('extraerInternas y estadoDeEntrada', () => {
  it('solo las editables, con sus nodos y nada elegido', () => {
    const internas = extraerInternas(pieza());
    expect(internas.map(i => i.lineId)).toEqual(['L']);
    expect(internas[0].nodes.map(n => n.position)).toEqual([{ x: 20, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 120 }]);
    expect(internas[0].selectedNodes.size).toBe(0);
  });

  it('entrar deja el contorno y las internas, en edición', () => {
    const s = estadoDeEntrada(pieza());
    expect(s.isEditing).toBe(true);
    expect(s.editingPieceId).toBe('p');
    expect(s.nodes).toHaveLength(4);
    expect(s.internas!.map(i => i.lineId)).toEqual(['L']);
  });
});

describe('vistas y conLinea', () => {
  it('el contorno primero, las internas después: el orden de pintado', () => {
    const v = vistas(estadoDeEntrada(pieza()), RECT);
    expect(v.map(l => l.clave)).toEqual([CLAVE_CONTORNO, claveDeInterna('L')]);
    expect(v[0].path).toBe(RECT);
  });

  it('conLinea cambia una línea y deja las otras', () => {
    const s = conLinea(estadoDeEntrada(pieza()), claveDeInterna('L'), { selectedNodes: new Set([1]) });
    expect([...s.internas![0].selectedNodes]).toEqual([1]);
    expect(s.selectedNodes.size).toBe(0);
    const t = conLinea(s, CLAVE_CONTORNO, { hoveredSegment: 2 });
    expect(t.hoveredSegment).toBe(2);
    expect([...t.internas![0].selectedNodes]).toEqual([1]);
  });

  it('sinSeleccion y sinHover limpian todas las líneas', () => {
    let s = conLinea(estadoDeEntrada(pieza()), claveDeInterna('L'), { selectedSegments: new Set([1]), hoveredNode: 0 });
    s = conLinea(s, CLAVE_CONTORNO, { selectedNodes: new Set([0]), hoveredSegment: 1 });
    expect(algoElegido(s)).toBe(true);
    const limpio = sinHover(sinSeleccion(s));
    expect(algoElegido(limpio)).toBe(false);
    expect(hoverDe(limpio)).toBeNull();
  });
});

describe('internaElegidaDe (spec § 3.5)', () => {
  const base = estadoDeEntrada(pieza());
  it('un tramo de una sola interna: la interna con su tramo', () => {
    expect(internaElegidaDe(conLinea(base, claveDeInterna('L'), { selectedSegments: new Set([2]) })))
      .toEqual({ lineId: 'L', segmentIndex: 2 });
  });
  it('puntos de una sola interna: la interna sin tramo', () => {
    expect(internaElegidaDe(conLinea(base, claveDeInterna('L'), { selectedNodes: new Set([1]) })))
      .toEqual({ lineId: 'L' });
  });
  it('el contorno, nada, o dos líneas: ninguna', () => {
    expect(internaElegidaDe(base)).toBeNull();
    expect(internaElegidaDe(conLinea(base, CLAVE_CONTORNO, { selectedNodes: new Set([0]) }))).toBeNull();
    const dos = conLinea(conLinea(base, CLAVE_CONTORNO, { selectedNodes: new Set([0]) }), claveDeInterna('L'), { selectedNodes: new Set([1]) });
    expect(internaElegidaDe(dos)).toBeNull();
  });
});

describe('refrescarLineas, resync y la identidad de los paths', () => {
  it('refrescarLineas relee nodos y path de las líneas tocadas y conserva lo elegido', () => {
    const s = conLinea(estadoDeEntrada(pieza()), claveDeInterna('L'), { selectedNodes: new Set([1]) });
    const nuevo: InternalLine = { ...ELE, path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 40] }, { type: 'L', values: [120, 120] }] };
    const p2 = pieza([nuevo, PIQUETE, PLIEGUE]);
    const r = refrescarLineas(s, p2, [claveDeInterna('L')]);
    expect(r.internas![0].path).toBe(nuevo.path);
    expect(r.internas![0].nodes[1].position).toEqual({ x: 120, y: 40 });
    expect([...r.internas![0].selectedNodes]).toEqual([1]);
  });

  it('resync relee las internas y suelta todo', () => {
    const s = conLinea(estadoDeEntrada(pieza()), claveDeInterna('L'), { selectedNodes: new Set([1]) });
    const r = resyncStateToPiece(s, pieza());
    expect(r.internas![0].selectedNodes.size).toBe(0);
  });

  it('pathsEditables: el contorno y las editables, sin piquetes ni pliegues', () => {
    const p = pieza();
    expect(pathsEditables(p)).toEqual([RECT, ELE.path]);
    expect(mismosPaths(pathsEditables(p), pathsEditables(p))).toBe(true);
    expect(mismosPaths(null, pathsEditables(p))).toBe(false);
  });
});

describe('arrastreDe y marcoSelecciona', () => {
  it('los puntos elegidos de cada línea, con su punto de partida', () => {
    let s = conLinea(estadoDeEntrada(pieza()), CLAVE_CONTORNO, { selectedNodes: new Set([1]) });
    s = conLinea(s, claveDeInterna('L'), { selectedNodes: new Set([2]) });
    const a = arrastreDe(s, RECT, 'node');
    expect([...a.keys()]).toEqual([CLAVE_CONTORNO, claveDeInterna('L')]);
    expect(a.get(claveDeInterna('L'))!.startPositions.get(2)).toEqual({ x: 120, y: 120 });
    expect(a.get(claveDeInterna('L'))!.startPath).toBe(ELE.path);
  });

  it('un tramo arrastra sus dos extremos', () => {
    const s = conLinea(estadoDeEntrada(pieza()), claveDeInterna('L'), { selectedSegments: new Set([1]) });
    const a = arrastreDe(s, RECT, 'segment').get(claveDeInterna('L'))!;
    expect([...a.startPositions.entries()]).toEqual([[1, { x: 120, y: 20 }], [0, { x: 20, y: 20 }]]);
  });

  it('el marco coge puntos del contorno y de las internas', () => {
    const s = { ...estadoDeEntrada(pieza()), marquee: { start: { x: -5, y: -5 }, current: { x: 130, y: 30 } } };
    const r = marcoSelecciona(s, pieza());
    expect([...r.selectedNodes]).toEqual([0]);
    expect([...r.internas![0].selectedNodes]).toEqual([0, 1]);
    expect(r.marquee).toBeNull();
  });
});
