import { describe, it, expect } from 'vitest';
import { ejecutarVerbo } from '../ejecutar';
import { VERBOS_DE_MEDIR } from '../verbos/medir';
import { camisaDeMaria, contexto, costura, pieza } from './fixtures';

/** Lo que estos tests leen de las respuestas: el resto se compara con `toMatchObject`. */
interface Medida {
  length: number;
}
interface Veredicto {
  verdict: string;
  issues: Array<{ kind: string; seam_id?: string; message: string }>;
  seams: Array<{ id: string; walks: boolean | null; a: { edge: string; length: number }; b: { length: number } }>;
}

/** Medir (spec 2026-10-05 § 5.1 y § 5.3): números de ahora, y un veredicto que no miente. */
const medir = async <T>(nombre: string, args: unknown, ctx: ReturnType<typeof contexto>): Promise<T> => {
  const r = await ejecutarVerbo(VERBOS_DE_MEDIR, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as T;
};

describe('measure', () => {
  it('un borde entero, un tramo en fracciones y un tramo entre dos puntos', async () => {
    const ctx = contexto([pieza('a', [50, 80, 100], { position: { x: 10, y: 0 } })]);
    expect((await medir<Medida>('measure', { piece_id: 'a', edge: 'top' }, ctx)).length).toBe(100);
    expect((await medir<Medida>('measure', { piece_id: 'a', edge: 'top', from: 0.25, to: 0.75 }, ctx)).length).toBe(50);
    expect((await medir<Medida>('measure', { piece_id: 'a', edge: 'top', from: { x: 20, y: 0 }, to: { x: 70, y: 0 } }, ctx)).length).toBe(50);
  });
  it('un punto fuera del borde es un error dicho, no una proyección callada', async () => {
    const r = await ejecutarVerbo(VERBOS_DE_MEDIR, 'measure', { piece_id: 'a', edge: 'top', from: { x: 10, y: 30 } }, contexto([pieza('a', [100])]));
    expect(r).toMatchObject({ ok: false, error: 'point (10, 30) is 30 mm off edge top' });
  });
  it('un borde que no existe es un error dicho', async () => {
    const r = await ejecutarVerbo(VERBOS_DE_MEDIR, 'measure', { piece_id: 'a', edge: 'manga' }, contexto([pieza('a', [100])]));
    expect(r).toMatchObject({ ok: false, error: 'piece a has no edge named manga' });
  });
});

describe('walk_seam', () => {
  it('por costura: los dos largos, la diferencia y si camina', async () => {
    const r = await medir('walk_seam', { seam_id: 's1' }, contexto([pieza('a', [100]), pieza('b', [102])], [costura()]));
    expect(r).toMatchObject({ delta: 2, walks: true, band: 'green', tolerance: 3, expected_ease: 0 });
  });
  it('Vina no adivina la holgura: una copa 40 mm más larga camina solo si se pide esa holgura', async () => {
    const ctx = contexto([pieza('a', [100], { category: 'bodice' }), pieza('b', [140], { category: 'sleeve' })], [costura()]);
    expect(await medir('walk_seam', { seam_id: 's1' }, ctx)).toMatchObject({ delta: 40, walks: false });
    expect(await medir('walk_seam', { seam_id: 's1', ease_mm: 40 }, ctx)).toMatchObject({ walks: true, expected_ease: 40 });
  });
  it('por dos tramos sueltos, sin costura', async () => {
    const r = await medir('walk_seam', { a: { piece_id: 'a', edge: 'top' }, b: { piece_id: 'b', edge: 'right' } }, contexto([pieza('a', [100]), pieza('b', [100])]));
    expect(r).toMatchObject({ a: { length: 100 }, b: { length: 50 }, delta: -50, walks: false });
  });
  it('sin costura ni tramos es un error dicho', async () => {
    expect(await ejecutarVerbo(VERBOS_DE_MEDIR, 'walk_seam', {}, contexto([]))).toMatchObject({ ok: false, error: 'give seam_id, or both a and b' });
  });
});

describe('verify', () => {
  it('un patrón neto, con margen 0, no es un problema: verify no habla del margen', async () => {
    const r = await medir<Veredicto>('verify', {}, contexto([pieza('a', [100]), pieza('b', [100])], [costura()]));
    expect(r.verdict).toBe('ok');
    expect(JSON.stringify(r.issues)).not.toMatch(/allowance/i);
  });
  it('una costura que no camina sale con sus dos largos', async () => {
    const r = await medir<Veredicto>('verify', {}, contexto([pieza('a', [100]), pieza('b', [110])], [costura()]));
    expect(r.verdict).toBe('has-issues');
    expect(r.issues[0]).toMatchObject({ kind: 'seam-does-not-walk', seam_id: 's1' });
    expect(r.issues[0].message).toContain('100 mm against 110 mm');
  });
  it('un contorno que no cierra sale como problema', async () => {
    const abierta = pieza('a', [100]);
    abierta.outline = abierta.outline.filter(c => c.type !== 'Z');
    const r = await medir<Veredicto>('verify', {}, contexto([abierta]));
    expect(r.issues.some(i => i.kind === 'outline-open')).toBe(true);
  });
  it('con la camisa de María: costados y hombros caminan, y lo que no camina sale con sus dos largos', async () => {
    const { piezas, seams } = camisaDeMaria();
    const r = await medir<Veredicto>('verify', {}, contexto(piezas, seams));
    const de = (prefijo: string) => r.seams.filter(s => s.a.edge.startsWith(prefijo));
    expect(de('sideSeam')).toHaveLength(2);
    expect(de('shoulder')).toHaveLength(2);
    for (const s of [...de('sideSeam'), ...de('shoulder')]) expect(s.walks).toBe(true);
    const noCaminan = r.seams.filter(s => s.walks === false);
    expect(noCaminan.length).toBeGreaterThan(0);
    for (const s of noCaminan) {
      const problema = r.issues.find(i => i.seam_id === s.id);
      expect(problema?.message).toContain(`${s.a.length} mm against ${s.b.length} mm`);
    }
  });
});
