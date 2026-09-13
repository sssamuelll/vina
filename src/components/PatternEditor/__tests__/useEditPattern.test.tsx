// @vitest-environment jsdom
/**
 * useEditPattern — phantom-point guard + node resync after external outline
 * changes (undo/redo). Notas de María #167: double-clicking a corner vertex
 * spawned a coincident extra point, and Ctrl+Z left the overlay nodes detached
 * from the reverted outline.
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { restoreState, setLayerLocked } from '../../../store/projectSlice';
import { useEditPattern, findInsertTarget, resyncStateToPiece } from '../useEditPattern';
import { patternToPieceLocal, pieceLocalToPattern } from '../pieceTransform';
import { extractNodes, splitSegmentAt } from '../nodeEditorUtils';
import { computeNotchAnchor } from '../../../utils/notchAnchor';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../../../utils/notches';
import type { PatternPiece, InternalLine } from '../../../types/types';
import type { EditPatternState } from '../useEditPattern';

afterEach(cleanup);

const square = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
] as PatternPiece['outline'];

// M/L/C mix — armhole-style curve ending at (100, 100).
const curved = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'C', values: [120, 20, 120, 80, 100, 100] },
  { type: 'Z', values: [] },
] as PatternPiece['outline'];

function piece(outline = square): PatternPiece {
  return {
    id: 'p', name: 'Square', outline, position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, active: true, seamAllowance: 0, internals: [], edges: [],
  } as unknown as PatternPiece;
}

const HR = 8;

// ─── findInsertTarget (phantom-point guard) ───

describe('findInsertTarget', () => {
  const p = piece();
  const nodes = extractNodes(p);

  it('double-click exactly on a corner vertex does not insert', () => {
    expect(findInsertTarget({ x: 0, y: 0 }, nodes, p.outline, HR)).toBeNull();
  });

  it('double-click within hit radius of a vertex does not insert', () => {
    // (5,5) is ~7.07 from the corner (inside HR) and distance 5 from both
    // adjacent segments — the exact case that spawned the phantom point.
    expect(findInsertTarget({ x: 5, y: 5 }, nodes, p.outline, HR)).toBeNull();
  });

  it('double-click mid-segment returns an insert target on that segment', () => {
    const target = findInsertTarget({ x: 100, y: 1 }, nodes, p.outline, HR);
    expect(target).not.toBeNull();
    expect(target!.commandIndex).toBe(1);
    expect(target!.t).toBeCloseTo(0.5, 1);
  });

  it('double-click far from the outline does nothing', () => {
    expect(findInsertTarget({ x: 500, y: 500 }, nodes, p.outline, HR)).toBeNull();
  });

  it('double-click on the closing (Z) edge targets that edge', () => {
    // Closing edge of the square runs from (0,200) back to (0,0).
    const target = findInsertTarget({ x: 1, y: 100 }, nodes, p.outline, HR);
    expect(target).not.toBeNull();
    expect(p.outline[target!.commandIndex].type).toBe('Z');
  });

  it('ignores the phantom closing edge of an open outline', () => {
    const open = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 200] },
    ] as PatternPiece['outline'];
    const openNodes = extractNodes(piece(open));
    // (100,100) sits on the imaginary last→first line; there is no real edge.
    expect(findInsertTarget({ x: 100, y: 100 }, openNodes, open, HR)).toBeNull();
  });

  it('double-click on a CURVE anchor does not insert (guard covers C/Q anchors)', () => {
    const cp = piece(curved);
    const cNodes = extractNodes(cp);
    // The C anchor sits at (100,100), on its own arc at distance ~0.
    expect(findInsertTarget({ x: 100, y: 100 }, cNodes, cp.outline, HR)).toBeNull();
    expect(findInsertTarget({ x: 102, y: 102 }, cNodes, cp.outline, HR)).toBeNull();
  });

  it('double-click mid-arc inserts on the curve segment', () => {
    const cp = piece(curved);
    const cNodes = extractNodes(cp);
    // Cubic midpoint of the C segment is (115, 50) — far from every anchor.
    const target = findInsertTarget({ x: 115, y: 50 }, cNodes, cp.outline, HR);
    expect(target).not.toBeNull();
    expect(target!.commandIndex).toBe(2);
    expect(cp.outline[target!.commandIndex].type).toBe('C');
  });
});

// ─── splitSegmentAt on the closing edge ───

describe('splitSegmentAt on the closing (Z) edge', () => {
  it('inserts an L before the Z at the interpolated point', () => {
    const out = splitSegmentAt(square, 4, 0.5);
    expect(out).toHaveLength(6);
    expect(out[4]).toEqual({ type: 'L', values: [0, 100], authoredAnchor: true });
    expect(out[5].type).toBe('Z');
  });
});

// ─── resyncStateToPiece ───

describe('resyncStateToPiece', () => {
  const triangle = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [50, 80] },
    { type: 'Z', values: [] },
  ] as PatternPiece['outline'];

  function stateFor(p: PatternPiece): EditPatternState {
    return {
      isEditing: true,
      editingPieceId: p.id,
      hoveredPieceId: p.id,
      nodes: extractNodes(piece()), // stale: extracted from the square
      selectedNodes: new Set([1, 3]),
      selectedSegments: new Set([2]),
      hoveredNode: 1,
      hoveredSegment: null,
      addPointPreview: { x: 5, y: 5 },
      marquee: null,
    };
  }

  it('re-extracts nodes from the new outline', () => {
    const p = piece(triangle);
    const next = resyncStateToPiece(stateFor(p), p);
    expect(next.nodes).toHaveLength(3);
    expect(next.nodes[2].position).toEqual({ x: 50, y: 80 });
  });

  it('clears selections and transient hover state — indices from before an external change may denote different geometry', () => {
    const p = piece(triangle);
    const next = resyncStateToPiece(stateFor(p), p);
    expect(next.selectedNodes.size).toBe(0);
    expect(next.selectedSegments.size).toBe(0);
    expect(next.hoveredPieceId).toBeNull();
    expect(next.hoveredNode).toBeNull();
    expect(next.addPointPreview).toBeNull();
  });
});

// ─── Rotation-aware coordinate mapping (nota de María #170) ───

describe('patternToPieceLocal / pieceLocalToPattern', () => {
  // Square center is (100,100); rotate the piece 90° about it.
  const rot90 = { ...piece(), rotation: 90 } as PatternPiece;

  it('maps a pattern point back to un-rotated piece-local coords', () => {
    // Node 1 (local 200,0) appears visually at (200,200) when rotated 90°.
    const local = patternToPieceLocal({ x: 200, y: 200 }, rot90);
    expect(local.x).toBeCloseTo(200);
    expect(local.y).toBeCloseTo(0);
  });

  it('round-trips local → pattern → local under rotation + offset', () => {
    const offset = { ...piece(), rotation: 37, position: { x: 40, y: -15 } } as PatternPiece;
    const back = patternToPieceLocal(pieceLocalToPattern({ x: 170, y: 30 }, offset), offset);
    expect(back.x).toBeCloseTo(170);
    expect(back.y).toBeCloseTo(30);
  });

  it('is a pure position offset when rotation is 0', () => {
    const p = { ...piece(), position: { x: 10, y: 20 } } as PatternPiece;
    expect(patternToPieceLocal({ x: 60, y: 70 }, p)).toEqual({ x: 50, y: 50 });
  });
});

describe('useEditPattern hit-testing on a rotated piece', () => {
  function setup(p: PatternPiece | PatternPiece[]) {
    const store = configureStore({ reducer: { project: projectReducer } });
    const pieces = Array.isArray(p) ? p : [p];
    store.dispatch(restoreState({ ...store.getState().project, pieces }));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const hook = renderHook(() => useEditPattern(1, { x: 0, y: 0 }), { wrapper });
    return { store, hook };
  }
  function clickAt(x: number, y: number, pieceId: string | null = null) {
    return {
      button: 0, shiftKey: false, clientX: x, clientY: y,
      target: {
        closest: () => (pieceId ? { getAttribute: () => pieceId } : null),
      },
      currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    } as unknown as React.MouseEvent<SVGSVGElement>;
  }

  const rot90 = { ...piece(), rotation: 90 } as PatternPiece;

  it('selects the node under the cursor at its ROTATED screen position', () => {
    // Node 1 (local 200,0) is visually at (200,200) after a 90° turn about the
    // square center. A rotation-blind hit-test would grab node 2 (local 200,200).
    const { hook } = setup(rot90);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(clickAt(200, 200)); });
    act(() => hook.result.current.handleMouseUp());
    expect([...hook.result.current.selectedNodes]).toEqual([1]);
  });

  it('marquee selects the node inside its ROTATED screen box', () => {
    // A box around visual (200,200) must catch node 1, not node 2.
    const { hook } = setup(rot90);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(clickAt(150, 150)); }); // empty interior → marquee
    act(() => { hook.result.current.handleMouseMove(clickAt(250, 250)); });
    act(() => hook.result.current.handleMouseUp());
    expect([...hook.result.current.selectedNodes]).toEqual([1]);
  });

  it('drags a node in the pointer direction, not skewed by the rotation', () => {
    // Grab node 1 (visual 200,200) and drag +10px in screen X. On a 90° piece,
    // a rightward screen drag is a −Y move in un-rotated local space.
    const { store, hook } = setup(rot90);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(clickAt(200, 200)); });
    act(() => { hook.result.current.handleMouseMove(clickAt(210, 200)); });
    act(() => hook.result.current.handleMouseUp());
    const outline = (store.getState() as { project: { pieces: PatternPiece[] } }).project.pieces[0].outline;
    expect(outline[1].values[0]).toBeCloseTo(200);
    expect(outline[1].values[1]).toBeCloseTo(-10);
  });

  it('does not promise or start editing through a locked layer', () => {
    const lockedLayerPiece = { ...piece(), layer: 3 } as PatternPiece;
    const { hook, store } = setup(lockedLayerPiece);

    act(() => { hook.result.current.handleMouseMove(clickAt(50, 0)); });
    expect(hook.result.current.hoveredPieceId).toBe('p');

    act(() => { store.dispatch(setLayerLocked({ layer: 3, locked: true })); });
    expect(hook.result.current.hoveredPieceId).toBeNull();
    expect(hook.result.current.hoveredSegment).toBeNull();

    act(() => {
      expect(hook.result.current.enterEditActuando('p', clickAt(0, 0))).toBe(true);
    });
    expect(hook.result.current.isEditing).toBe(false);
  });

  it('resolves equal zOrder in the same topmost order as the renderer', () => {
    const below = piece();
    const above = { ...piece(), id: 'p2', name: 'P2' } as PatternPiece;
    const { hook } = setup([below, above]);

    act(() => { hook.result.current.handleMouseMove(clickAt(50, 0)); });
    expect(hook.result.current.hoveredPieceId).toBe('p2');
  });

  it('announces a first-gesture node drag with the move cursor', () => {
    const { hook } = setup(piece());

    act(() => { hook.result.current.handleMouseMove(clickAt(0, 0, 'p')); });

    expect(hook.result.current.hoveredNode).toBe(0);
    expect(hook.result.current.hoveredSegment).toBeNull();
    expect(hook.result.current.getCursor()).toBe('move');
  });

  it('does not treat the synthetic closing edge of an open outline as a subject', () => {
    const open = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 200] },
    ] as PatternPiece['outline'];
    const { hook } = setup(piece(open));

    act(() => { hook.result.current.handleMouseMove(clickAt(100, 100, 'p')); });
    expect(hook.result.current.hoveredPieceId).toBeNull();
    expect(hook.result.current.hoveredSegment).toBeNull();

    act(() => {
      expect(hook.result.current.enterEditActuando('p', clickAt(100, 100, 'p'))).toBe(false);
    });
    expect(hook.result.current.isEditing).toBe(false);
  });

  it('does not promise a lower segment hidden behind the DOM-owned piece', () => {
    const lower = piece([
      { type: 'M', values: [0, 100] },
      { type: 'L', values: [200, 100] },
      { type: 'L', values: [200, 300] },
      { type: 'L', values: [0, 300] },
      { type: 'Z', values: [] },
    ] as PatternPiece['outline']);
    const upper = { ...piece(), id: 'p2', name: 'Upper' } as PatternPiece;
    const { hook } = setup([lower, upper]);

    act(() => { hook.result.current.handleMouseMove(clickAt(100, 100, 'p2')); });

    expect(hook.result.current.hoveredPieceId).toBeNull();
    expect(hook.result.current.getCursor()).toBe('default');
  });

  it('clears pre-entry hover when the pointer leaves the canvas', () => {
    const { hook } = setup(piece());

    act(() => { hook.result.current.handleMouseMove(clickAt(50, 0)); });
    expect(hook.result.current.hoveredPieceId).toBe('p');

    act(() => { hook.result.current.limpiarHover(); });
    expect(hook.result.current.hoveredPieceId).toBeNull();
    expect(hook.result.current.hoveredSegment).toBeNull();
  });
});

// ─── Notch re-anchoring on outline edit (nota de María #171) ───

describe('useEditPattern re-anchors notches when the outline is edited', () => {
  function notchedPiece(): PatternPiece {
    const anchor = computeNotchAnchor(square as PatternPiece['outline'], { x: 100, y: 0 })!;
    const notch: InternalLine = {
      id: 'n1', type: 'notch',
      path: generateNotchPath({ x: 100, y: 0 }, { x: 0, y: 1 }, DEFAULT_NOTCH_OPTIONS),
      notchOptions: DEFAULT_NOTCH_OPTIONS,
      notchAnchor: anchor,
    };
    return { ...piece(), internals: [notch] } as PatternPiece;
  }
  function setup(p: PatternPiece) {
    const store = configureStore({ reducer: { project: projectReducer } });
    store.dispatch(restoreState({ ...store.getState().project, pieces: [p] }));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const hook = renderHook(() => useEditPattern(1, { x: 0, y: 0 }), { wrapper });
    return { store, hook };
  }
  function clickAt(x: number, y: number) {
    return {
      button: 0, shiftKey: false, clientX: x, clientY: y,
      currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    } as unknown as React.MouseEvent<SVGSVGElement>;
  }

  it('recomputes the notch path when a corner of its edge is dragged', () => {
    const { store, hook } = setup(notchedPiece());
    const before = (store.getState() as { project: { pieces: PatternPiece[] } }).project.pieces[0].internals[0].path;
    act(() => hook.result.current.enterEdit('p'));
    // Drag node 1 (200,0) up to (200,-50), reshaping the bottom edge.
    act(() => { hook.result.current.handleMouseDown(clickAt(200, 0)); });
    act(() => { hook.result.current.handleMouseMove(clickAt(200, -50)); });
    act(() => hook.result.current.handleMouseUp());
    const after = (store.getState() as { project: { pieces: PatternPiece[] } }).project.pieces[0].internals[0].path;
    expect(JSON.stringify(after)).not.toEqual(JSON.stringify(before));
  });

  it('follows the notch when the dragged node IS its reference corner', () => {
    // The notch is anchored to (0,0). Dragging that very corner used to strand
    // it — the anchor matched by coordinates and found nothing.
    const { store, hook } = setup(notchedPiece());
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(clickAt(0, 0)); });
    act(() => { hook.result.current.handleMouseMove(clickAt(-40, -40)); });
    act(() => hook.result.current.handleMouseUp());

    const notch = (store.getState() as { project: { pieces: PatternPiece[] } }).project.pieces[0].internals[0];
    expect(notch.notchAnchor!.refPoint).toEqual({ x: -40, y: -40 });
    // Still 100 along the reshaped bottom edge from the corner it names.
    const edgeLen = Math.hypot(240, 40);
    expect(notch.path[0].values[0]).toBeCloseTo(-40 + (100 / edgeLen) * 240);
    expect(notch.path[0].values[1]).toBeCloseTo(-40 + (100 / edgeLen) * 40);
  });
});

// ─── Hook: resync after undo (restoreState) ───

describe('useEditPattern resync after restoreState', () => {
  function setup(initialPieces: PatternPiece[]) {
    const store = configureStore({ reducer: { project: projectReducer } });
    store.dispatch(restoreState({ ...store.getState().project, pieces: initialPieces }));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const hook = renderHook(() => useEditPattern(1, { x: 0, y: 0 }), { wrapper });
    return { store, hook };
  }

  // zoom=1, pan=0, rect at origin → pattern point === client point.
  function clickAt(x: number, y: number) {
    return {
      button: 0,
      shiftKey: false,
      clientX: x,
      clientY: y,
      currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    } as unknown as React.MouseEvent<SVGSVGElement>;
  }

  const reverted = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [150, 0] },
    { type: 'L', values: [200, 200] },
    { type: 'L', values: [0, 200] },
    { type: 'Z', values: [] },
  ] as PatternPiece['outline'];

  function undoTo(store: ReturnType<typeof configureStore>, pieces: PatternPiece[]) {
    store.dispatch(restoreState({ ...(store.getState() as { project: object }).project, pieces }));
  }

  it('re-extracts overlay nodes when the edited outline is reverted externally (Ctrl+Z)', () => {
    const { store, hook } = setup([piece()]);
    act(() => hook.result.current.enterEdit('p'));
    expect(hook.result.current.nodes[1].position).toEqual({ x: 200, y: 0 });

    act(() => undoTo(store, [piece(reverted)]));

    expect(hook.result.current.nodes[1].position).toEqual({ x: 150, y: 0 });
  });

  it('clears the selection when the outline changes externally', () => {
    const { store, hook } = setup([piece()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(clickAt(200, 0)); });
    act(() => hook.result.current.handleMouseUp());
    expect([...hook.result.current.selectedNodes]).toEqual([1]);

    act(() => undoTo(store, [piece(reverted)]));

    expect(hook.result.current.selectedNodes.size).toBe(0);
  });

  it('keeps the selection across the hook’s own edits (dragging must not deselect)', () => {
    const { hook } = setup([piece()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(clickAt(200, 0)); });
    act(() => { hook.result.current.handleMouseMove(clickAt(210, 0)); });
    act(() => hook.result.current.handleMouseUp());
    expect([...hook.result.current.selectedNodes]).toEqual([1]);
  });

  it('resyncs when an internal edit and an external restore land in the same React batch', () => {
    const { store, hook } = setup([piece()]);
    act(() => hook.result.current.enterEdit('p'));

    act(() => {
      // Internal edit (double-click inserts a point at (100,0))…
      hook.result.current.handleDoubleClick(clickAt(100, 0));
      // …and an external restore, before the resync effect gets to run.
      undoTo(store, [piece(reverted)]);
    });

    // The external outline must win: 4 anchors, node 1 at the reverted spot.
    expect(hook.result.current.nodes).toHaveLength(4);
    expect(hook.result.current.nodes[1].position).toEqual({ x: 150, y: 0 });
  });

  it('cancels an in-flight drag when the outline is reverted externally', () => {
    const { store, hook } = setup([piece()]);
    act(() => hook.result.current.enterEdit('p'));
    // Grab node 1 at (200,0); mouse stays down.
    act(() => { hook.result.current.handleMouseDown(clickAt(200, 0)); });

    act(() => undoTo(store, [piece(reverted)]));

    // The next mousemove must NOT re-impose pre-undo geometry.
    act(() => { hook.result.current.handleMouseMove(clickAt(210, 0)); });
    const outline = (store.getState() as { project: { pieces: PatternPiece[] } }).project.pieces[0].outline;
    expect(outline[1].values).toEqual([150, 0]);
  });

  it('exits edit mode when the edited piece disappears (undo past creation)', () => {
    const { store, hook } = setup([piece()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => undoTo(store, []));
    expect(hook.result.current.isEditing).toBe(false);
  });
});

/**
 * maria-218 — "cuando he creado un punto, clicando en la linea de la pieza, se
 * crea automáticamente el nuevo punto pero tambien aparece como un marco con
 * los mismos puntos de la pieza pero trasladados en otro sitio, como si fuera
 * un eco."
 *
 * Los fantasmas de su foto son glifos `bezierAnchor` — círculos huecos con halo
 * blanco — flotando sobre lona vacía, lejos de cualquier pieza.
 *
 * De dónde salen: los verbos de este hook aceptan un `pieceId` explícito
 * "para callers fuera del modo edición" (el tool Punto es uno). Pero
 * `dispatchAndRefresh` pisaba `state.nodes` con las anclas de LA PIEZA QUE
 * TOCÓ EL VERBO, sin mirar cuál se está editando. Con "Editar patrón" abierto
 * sobre la pieza A y un punto puesto sobre la pieza B, el overlay quedaba con
 * las anclas de B y la posición de A: las coordenadas locales de una pieza
 * pintadas en el sitio de otra. Eso es exactamente "los mismos puntos de la
 * pieza pero trasladados en otro sitio".
 *
 * No es el #194 otra vez: aquel era el arrastre (posición de Redux contra
 * transform de DOM) y se cerró escondiendo las anclas mientras dura. Este no
 * necesita ningún arrastre.
 */
describe('maria-218 — un verbo sobre otra pieza no reescribe las anclas del overlay', () => {
  const otherOutline = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [50, 0] },
    { type: 'L', values: [50, 40] },
    { type: 'L', values: [0, 40] },
    { type: 'Z', values: [] },
  ] as PatternPiece['outline'];

  function twoPieces() {
    const a = piece();                                    // 'p' en (0,0), 200x200
    const b = {
      ...piece(otherOutline),
      id: 'q',
      name: 'Otra',
      position: { x: 400, y: 300 },
    } as PatternPiece;
    const store = configureStore({ reducer: { project: projectReducer } });
    store.dispatch(restoreState({ ...store.getState().project, pieces: [a, b] }));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const hook = renderHook(() => useEditPattern(1, { x: 0, y: 0 }), { wrapper });
    return { store, hook };
  }

  it('addPointOnSegment sobre otra pieza deja intactas las anclas de la que se edita', () => {
    const { hook } = twoPieces();
    act(() => hook.result.current.enterEdit('p'));
    const antes = hook.result.current.nodes.map(n => ({ ...n.position }));
    expect(antes).toHaveLength(4);

    act(() => hook.result.current.addPointOnSegment(1, 0.5, 'q'));

    expect(hook.result.current.editingPieceId).toBe('p');
    expect(hook.result.current.nodes.map(n => ({ ...n.position }))).toEqual(antes);
  });

  it('pero el punto SÍ se crea en la otra pieza', () => {
    const { store, hook } = twoPieces();
    act(() => hook.result.current.enterEdit('p'));
    act(() => hook.result.current.addPointOnSegment(1, 0.5, 'q'));
    const pieces = (store.getState() as { project: { pieces: PatternPiece[] } }).project.pieces;
    expect(pieces.find(p => p.id === 'q')!.outline).toHaveLength(6);
    expect(pieces.find(p => p.id === 'p')!.outline).toHaveLength(5);
  });

  it('convertSegmentToPoints sobre otra pieza tampoco las toca', () => {
    const { hook } = twoPieces();
    act(() => hook.result.current.enterEdit('p'));
    const antes = hook.result.current.nodes.map(n => ({ ...n.position }));

    act(() => hook.result.current.convertSegmentToPoints(1, 'q'));

    expect(hook.result.current.nodes.map(n => ({ ...n.position }))).toEqual(antes);
  });

  it('sobre la pieza que SÍ se edita, las anclas se refrescan como siempre', () => {
    const { hook } = twoPieces();
    act(() => hook.result.current.enterEdit('p'));
    expect(hook.result.current.nodes).toHaveLength(4);

    act(() => hook.result.current.addPointOnSegment(1, 0.5, 'p'));

    expect(hook.result.current.nodes).toHaveLength(5);
  });
});
