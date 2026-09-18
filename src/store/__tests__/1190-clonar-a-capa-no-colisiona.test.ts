// Hermano de #1190, encontrado grepeando el MECANISMO y no el síntoma.
//
// `cloneToLayer` (`projectSlice.ts:1300`) arrastra el mismo `Date.now()` con
// el mismo comentario textual que tenía el offset, y el fallo entero se
// repite: el reducer hace `push` sin deduplicar, `removePiece` filtra por id
// (`p.id !== id`) y por tanto borra TODOS los que coincidan junto con sus
// costuras, y `layerTools.ts:118` arma su `rollback` con `removePiece(clone.id)`.
// Dos clones de la misma pieza en el mismo milisegundo → deshacer uno borra
// los dos.
//
// `duplicatePiece` (`projectSlice.ts:619`) ya usaba `newId()`: `cloneToLayer`
// era el último de la familia sin migrar.
import { describe, it, expect, vi } from 'vitest';
import reducer, { cloneToLayer, removePiece } from '../projectSlice';
import type { PatternPiece } from '../../types/types';

const outline: PatternPiece['outline'] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
];

type Estado = ReturnType<typeof reducer>;

function conPieza(): Estado {
  const base = reducer(undefined, { type: '@@INIT' });
  const piece = {
    id: 'p1', name: 'p1', outline, internals: [], position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, seamAllowance: 10, layer: 1, createdAt: 0, updatedAt: 0,
  } as unknown as PatternPiece;
  return { ...base, pieces: [piece] };
}

const piezas = (estado: Estado) => estado.pieces as PatternPiece[];

describe('#1190 (hermano) — clonar a otra capa', () => {
  it('dos clones de la misma pieza en el mismo milisegundo dan ids distintos', () => {
    vi.useFakeTimers();
    try {
      let estado = conPieza();
      estado = reducer(estado, cloneToLayer({ pieceId: 'p1', direction: 'over' }));
      estado = reducer(estado, cloneToLayer({ pieceId: 'p1', direction: 'under' }));

      const clones = piezas(estado).filter(p => p.id !== 'p1');
      expect(clones).toHaveLength(2);
      expect(clones[0].id).not.toBe(clones[1].id);
    } finally {
      vi.useRealTimers();
    }
  });

  it('deshacer un clon no se lleva al otro por delante', () => {
    vi.useFakeTimers();
    try {
      let estado = conPieza();
      estado = reducer(estado, cloneToLayer({ pieceId: 'p1', direction: 'over' }));
      estado = reducer(estado, cloneToLayer({ pieceId: 'p1', direction: 'under' }));

      const unClon = piezas(estado).find(p => p.id !== 'p1')!;
      estado = reducer(estado, removePiece(unClon.id));

      // El rollback de layerTools es exactamente este removePiece: tiene que
      // dejar la pieza original y el OTRO clon en pie.
      const despues = piezas(estado);
      expect(despues).toHaveLength(2);
      expect(despues.some(p => p.id === 'p1')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('CONTROL: el id del clon sigue referenciando al padre (convención B10-state)', () => {
    let estado = conPieza();
    estado = reducer(estado, cloneToLayer({ pieceId: 'p1', direction: 'over' }));

    const clon = piezas(estado).find(p => p.id !== 'p1')!;
    expect(clon.id).toMatch(/^p1-clone-/);
  });
});
