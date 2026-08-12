import { describe, it, expect } from 'vitest';
import { seamsOnEdge, nextSeamOnEdge } from '../seamEdgeLookup';
import type { Seam } from '../../../types/types';

const seam = (id: string, a: [string, string], b: [string, string]): Seam => ({
  id,
  pieceA: { pieceId: a[0], edgeName: a[1] },
  pieceB: { pieceId: b[0], edgeName: b[1] },
  type: 'standard',
  tension: 100,
  strength: 1,
  active: true,
  taped: false,
  tapeWidth: 10,
});

const s1 = seam('s1', ['pA', 'sideSeam'], ['pB', 'sideSeam']);
const s2 = seam('s2', ['pA', 'armhole'], ['pC', 'sleeveCap']);
const s3 = seam('s3', ['pD', 'armhole'], ['pA', 'armhole']); // pA/armhole otra vez, del lado B

describe('seamsOnEdge', () => {
  it('encuentra la costura por la mitad A', () => {
    expect(seamsOnEdge([s1, s2, s3], 'pA', 'sideSeam').map(s => s.id)).toEqual(['s1']);
  });

  it('encuentra la costura por la mitad B', () => {
    expect(seamsOnEdge([s1, s2, s3], 'pB', 'sideSeam').map(s => s.id)).toEqual(['s1']);
  });

  it('devuelve TODAS las costuras de un borde que lleva varias', () => {
    expect(seamsOnEdge([s1, s2, s3], 'pA', 'armhole').map(s => s.id)).toEqual(['s2', 's3']);
  });

  it('un borde libre no devuelve nada', () => {
    expect(seamsOnEdge([s1, s2, s3], 'pA', 'neckline')).toEqual([]);
  });

  it('no confunde piezas distintas con el mismo nombre de borde', () => {
    expect(seamsOnEdge([s1, s2, s3], 'pZ', 'sideSeam')).toEqual([]);
  });
});

describe('nextSeamOnEdge', () => {
  it('sin selección previa devuelve la primera', () => {
    expect(nextSeamOnEdge([s2, s3], null)?.id).toBe('s2');
  });

  it('cicla a la siguiente', () => {
    expect(nextSeamOnEdge([s2, s3], 's2')?.id).toBe('s3');
  });

  it('desde la última vuelve a la primera', () => {
    expect(nextSeamOnEdge([s2, s3], 's3')?.id).toBe('s2');
  });

  it('si la seleccionada no está en la lista, empieza por la primera', () => {
    expect(nextSeamOnEdge([s2, s3], 's1')?.id).toBe('s2');
  });

  it('lista vacía devuelve null', () => {
    expect(nextSeamOnEdge([], null)).toBeNull();
  });
});
