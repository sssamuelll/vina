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
  seams: Array<{
    id: string;
    walks: boolean | null;
    delta: number | null;
    a: { piece_id: string; edge: string; length: number };
    b: { piece_id: string; edge: string; length: number };
  }>;
}

/** Medir (spec 2026-10-05 § 5.1 y § 5.3): números de ahora, y un veredicto que no miente. */
const medir = async <T>(nombre: string, args: unknown, ctx: ReturnType<typeof contexto>): Promise<T> => {
  const r = await ejecutarVerbo(VERBOS_DE_MEDIR, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as T;
};

describe('measure', () => {
  it('un punto sobre una curva está sobre el borde, y el largo hasta él es el del arco', async () => {
    // La curva del revisor: (30, 135) es exactamente su punto en t = 0,5.
    const curva = pieza('c', [100], {
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'C', values: [0, 120, 40, 180, 120, 180] },
        { type: 'L', values: [300, 180] },
        { type: 'L', values: [300, 0] },
        { type: 'Z', values: [] },
      ],
      edges: [{ id: 'c:armhole', name: 'armhole', segmentRange: [1, 2], edgeType: 'seam' }],
    });
    const bezier = (t: number) => {
      const u = 1 - t;
      return { x: 3 * u * t * t * 40 + t ** 3 * 120, y: 3 * u * u * t * 120 + 3 * u * t * t * 180 + t ** 3 * 180 };
    };
    let arco = 0;
    for (let i = 1; i <= 1000; i++) {
      const a = bezier((i - 1) / 2000), b = bezier(i / 2000);
      arco += Math.hypot(b.x - a.x, b.y - a.y);
    }
    const r = await medir<Medida>('measure', { piece_id: 'c', edge: 'armhole', from: 0, to: { x: 30, y: 135 } }, contexto([curva]));
    expect(Math.abs(r.length - arco)).toBeLessThan(0.5);
  });
  it('un borde entero, un tramo en fracciones y un tramo entre dos puntos', async () => {
    // La pieza se corre también en perpendicular al borde (y = 20): si los
    // puntos no pasaran a espacio de pieza, caerían a 20 mm de él.
    const ctx = contexto([pieza('a', [50, 80, 100], { position: { x: 10, y: 20 } })]);
    expect((await medir<Medida>('measure', { piece_id: 'a', edge: 'top' }, ctx)).length).toBe(100);
    expect((await medir<Medida>('measure', { piece_id: 'a', edge: 'top', from: 0.25, to: 0.75 }, ctx)).length).toBe(50);
    expect((await medir<Medida>('measure', { piece_id: 'a', edge: 'top', from: { x: 20, y: 20 }, to: { x: 70, y: 20 } }, ctx)).length).toBe(50);
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
  it('la holgura buscada se le pasa por costura: con ella, una copa 40 mm más larga camina', async () => {
    const ctx = contexto([pieza('a', [100]), pieza('b', [140])], [costura()]);
    expect((await medir<Veredicto>('verify', {}, ctx)).verdict).toBe('has-issues');
    expect((await medir<Veredicto>('verify', { ease_mm: { s1: 40 } }, ctx)).verdict).toBe('ok');
  });
  it('una costura apagada se lista con su largo pero no cuenta en el veredicto', async () => {
    const r = await medir<Veredicto>('verify', {}, contexto([pieza('a', [100]), pieza('b', [110])], [costura({ active: false })]));
    expect(r.verdict).toBe('ok');
    expect(r.seams[0]).toMatchObject({ active: false, delta: 10 });
  });
  it('un grupo de costuras M:N no se verifica todavía, y verify no dice ok sin haberlo mirado', async () => {
    const r = await medir<Veredicto>('verify', {}, contexto([], [], {}, [{ id: 'g1' }]));
    expect(r.verdict).toBe('has-issues');
    expect(r.issues.some(i => i.kind === 'seam-groups-not-verified')).toBe(true);
  });
  it('la tensión y si está activa viajan con cada costura: un frunce puede ser a propósito', async () => {
    const r = await medir('walk_seam', { seam_id: 's1' }, contexto([pieza('a', [100]), pieza('b', [100])], [costura({ tension: 80 })]));
    expect(r).toMatchObject({ tension: 80, active: true });
  });
  it('una costura cuyo borde ya no existe no se mide, y verify lo dice', async () => {
    const r = await medir<Veredicto>('verify', {}, contexto([pieza('a', [100]), pieza('b', [100])], [costura({ pieceA: { pieceId: 'a', edgeName: 'manga' } })]));
    expect(r.verdict).toBe('has-issues');
    expect(r.issues).toContainEqual(expect.objectContaining({ kind: 'seam-not-measurable', seam_id: 's1' }));
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
  it('con la camisa de María: el cuello mide 62 mm menos que el escote, y cada copa lleva 0,4 mm de embebido', async () => {
    // Oráculos que no dependen de dónde parte autoSew cada borde: sumadas sus
    // mitades, cada costura cubre los bordes enteros (518,1 contra 456 en el
    // cuello; 450,9 de copa contra 230,6 + 219,9 de sisas).
    const { piezas, seams } = camisaDeMaria();
    const r = await medir<Veredicto>('verify', {}, contexto(piezas, seams));
    const cuello = r.seams.filter(s => s.b.edge.startsWith('collarNeckEdge') || s.a.edge.startsWith('collarNeckEdge'));
    expect(cuello).toHaveLength(4);
    // Con el delta de cada costura, redondeado una vez: restar largos ya
    // redondeados acumula hasta 0,4 mm en ocho números.
    const faltaDeCuello = cuello.reduce((suma, s) => suma + Math.abs(s.delta ?? NaN), 0);
    expect(Math.abs(faltaDeCuello - 62.1)).toBeLessThanOrEqual(0.25);
    const mangas = piezas.filter(p => p.category === 'sleeve');
    expect(mangas).toHaveLength(2);
    for (const manga of mangas) {
      const copa = r.seams.filter(s => (s.a.piece_id === manga.id && s.a.edge === 'sleeveCap') || (s.b.piece_id === manga.id && s.b.edge === 'sleeveCap'));
      expect(copa).toHaveLength(2);
      // delta es B − A: la copa menos la sisa es −delta si la copa es A.
      const embebido = copa.reduce((suma, s) => suma + (s.a.edge === 'sleeveCap' ? -(s.delta ?? NaN) : (s.delta ?? NaN)), 0);
      expect(Math.abs(embebido - 0.4)).toBeLessThanOrEqual(0.25);
    }
  });
});

describe('medirCostura lee los rangos en el sentido de su borde', () => {
  it('un B invertido guarda su rango en el sentido de cosido, y se lee espejado', async () => {
    const seam = costura({ pieceB: { pieceId: 'b', edgeName: 'top', tStart: 0, tEnd: 0.4, reversed: true } });
    const r = await ejecutarVerbo(VERBOS_DE_MEDIR, 'walk_seam', { seam_id: 's1' }, contexto([pieza('a', [100]), pieza('b', [100])], [seam]));
    expect(r.ok && r.result).toMatchObject({ b: { t_start: 0.6, t_end: 1, reversed: true, length: 40 } });
  });
});
