import { describe, it, expect, vi } from 'vitest';
import { largoDelLado, cotasDelPiquete, dondeCaeElPunto, cotaDelPunto } from '../loQueSePone';
import type { NotchRefineState } from '../../useNotchTool';
import type { PuntoPuesto } from '../../usePointTool';
import { splitSegmentAt, getAnchor } from '../../nodeEditorUtils';
import { buildRing, projectToRing } from '../../../../utils/geometry/outlineRing';
import type { PathCommand, PatternPiece } from '../../../../types/types';
import { DEFAULT_NOTCH_OPTIONS } from '../../../../utils/notches';

/** La cota del piquete recién puesto (spec 2026-10-02 § 5.2): dos campos, un grupo, por fuera del borde. */
const rect: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [300, 0] }, { type: 'L', values: [300, 200] },
  { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
];
const pieza: PatternPiece = {
  id: 'p', name: 'p', outline: rect, internals: [], position: { x: 10, y: 20 }, rotation: 0, mirrored: false,
  seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0,
};
const refinando = (over: Partial<NotchRefineState> = {}): NotchRefineState => ({
  pieceId: 'p',
  notch: {
    id: 'n', type: 'notch', path: [{ type: 'M', values: [60, 0] }, { type: 'L', values: [60, 8] }],
    notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm: 60, metric: 2 },
    notchOptions: { ...DEFAULT_NOTCH_OPTIONS, length: 8 },
  },
  source: 'placement', refWorld: { x: 10, y: 20 }, notchWorld: { x: 70, y: 20 },
  maxDistanceMm: 1000, previewWorld: null, sesion: 1, ...over,
});

describe('largoDelLado', () => {
  it('de la esquina de referencia a la siguiente, en el sentido de la cuenta', () => {
    expect(largoDelLado(rect, { refPoint: { x: 0, y: 0 }, direction: 'cw' })).toBeCloseTo(300, 6);
    expect(largoDelLado(rect, { refPoint: { x: 0, y: 0 }, direction: 'ccw' })).toBeCloseTo(200, 6);
  });
  it('sin otra esquina, el perímetro', () => {
    const circulo: PathCommand[] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      circulo.push({ type: i === 0 ? 'M' : 'L', values: [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)] });
    }
    circulo.push({ type: 'Z', values: [] });
    const lado = 2 * 50 * Math.sin(Math.PI / 36);
    expect(largoDelLado(circulo, { refPoint: { x: 100, y: 50 }, direction: 'cw' })).toBeCloseTo(36 * lado, 3);
  });
});

describe('cotasDelPiquete', () => {
  const enVivo = () => ({ alEscribir: vi.fn(), alCerrar: vi.fn() });

  it('dos campos en un grupo: Distancia, con el largo del lado, y Profundidad de 1 a 30', () => {
    const cotas = cotasDelPiquete(refinando(), pieza, enVivo());
    expect(cotas.map(c => [c.label, c.valueMm, c.min, c.max, c.unit])).toEqual([
      ['Distancia', 60, 0, 1000, 'mm'],
      ['Profundidad', 8, 1, 30, 'mm'],
    ]);
    expect(cotas[0].referenceLabel).toBe('de 300 mm');
    expect(cotas.map(c => c.grupo)).toEqual(['piquete', 'piquete']);
    expect(cotas.map(c => c.kind)).toEqual(['borde', 'profundidad']);
    expect(cotas.every(c => c.scrub === false)).toBe(true);
  });

  it('cada campo escribe con el valor de ahora del otro', () => {
    const [d, p] = cotasDelPiquete(refinando(), pieza, enVivo());
    expect(d.apply(90)).toEqual({ kind: 'piquete', distanciaMm: 90, profundidadMm: 8 });
    expect(p.apply(12)).toEqual({ kind: 'piquete', distanciaMm: 60, profundidadMm: 12 });
  });

  it('el hilo va de la esquina al piquete, o al fantasma mientras se escribe, y por fuera de la pieza', () => {
    const [d] = cotasDelPiquete(refinando(), pieza, enVivo());
    expect([d.a, d.b]).toEqual([{ x: 10, y: 20 }, { x: 70, y: 20 }]);
    expect(d.outward.y).toBeLessThan(0);
    const [conFantasma] = cotasDelPiquete(refinando({ previewWorld: { x: 110, y: 20 } }), pieza, enVivo());
    expect(conFantasma.b).toEqual({ x: 110, y: 20 });
  });

  it('solo la distancia mueve el fantasma; el cierre lo lleva la primera, que es la que monta el chip', () => {
    const v = enVivo();
    const [d, p] = cotasDelPiquete(refinando(), pieza, v);
    expect(d.alEscribir).toBe(v.alEscribir);
    expect(d.alCerrar).toBe(v.alCerrar);
    expect(p.alEscribir).toBeUndefined();
    expect(p.alCerrar).toBeUndefined();
  });

  it('sin ancla no hay cota', () => {
    const r = refinando();
    expect(cotasDelPiquete({ ...r, notch: { ...r.notch, notchAnchor: undefined } }, pieza, enVivo())).toEqual([]);
  });
});

describe('dondeCaeElPunto', () => {
  const esquina = { x: 0, y: 0 };
  it('en un lado recto, la fracción nativa del comando', () => {
    expect(dondeCaeElPunto(rect, { refPoint: esquina, direction: 'cw' }, 120)).toEqual({ commandIndex: 1, nativeT: expect.closeTo(0.4, 9) });
  });
  it('en sentido contrario cuenta hacia atrás, por el cierre', () => {
    // Del (0,0) hacia atrás está el cierre Z, de (0,200) a (0,0): 50 mm antes del final.
    expect(dondeCaeElPunto(rect, { refPoint: esquina, direction: 'ccw' }, 50)).toEqual({ commandIndex: 4, nativeT: expect.closeTo(0.75, 9) });
  });
  it('sobre un punto que ya existe no hay sitio nuevo', () => {
    expect(dondeCaeElPunto(rect, { refPoint: esquina, direction: 'cw' }, 300)).toBe('sobre-un-punto');
    expect(dondeCaeElPunto(rect, { refPoint: esquina, direction: 'cw' }, 0)).toBe('sobre-un-punto');
  });
  it('en una curva, el punto cae a esa distancia medida por el arco, no por el parámetro', () => {
    const curva: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [40, -60, 160, -60, 200, 0] },
      { type: 'L', values: [200, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
    ];
    const donde = dondeCaeElPunto(curva, { refPoint: esquina, direction: 'cw' }, 70);
    if (donde === null || donde === 'sobre-un-punto') throw new Error('sin sitio');
    const partida = splitSegmentAt(curva, donde.commandIndex, donde.nativeT);
    const vertice = getAnchor(partida[donde.commandIndex])!;
    const anillo = buildRing(partida, 2);
    if (!anillo.ok) throw new Error('sin anillo');
    expect(projectToRing(anillo.value, vertice).distanceMm).toBeCloseTo(70, 2);
  });
});

describe('cotaDelPunto', () => {
  const puesto: PuntoPuesto = {
    pieceId: 'p', base: pieza, cuenta: { refPoint: { x: 0, y: 0 }, direction: 'cw' },
    distanciaMm: 60, ladoMm: 300, vertice: { x: 60, y: 0 }, esperado: rect, sesion: 1,
  };
  it('la distancia a la esquina, con el lado de techo y el largo junto al número', () => {
    const alCerrar = vi.fn();
    const c = cotaDelPunto(puesto, pieza, alCerrar);
    expect([c.label, c.valueMm, c.min, c.max, c.referenceLabel]).toEqual(['Distancia', 60, 0, 300, 'de 300 mm']);
    expect([c.a, c.b]).toEqual([{ x: 10, y: 20 }, { x: 70, y: 20 }]);
    expect(c.outward.y).toBeLessThan(0);
    expect(c.alCerrar).toBe(alCerrar);
    expect(c.alEscribir).toBeUndefined();
    expect(c.apply(120)).toEqual({ kind: 'punto', distanciaMm: 120 });
  });
});
