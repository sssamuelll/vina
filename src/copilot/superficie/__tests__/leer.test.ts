import { describe, it, expect } from 'vitest';
import { ejecutarVerbo } from '../ejecutar';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../../../utils/notches';
import type { InternalLine, NotchOptions } from '../../../types/types';
import { VERBOS_DE_LEER } from '../verbos/leer';
import { camisaDeMaria, contexto, costura, pieza, piquete } from './fixtures';

/** Lo que estos tests leen de las respuestas: el resto se compara con `toMatchObject`. */
interface Patron {
  revision: number;
  pieces: Array<{ category: string | null; side: string | null; locked: boolean; edges: Array<{ name: string; length: number }>; notches: unknown[] }>;
  seams: Array<{ a: { length: number }; b: { length: number } }>;
}
interface Pieza {
  points: unknown[];
  edges: Array<{ name: string }>;
}

/** Leer (spec 2026-10-05 § 5.1): todo lo que hay, con números medidos en el momento. */
const leer = async <T>(nombre: string, args: unknown, ctx: ReturnType<typeof contexto>): Promise<T> => {
  const r = await ejecutarVerbo(VERBOS_DE_LEER, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as T;
};

describe('read_pattern', () => {
  it('mide los bordes en el momento: un largo guardado viejo no se lee', async () => {
    const a = pieza('a', [50, 80, 100]);
    a.edges![0] = { ...a.edges![0], length: 999 };
    const r = await leer<Patron>('read_pattern', {}, contexto([a]));
    expect(r.pieces[0].edges.find(e => e.name === 'top')?.length).toBe(100);
  });
  it('trae ancho, alto, área y si está bloqueada, por la pieza o por su capa', async () => {
    const r = await leer<Patron>('read_pattern', {}, contexto(
      [pieza('a', [100]), pieza('b', [100], { layer: 2 }), pieza('c', [100], { locked: true })], [], { 2: true },
    ));
    expect(r.pieces[0]).toMatchObject({ width: 100, height: 50, area: 5000, locked: false });
    expect(r.pieces[1].locked).toBe(true);
    expect(r.pieces[2].locked).toBe(true);
  });
  it('mide cada costura por sus dos lados y dice si camina', async () => {
    const r = await leer<Patron>('read_pattern', {}, contexto([pieza('a', [50, 80, 100]), pieza('b', [20, 50, 110])], [costura()]));
    expect(r.seams[0]).toMatchObject({ id: 's1', a: { length: 100 }, b: { length: 110 }, delta: 10, walks: false, band: 'red' });
  });
  it('un piquete dice en qué borde está y a qué distancia de su inicio', async () => {
    const r = await leer<Patron>('read_pattern', {}, contexto([pieza('a', [100], { internals: [piquete('n1', 30)] })]));
    expect(r.pieces[0].notches[0]).toMatchObject({ id: 'n1', edge: 'top', distance_from_edge_start: 30, anchor: null });
  });
  it('un piquete en V, en U, en castillo o doble se mide por su centro, no por el primer punto de su trazo', async () => {
    const forma = (id: string, o: Partial<NotchOptions>): InternalLine => ({
      id, type: 'notch', path: generateNotchPath({ x: 30, y: 0 }, { x: 0, y: 1 }, { ...DEFAULT_NOTCH_OPTIONS, ...o }),
    });
    const internas = [
      forma('v', { shape: 'v-internal' }), forma('u', { shape: 'u-notch' }), forma('castillo', { shape: 'castle' }),
      forma('doble', { count: 2 }), forma('triple', { count: 3, width: 4 }),
    ];
    const r = await leer<Patron>('read_pattern', {}, contexto([pieza('a', [100], { internals: internas })]));
    for (const n of r.pieces[0].notches as Array<{ id: string; edge: string; distance_from_edge_start: number }>) {
      expect({ id: n.id, edge: n.edge, d: n.distance_from_edge_start }).toEqual({ id: n.id, edge: 'top', d: 30 });
    }
  });
  it('trae la revisión del proyecto', async () => {
    expect(typeof (await leer<Patron>('read_pattern', {}, contexto([]))).revision).toBe('number');
  });
  it('con la camisa de María: cinco piezas, y cada lado de cada costura tiene largo', async () => {
    const { piezas, seams } = camisaDeMaria();
    const r = await leer<Patron>('read_pattern', {}, contexto(piezas, seams));
    expect(r.pieces).toHaveLength(5);
    expect(r.seams.length).toBeGreaterThan(0);
    for (const s of r.seams) {
      expect(s.a.length).toBeGreaterThan(0);
      expect(s.b.length).toBeGreaterThan(0);
    }
  });
  it('con la camisa de María, los largos son los de sus bordes curvos enteros (77-127 comandos), no los de su primer comando', async () => {
    const { piezas, seams } = camisaDeMaria();
    const r = await leer<Patron>('read_pattern', {}, contexto(piezas, seams));
    const largo = (categoria: string, lado: string | null, borde: string) =>
      r.pieces.find(p => p.category === categoria && (lado === null || p.side === lado))?.edges.find(e => e.name === borde)?.length;
    expect(largo('bodice', 'front', 'armhole')).toBe(230.6);
    expect(largo('bodice', 'front', 'neckline')).toBe(299.6);
    expect(largo('sleeve', null, 'sleeveCap')).toBe(450.9);
    expect(largo('collar', null, 'collarNeckEdge')).toBe(228);
  });
});

describe('read_piece', () => {
  it('trae cada punto del contorno con su índice, en espacio de patrón', async () => {
    const r = await leer<Pieza>('read_piece', { piece_id: 'a' }, contexto([pieza('a', [100], { position: { x: 10, y: 20 } })]));
    expect(r.points[0]).toMatchObject({ index: 0, type: 'M', x: 10, y: 20 });
    expect(r.edges.find(e => e.name === 'top')).toMatchObject({ from_index: 1, to_index: 2, length: 100 });
  });
  it('una pieza que no existe es un error dicho', async () => {
    const r = await ejecutarVerbo(VERBOS_DE_LEER, 'read_piece', { piece_id: 'nadie' }, contexto([]));
    expect(r).toMatchObject({ ok: false, error: 'no piece with id nadie' });
  });
});
