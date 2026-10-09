import { describe, it, expect, vi } from 'vitest';
import { largoDelLado, cotasDelPiquete, dondeCaeElPunto, cotaDelPunto, cotaDelPiqueteElegido } from '../loQueSePone';
import type { NotchRefineState } from '../../useNotchTool';
import type { PuntoPuesto } from '../../usePointTool';
import { splitSegmentAt, getAnchor } from '../../nodeEditorUtils';
import { buildRing, projectToRing } from '../../../../utils/geometry/outlineRing';
import type { InternalLine, PathCommand, PatternPiece } from '../../../../types/types';
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

  it('un campo, Distancia, con el largo del lado: la profundidad vive en la etiqueta del piquete (P3c)', () => {
    const cotas = cotasDelPiquete(refinando(), pieza, enVivo());
    // El techo es el lado, el mismo que se lee: «de 300 mm» (revisión final de P3b).
    expect(cotas.map(c => [c.label, c.valueMm, c.min, c.max, c.unit])).toEqual([
      ['Distancia', 60, 0, 300, 'mm'],
    ]);
    expect(cotas[0].referenceLabel).toBe('de 300 mm');
    // Un campo solo no es un grupo: el chip es el del punto.
    expect(cotas[0].grupo).toBeUndefined();
    expect(cotas[0].kind).toBe('borde');
    expect(cotas[0].scrub).toBe(false);
  });

  it('la distancia escribe con la profundidad que el piquete ya tiene', () => {
    const [d] = cotasDelPiquete(refinando(), pieza, enVivo());
    expect(d.apply(90)).toEqual({ kind: 'piquete', distanciaMm: 90, profundidadMm: 8 });
  });

  it('el hilo va de la esquina al piquete puesto, por fuera de la pieza', () => {
    const [d] = cotasDelPiquete(refinando(), pieza, enVivo());
    expect([d.a, d.b]).toEqual([{ x: 10, y: 20 }, { x: 70, y: 20 }]);
    expect(d.outward.y).toBeLessThan(0);
  });

  it('el campo no se mueve mientras se escribe: el fantasma lo pinta el lienzo, no la cota', () => {
    // Anclado al fantasma, el campo saltaba con cada tecla —a 125 px con «250»,
    // dentro de la pieza con un valor que envuelve— (revisión final de P3b).
    const quieto = cotasDelPiquete(refinando(), pieza, enVivo());
    const conFantasma = cotasDelPiquete(refinando({ previewWorld: { x: 110, y: 20 } }), pieza, enVivo());
    expect(conFantasma.map(c => [c.a, c.b, c.outward])).toEqual(quieto.map(c => [c.a, c.b, c.outward]));
  });

  it('una distancia guardada mayor que el lado sigue siendo válida: el techo no la deja atrapada', () => {
    const r = refinando();
    const lejos = { ...r, notch: { ...r.notch, notchAnchor: { ...r.notch.notchAnchor!, distanceMm: 450 } } };
    expect(cotasDelPiquete(lejos, pieza, enVivo())[0].max).toBe(450);
  });

  it('sin lado que medir, el techo vuelve a ser el perímetro', () => {
    const conAgujero: PatternPiece = { ...pieza, outline: [...rect, { type: 'M', values: [50, 50] }, { type: 'L', values: [60, 50] }, { type: 'L', values: [60, 60] }, { type: 'Z', values: [] }] };
    const [d] = cotasDelPiquete(refinando(), conAgujero, enVivo());
    expect(d.max).toBe(1000);
    expect(d.referenceLabel).toBeUndefined();
  });

  it('la distancia mueve el fantasma y cierra la sesión', () => {
    const v = enVivo();
    const [d] = cotasDelPiquete(refinando(), pieza, v);
    expect(d.alEscribir).toBe(v.alEscribir);
    expect(d.alCerrar).toBe(v.alCerrar);
  });

  it('sin ancla no hay cota', () => {
    const r = refinando();
    expect(cotasDelPiquete({ ...r, notch: { ...r.notch, notchAnchor: undefined } }, pieza, enVivo())).toEqual([]);
  });
});

describe('cotaDelPiqueteElegido (P3c, la puerta de vuelta)', () => {
  const elegido = (distanceMm = 60): InternalLine => ({
    id: 'n', type: 'notch', path: [{ type: 'M', values: [distanceMm, 0] }, { type: 'L', values: [distanceMm, 8] }],
    notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm, metric: 2 },
    notchOptions: { ...DEFAULT_NOTCH_OPTIONS, length: 8 },
  });

  it('su distancia a la esquina, con el largo del lado; descansa: ni sesión que cerrar ni arrastre', () => {
    const c = cotaDelPiqueteElegido(pieza, elegido())!;
    expect([c.label, c.valueMm, c.min, c.max, c.unit, c.kind]).toEqual(['Distancia', 60, 0, 300, 'mm', 'borde']);
    expect(c.referenceLabel).toBe('de 300 mm');
    expect(c.scrub).toBe(false);
    expect(c.alCerrar).toBeUndefined();
    expect(c.alEscribir).toBeUndefined();
    expect(c.grupo).toBeUndefined();
  });

  it('escribe por el ancla: la pieza, la línea y la distancia', () => {
    expect(cotaDelPiqueteElegido(pieza, elegido())!.apply(150))
      .toEqual({ kind: 'piqueteElegido', pieceId: 'p', lineId: 'n', distanciaMm: 150 });
  });

  it('el hilo va de la esquina al piquete, en patrón, por fuera de la pieza', () => {
    const c = cotaDelPiqueteElegido(pieza, elegido())!;
    expect([c.a, c.b]).toEqual([{ x: 10, y: 20 }, { x: 70, y: 20 }]);
    expect(c.outward.y).toBeLessThan(0);
  });

  it('una distancia guardada mayor que el lado no queda atrapada', () => {
    expect(cotaDelPiqueteElegido(pieza, elegido(450))!.max).toBe(450);
  });

  it('sin ancla, con un ancla que ya no cae en el contorno o si no es un piquete, no hay cota', () => {
    expect(cotaDelPiqueteElegido(pieza, { ...elegido(), notchAnchor: undefined })).toBeNull();
    expect(cotaDelPiqueteElegido(pieza, {
      ...elegido(), notchAnchor: { refPoint: { x: 999, y: 999 }, direction: 'cw', distanceMm: 5, metric: 2 },
    })).toBeNull();
    expect(cotaDelPiqueteElegido(pieza, { ...elegido(), type: 'reference' })).toBeNull();
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
