// #1190 — `offset-${piece.id}-${Date.now()}` colisiona con resolución de
// milisegundo. Dos offsets de la misma pieza dentro del mismo ms producen el
// MISMO id; `addPiece` no deduplica (projectSlice.ts:400, hace push), y el
// `rollback` filtra por id, así que deshacer uno borra los dos y se lleva las
// costuras de ambos.
//
// El comentario de al lado lo marca `// state-encoded ID — see B10-state`: el
// id del padre se referencia a propósito, así que el arreglo conserva el
// prefijo legible y solo le cambia la cola por `newId()`.
//
// Salió de la revisión adversarial de PR #1188, donde la sonda lo produjo sin
// buscarlo (`offset-p-1789730567228` dos veces).
import { describe, it, expect, vi } from 'vitest';
import { tools } from '../patternOpsTools';
import type { AppDispatch, RootState } from '../../../../../store';
import type { PatternPiece } from '../../../../../types/types';

const outline: PatternPiece['outline'] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
];

function estadoConPieza(): RootState {
  const piece = {
    id: 'p', name: 'p', outline, internals: [], position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, seamAllowance: 10, createdAt: 0, updatedAt: 0,
  } as unknown as PatternPiece;
  return { project: { id: 't', name: 't', pieces: [piece], seams: [], fabrics: [], layerLocked: {} } } as unknown as RootState;
}

const offsetPattern = tools.find(t => t.name === 'offsetPattern')!;

describe('#1190 — el id de la pieza derivada del offset', () => {
  it('dos offsets de la misma pieza en el mismo milisegundo dan ids distintos', async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    // El reloj congelado ES el caso: `Date.now()` devuelve lo mismo a las dos.
    vi.useFakeTimers();
    try {
      const a = await offsetPattern.execute({ pieceId: 'p', distance: 10 }, dispatch, estadoConPieza);
      const b = await offsetPattern.execute({ pieceId: 'p', distance: 20 }, dispatch, estadoConPieza);

      expect(a.success).toBe(true);
      expect(b.success).toBe(true);
      expect(a.data?.pieceId).not.toBe(b.data?.pieceId);
    } finally {
      vi.useRealTimers();
    }
  });

  it('CONTROL: el id sigue referenciando al padre (convención B10-state)', async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;

    const a = await offsetPattern.execute({ pieceId: 'p', distance: 10 }, dispatch, estadoConPieza);

    expect(String(a.data?.pieceId)).toMatch(/^offset-p-/);
  });
});
