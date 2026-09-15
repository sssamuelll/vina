import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PatternPiece, PathCommand, Point2D } from '../../../types/types';
import type { OutlineHit } from '../../../utils/geometry/slashAndSpread';
import {
  INITIAL_STATE,
  transitionMouseDown,
  transitionMouseMove,
  transitionMouseUp,
  transitionKeyDown,
  type SlashAndSpreadState,
  type SlashAndSpreadPhase,
} from '../useSlashAndSpreadTool';
import { suscribirNoPasoNada } from '../noPasoNada';

// ─── Test Fixtures ─────────────────────────────────────────────────────────

const squareOutline: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

const squarePiece: PatternPiece = {
  id: 'piece-1',
  name: 'Square',
  outline: squareOutline,
  internals: [],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

const hit1: OutlineHit = {
  commandIndex: 1,
  t: 0.5,
  point: { x: 50, y: 0 },
};

const hit2: OutlineHit = {
  commandIndex: 3,
  t: 0.5,
  point: { x: 50, y: 100 },
};

const halfA: PathCommand[] = [
  { type: 'M', values: [50, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [50, 100] },
  { type: 'L', values: [50, 0] },
  { type: 'Z', values: [] },
];

const halfB: PathCommand[] = [
  { type: 'M', values: [50, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'L', values: [0, 0] },
  { type: 'L', values: [50, 0] },
  { type: 'L', values: [50, 100] },
  { type: 'Z', values: [] },
];

// ─── Mock Geometry Functions ───────────────────────────────────────────────

vi.mock('../../../utils/geometry/slashAndSpread', () => ({
  findSlashIntersections: vi.fn(() => [hit1, hit2]),
  splitOutlineAtSlash: vi.fn(() => ({
    halfA,
    halfB,
    splitMap: {
      halfAIndices: [-1, 0, 1, 2, -1, -1],
      halfBIndices: [-1, 3, 4, 5, -1, -1],
      hit1,
      hit2,
    },
  })),
  pointInPolygon: vi.fn((pt: Point2D, polygon: PathCommand[]) => {
    // Simple mock: if polygon starts at (50,0) it's halfA (right side)
    // Point to the right of x=50 → halfA, left of x=50 → halfB
    const isHalfA = polygon[0].values[0] === 50 && polygon[0].values[1] === 0;
    if (isHalfA) return pt.x > 50;
    return pt.x < 50;
  }),
  buildSpreadPiece: vi.fn(() => ({
    ...squarePiece,
    id: squarePiece.id,
    name: squarePiece.name,
    outline: squareOutline,
    updatedAt: Date.now(),
  })),
}));

// ─── Helper ────────────────────────────────────────────────────────────────

function makeCtx(overrides: {
  pieces?: PatternPiece[];
  selectedPieceIds?: string[];
  toolOptions?: Record<string, unknown>;
  layerLocked?: Record<number, boolean>;
} = {}) {
  return {
    pieces: overrides.pieces ?? [squarePiece],
    selectedPieceIds: overrides.selectedPieceIds ?? ['piece-1'],
    toolOptions: overrides.toolOptions ?? { mode: 'pivot', gapFill: 'straight' },
    zoom2D: 1,
    pan2D: { x: 0, y: 0 } as Point2D,
    layerLocked: overrides.layerLocked ?? {},
  };
}

/** Simulate a snap that falls on the piece outline. */
function snapPt(x: number, y: number): Point2D {
  return { x, y };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('useSlashAndSpreadTool state machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Initial state ──────────────────────────────────────────────────

  it('initial state is idle with all nulls', () => {
    expect(INITIAL_STATE.phase).toBe('idle');
    expect(INITIAL_STATE.targetPieceId).toBeNull();
    expect(INITIAL_STATE.startPoint).toBeNull();
    expect(INITIAL_STATE.endPoint).toBeNull();
    expect(INITIAL_STATE.hit1).toBeNull();
    expect(INITIAL_STATE.hit2).toBeNull();
    expect(INITIAL_STATE.halfA).toBeNull();
    expect(INITIAL_STATE.halfB).toBeNull();
    expect(INITIAL_STATE.selectedHalf).toBeNull();
    expect(INITIAL_STATE.pivotPoint).toBeNull();
    expect(INITIAL_STATE.pivotEnd).toBeNull();
    expect(INITIAL_STATE.spreadAmount).toBe(0);
    expect(INITIAL_STATE.previewPiece).toBeNull();
    expect(INITIAL_STATE.hoveredHalf).toBeNull();
    expect(INITIAL_STATE.error).toBeNull();
  });

  // ── 2. idle → drawingSlash ─────────────────────────────────────────

  it('click on piece outline transitions idle → drawingSlash', () => {
    const ctx = makeCtx();
    const pt = snapPt(50, 0); // on top edge
    const result = transitionMouseDown(INITIAL_STATE, pt, ctx);

    expect(result.phase).toBe('drawingSlash');
    expect(result.targetPieceId).toBe('piece-1');
    expect(result.startPoint).toEqual(pt);
    expect(result.error).toBeNull();
  });

  it('click far from outline in idle → stays idle with target set', () => {
    const ctx = makeCtx();
    // Point at center, far from outline
    const pt = snapPt(50, 50);
    const result = transitionMouseDown(INITIAL_STATE, pt, ctx);

    // targetPieceId is set because piece is selected, but no startPoint
    expect(result.targetPieceId).toBe('piece-1');
    expect(result.startPoint).toBeNull();
    expect(result.phase).toBe('idle');
  });

  // ── 2b. #1145 (mitad ALTA) — el candado no deja targetear la pieza ──
  //
  // Abrir (Corte y apertura) reemplaza el contorno entero con las dos mitades
  // recompuestas: es la escritura más destructiva de las cuatro. El candado
  // se leía para pintar y no para escribir (mismo mecanismo que #1136).
  //
  // El guardia vive en `idle`, el único punto donde una pieza se vuelve
  // `targetPieceId`: si no entra ahí, ninguna fase posterior puede escribir.

  it('con el candado de la pieza, el clic no la vuelve objetivo', () => {
    const ctx = makeCtx({ pieces: [{ ...squarePiece, locked: true }] });
    const pt = snapPt(50, 0); // sobre el borde de arriba
    const result = transitionMouseDown(INITIAL_STATE, pt, ctx);

    expect(result.phase).toBe('idle');
    expect(result.targetPieceId).toBeNull();
  });

  it('con el candado de la capa, tampoco', () => {
    const ctx = makeCtx({
      pieces: [{ ...squarePiece, layer: 3 }],
      layerLocked: { 3: true },
    });
    const pt = snapPt(50, 0);
    const result = transitionMouseDown(INITIAL_STATE, pt, ctx);

    expect(result.phase).toBe('idle');
    expect(result.targetPieceId).toBeNull();
  });

  it('el rechazo se dice, no muere en silencio', () => {
    const avisos: string[] = [];
    const cancelar = suscribirNoPasoNada(a => avisos.push(a.razon));
    const ctx = makeCtx({ pieces: [{ ...squarePiece, locked: true }] });
    transitionMouseDown(INITIAL_STATE, snapPt(50, 0), ctx);
    cancelar();
    expect(avisos).toContain('abrir:pieza-bloqueada');
  });

  it('CONTROL: sin candado, el mismo clic sí la vuelve objetivo', () => {
    const ctx = makeCtx();
    const result = transitionMouseDown(INITIAL_STATE, snapPt(50, 0), ctx);
    expect(result.targetPieceId).toBe('piece-1');
    expect(result.phase).toBe('drawingSlash');
  });

  // ── 3. drawingSlash → slashComplete (or error) ────────────────────

  it('second click on outline → slashComplete with valid intersections', () => {
    const ctx = makeCtx();
    const stateAfterFirst: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'drawingSlash',
      targetPieceId: 'piece-1',
      startPoint: { x: 50, y: 0 },
    };

    const pt = snapPt(50, 100); // on bottom edge
    const result = transitionMouseDown(stateAfterFirst, pt, ctx);

    expect(result.phase).toBe('slashComplete');
    expect(result.endPoint).toEqual(pt);
    expect(result.hit1).toEqual(hit1);
    expect(result.hit2).toEqual(hit2);
    expect(result.halfA).toEqual(halfA);
    expect(result.halfB).toEqual(halfB);
    expect(result.error).toBeNull();
  });

  it('second click with intersection error → stays drawingSlash with error', async () => {
    // Override mock to throw
    const { findSlashIntersections } = await import('../../../utils/geometry/slashAndSpread');
    vi.mocked(findSlashIntersections).mockImplementationOnce(() => {
      throw new Error('Slash line must intersect the outline at exactly 2 points');
    });

    const ctx = makeCtx();
    const stateAfterFirst: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'drawingSlash',
      targetPieceId: 'piece-1',
      startPoint: { x: 50, y: 0 },
    };

    const pt = snapPt(10, 10); // bad slash
    const result = transitionMouseDown(stateAfterFirst, pt, ctx);

    expect(result.phase).toBe('drawingSlash');
    expect(result.error).toContain('intersect');
  });

  // ── 4. slashComplete → selectingHalf ──────────────────────────────

  it('click on a half → selectingHalf', () => {
    const ctx = makeCtx();
    const stateSlashComplete: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'slashComplete',
      targetPieceId: 'piece-1',
      startPoint: { x: 50, y: 0 },
      endPoint: { x: 50, y: 100 },
      hit1,
      hit2,
      halfA,
      halfB,
    };

    // Click in halfA (right side, x > 50)
    const pt = snapPt(75, 50);
    const result = transitionMouseDown(stateSlashComplete, pt, ctx);

    expect(result.phase).toBe('selectingHalf');
    expect(result.selectedHalf).toBe('A');
  });

  // ── 5. selectingHalf → halfConfirmed ──────────────────────────────

  it('click again on same half → halfConfirmed', () => {
    const ctx = makeCtx();
    const state: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'selectingHalf',
      targetPieceId: 'piece-1',
      startPoint: { x: 50, y: 0 },
      endPoint: { x: 50, y: 100 },
      hit1,
      hit2,
      halfA,
      halfB,
      selectedHalf: 'A',
    };

    const pt = snapPt(75, 50);
    const result = transitionMouseDown(state, pt, ctx);

    expect(result.phase).toBe('halfConfirmed');
  });

  // ── 6. halfConfirmed → awaitingDrag ───────────────────────────────

  it('click near hit1 → awaitingDrag with pivot at start', () => {
    const ctx = makeCtx();
    const state: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'halfConfirmed',
      targetPieceId: 'piece-1',
      startPoint: { x: 50, y: 0 },
      endPoint: { x: 50, y: 100 },
      hit1,
      hit2,
      halfA,
      halfB,
      selectedHalf: 'A',
    };

    // Click near hit1 (50, 0)
    const pt = snapPt(51, 1);
    const result = transitionMouseDown(state, pt, ctx);

    expect(result.phase).toBe('awaitingDrag');
    expect(result.pivotPoint).toEqual(hit1.point);
    expect(result.pivotEnd).toBe('start');
  });

  it('click near hit2 → awaitingDrag with pivot at end', () => {
    const ctx = makeCtx();
    const state: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'halfConfirmed',
      targetPieceId: 'piece-1',
      startPoint: { x: 50, y: 0 },
      endPoint: { x: 50, y: 100 },
      hit1,
      hit2,
      halfA,
      halfB,
      selectedHalf: 'A',
    };

    // Click near hit2 (50, 100)
    const pt = snapPt(51, 99);
    const result = transitionMouseDown(state, pt, ctx);

    expect(result.phase).toBe('awaitingDrag');
    expect(result.pivotPoint).toEqual(hit2.point);
    expect(result.pivotEnd).toBe('end');
  });

  // ── 7. awaitingDrag → spreading (via mouse move) ─────────────────

  it('mouse move in awaitingDrag → spreading with preview', () => {
    const ctx = makeCtx();
    const state: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'awaitingDrag',
      targetPieceId: 'piece-1',
      startPoint: { x: 50, y: 0 },
      endPoint: { x: 50, y: 100 },
      hit1,
      hit2,
      halfA,
      halfB,
      selectedHalf: 'A',
      pivotPoint: hit1.point,
      pivotEnd: 'start',
    };

    const pt = snapPt(80, 30);
    const result = transitionMouseMove(state, pt, ctx);

    expect(result.phase).toBe('spreading');
    expect(result.spreadAmount).not.toBe(0);
    expect(result.previewPiece).toBeTruthy();
  });

  // ── 8. spreading → spreadPreview (mouse up) ──────────────────────

  it('mouse up in spreading → spreadPreview', () => {
    const state: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'spreading',
      targetPieceId: 'piece-1',
      startPoint: { x: 50, y: 0 },
      endPoint: { x: 50, y: 100 },
      hit1,
      hit2,
      halfA,
      halfB,
      selectedHalf: 'A',
      pivotPoint: hit1.point,
      pivotEnd: 'start',
      spreadAmount: 15,
      previewPiece: squarePiece,
    };

    const result = transitionMouseUp(state);

    expect(result.phase).toBe('spreadPreview');
  });

  // ── 9. Escape at any phase → idle ─────────────────────────────────

  describe('Escape resets to idle', () => {
    const phases: SlashAndSpreadPhase[] = [
      'drawingSlash',
      'slashComplete',
      'selectingHalf',
      'halfConfirmed',
      'awaitingDrag',
      'spreading',
    ];

    for (const phase of phases) {
      it(`Escape in ${phase} → idle`, () => {
        const state: SlashAndSpreadState = {
          ...INITIAL_STATE,
          phase,
          targetPieceId: 'piece-1',
        };

        const result = transitionKeyDown(state, 'Escape');

        expect(result.phase).toBe('idle');
        expect(result.targetPieceId).toBeNull();
      });
    }
  });

  // ── 10. spreadPreview: Escape → awaitingDrag ──────────────────────

  it('Escape in spreadPreview → awaitingDrag (discard preview)', () => {
    const state: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'spreadPreview',
      targetPieceId: 'piece-1',
      startPoint: { x: 50, y: 0 },
      endPoint: { x: 50, y: 100 },
      hit1,
      hit2,
      halfA,
      halfB,
      selectedHalf: 'A',
      pivotPoint: hit1.point,
      pivotEnd: 'start',
      spreadAmount: 15,
      previewPiece: squarePiece,
    };

    const result = transitionKeyDown(state, 'Escape');

    expect(result.phase).toBe('awaitingDrag');
    expect(result.previewPiece).toBeNull();
    expect(result.spreadAmount).toBe(0);
  });

  // ── 11. spreadPreview: Enter → returns 'apply' signal ─────────────

  it('Enter in spreadPreview → signals apply', () => {
    const state: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'spreadPreview',
      targetPieceId: 'piece-1',
      startPoint: { x: 50, y: 0 },
      endPoint: { x: 50, y: 100 },
      hit1,
      hit2,
      halfA,
      halfB,
      selectedHalf: 'A',
      pivotPoint: hit1.point,
      pivotEnd: 'start',
      spreadAmount: 15,
      previewPiece: squarePiece,
    };

    const result = transitionKeyDown(state, 'Enter');

    // The state machine returns INITIAL_STATE (reset) + a signal to apply
    expect(result.phase).toBe('idle');
    // The apply action is communicated via _applyPiece
    expect(result._applyPiece).toBe(squarePiece);
  });

  // ── 12. drawingSlash mouse move → updates live endpoint ───────────

  it('mouse move in drawingSlash → updates endPoint for preview', () => {
    const ctx = makeCtx();
    const state: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'drawingSlash',
      targetPieceId: 'piece-1',
      startPoint: { x: 50, y: 0 },
    };

    const pt = snapPt(50, 60);
    const result = transitionMouseMove(state, pt, ctx);

    expect(result.endPoint).toEqual(pt);
    expect(result.phase).toBe('drawingSlash');
  });

  // ── 13. slashComplete mouse move → updates hoveredHalf ────────────

  it('mouse move in slashComplete → updates hoveredHalf', () => {
    const ctx = makeCtx();
    const state: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'slashComplete',
      targetPieceId: 'piece-1',
      startPoint: { x: 50, y: 0 },
      endPoint: { x: 50, y: 100 },
      hit1,
      hit2,
      halfA,
      halfB,
    };

    // Move to right side → halfA
    const ptA = snapPt(75, 50);
    const resultA = transitionMouseMove(state, ptA, ctx);
    expect(resultA.hoveredHalf).toBe('A');

    // Move to left side → halfB
    const ptB = snapPt(25, 50);
    const resultB = transitionMouseMove(state, ptB, ctx);
    expect(resultB.hoveredHalf).toBe('B');
  });

  // ── 14. Tab in halfConfirmed toggles mode signal ──────────────────

  it('Tab returns toggle-mode signal', () => {
    const state: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'halfConfirmed',
      targetPieceId: 'piece-1',
    };

    const result = transitionKeyDown(state, 'Tab');

    expect(result._toggleMode).toBe(true);
  });

  // ── 15. mouse move in idle → no change ────────────────────────────

  it('mouse move in idle → no state change', () => {
    const ctx = makeCtx();
    const pt = snapPt(50, 50);
    const result = transitionMouseMove(INITIAL_STATE, pt, ctx);

    expect(result.phase).toBe('idle');
  });

  // ── 16. mouse up in non-spreading phase → no change ───────────────

  it('mouse up in awaitingDrag → no state change', () => {
    const state: SlashAndSpreadState = {
      ...INITIAL_STATE,
      phase: 'awaitingDrag',
    };

    const result = transitionMouseUp(state);

    expect(result.phase).toBe('awaitingDrag');
  });
});
