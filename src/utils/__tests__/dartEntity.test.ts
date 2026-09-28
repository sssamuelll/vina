import { describe, it, expect } from 'vitest';
import { extractDartFromInternal, extractDarts, adjustDartIntake, segmentDart, shapeDartCap, applyDartsToInternals, refrescarPinzas } from '../dartEntity';
import type { InternalLine, PatternPiece } from '../../types/types';

// V-shaped dart: base at (100,400)→(120,400), apex at (110,300)
const dartLine: InternalLine = {
  id: 'dart-1',
  type: 'dart',
  path: [
    { type: 'M', values: [100, 400] },
    { type: 'L', values: [110, 300] },  // to apex
    { type: 'L', values: [120, 400] },  // back to base
  ],
};

function makePiece(internals: InternalLine[]): PatternPiece {
  return {
    id: 'test', name: 'Test', outline: [], internals,
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, layer: 1, sublayer: 0, active: true, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

describe('extractDartFromInternal', () => {
  it('extracts dart with correct intake and apex', () => {
    const dart = extractDartFromInternal(dartLine);
    expect(dart).not.toBeNull();
    expect(dart!.intake).toBeCloseTo(20, 0); // 120-100 = 20mm
    expect(dart!.apex.x).toBeCloseTo(110);
    expect(dart!.apex.y).toBeCloseTo(300);
    expect(dart!.depth).toBeGreaterThan(90);
    expect(dart!.legs).toHaveLength(2);
    expect(dart!.foldDirection).toBeDefined();
  });

  it('returns null for too-short path', () => {
    const line: InternalLine = {
      id: 'short', type: 'dart',
      path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 10] }],
    };
    const dart = extractDartFromInternal(line);
    expect(dart).toBeNull();
  });

  // #1020: una pinza es una cuña — dos piernas que se juntan en un ápice
  // separado de la base. Un path colineal no tiene ápice: es una recta, y
  // leerla como pinza produce depth=0 y avisos falsos del validador.
  it('devuelve null para un path colineal (recta, no cuña)', () => {
    const line: InternalLine = {
      id: 'straight', type: 'dart',
      path: [
        { type: 'M', values: [30, 50] },
        { type: 'L', values: [30, 62] },
        { type: 'L', values: [30, 74] },
      ],
    };
    expect(extractDartFromInternal(line)).toBeNull();
  });

  it('una cuña de ápice poco profundo pero real sigue siendo pinza', () => {
    const line: InternalLine = {
      id: 'shallow', type: 'dart',
      path: [
        { type: 'M', values: [100, 400] },
        { type: 'L', values: [110, 397] }, // 3mm de profundidad: poco, pero es cuña
        { type: 'L', values: [120, 400] },
      ],
    };
    expect(extractDartFromInternal(line)).not.toBeNull();
  });

  // #1016: el Dart hereda el id de su línea. Sin ese puntero de vuelta no hay
  // forma de escribir el cambio al almacenamiento, que es lo único que el
  // lienzo 2D dibuja.
  it('hereda el id de la línea de origen', () => {
    expect(extractDartFromInternal(dartLine)!.id).toBe('dart-1');
  });

  it('lee la forma de punta guardada en dartOptions', () => {
    const curved: InternalLine = { ...dartLine, dartOptions: { capShape: 'curved' } };
    expect(extractDartFromInternal(curved)!.capShape).toBe('curved');
  });
});

describe('extractDarts', () => {
  it('extracts darts from piece internals', () => {
    const piece = makePiece([dartLine, { id: 'gl', type: 'grainline', path: [] }]);
    const darts = extractDarts(piece);
    expect(darts).toHaveLength(1);
    expect(darts[0].intake).toBeCloseTo(20, 0);
  });

  it('returns empty for piece without darts', () => {
    const piece = makePiece([{ id: 'gl', type: 'grainline', path: [] }]);
    expect(extractDarts(piece)).toHaveLength(0);
  });
});

describe('adjustDartIntake', () => {
  it('increases intake', () => {
    const dart = extractDartFromInternal(dartLine)!;
    const adjusted = adjustDartIntake(dart, 10);
    expect(adjusted.intake).toBeCloseTo(dart.intake + 10, 0);
  });

  it('decreases intake', () => {
    const dart = extractDartFromInternal(dartLine)!;
    const adjusted = adjustDartIntake(dart, -5);
    expect(adjusted.intake).toBeCloseTo(dart.intake - 5, 0);
  });

  it('preserves apex', () => {
    const dart = extractDartFromInternal(dartLine)!;
    const adjusted = adjustDartIntake(dart, 10);
    expect(adjusted.apex).toEqual(dart.apex);
  });
});

describe('segmentDart', () => {
  it('splits dart into 2 segments', () => {
    const result = segmentDart(makePiece([dartLine]), 'dart-1', 2);
    expect(result).toHaveLength(2);
    for (const seg of result) {
      expect(seg.type).toBe('dart');
      expect(seg.path).toHaveLength(3);
      expect(seg.path[0].type).toBe('M');
      expect(seg.path[1].type).toBe('L');
      expect(seg.path[2].type).toBe('L');
    }
  });

  it('splits dart into 4 segments', () => {
    const result = segmentDart(makePiece([dartLine]), 'dart-1', 4);
    expect(result).toHaveLength(4);
  });

  it('throws for segments < 2', () => {
    expect(() => segmentDart(makePiece([dartLine]), 'dart-1', 1)).toThrow();
  });

  it('throws for segments > 6', () => {
    expect(() => segmentDart(makePiece([dartLine]), 'dart-1', 7)).toThrow();
  });

  it('throws for nonexistent dart', () => {
    expect(() => segmentDart(makePiece([]), 'nope', 2)).toThrow();
  });

  it('segment IDs are unique', () => {
    const result = segmentDart(makePiece([dartLine]), 'dart-1', 3);
    const ids = result.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('total segment intake equals original intake', () => {
    const result = segmentDart(makePiece([dartLine]), 'dart-1', 3);
    // Each segment is a V-path: M(base1) L(apex) L(base2) — intake = distance(base1, base2)
    let totalIntake = 0;
    for (const seg of result) {
      const b1x = seg.path[0].values[0], b1y = seg.path[0].values[1];
      const b2x = seg.path[2].values[0], b2y = seg.path[2].values[1];
      totalIntake += Math.sqrt((b2x - b1x) ** 2 + (b2y - b1y) ** 2);
    }
    // Original intake is 20mm (base at 100,400 to 120,400)
    expect(totalIntake).toBeCloseTo(20, 0);
  });
});

describe('shapeDartCap', () => {
  const dart = extractDartFromInternal(dartLine)!;

  it('pointed returns standard V path (M, L, L)', () => {
    const path = shapeDartCap(dart, 'pointed');
    expect(path).toHaveLength(3);
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
    expect(path[2].type).toBe('L');
  });

  it('curved returns path with cubic bezier (M, L, C, L)', () => {
    const path = shapeDartCap(dart, 'curved');
    expect(path).toHaveLength(4);
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
    expect(path[2].type).toBe('C');
    expect(path[3].type).toBe('L');
  });

  it('flat returns path with 4 commands (M, L, L, L)', () => {
    const path = shapeDartCap(dart, 'flat');
    expect(path).toHaveLength(4);
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
    expect(path[2].type).toBe('L');
    expect(path[3].type).toBe('L');
  });

  it('diamond returns path with 5 commands (M, L, L, L, L)', () => {
    const path = shapeDartCap(dart, 'diamond');
    expect(path).toHaveLength(5);
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
    expect(path[2].type).toBe('L');
    expect(path[3].type).toBe('L');
    expect(path[4].type).toBe('L');
  });

  it('curved path has valid bezier control points', () => {
    const path = shapeDartCap(dart, 'curved');
    const bezier = path.find(cmd => cmd.type === 'C')!;
    expect(bezier.values).toHaveLength(6);
  });

  it('flat cap width is smaller than intake', () => {
    const path = shapeDartCap(dart, 'flat');
    // path: M(leg1Base), L(flatL), L(flatR), L(leg2Base)
    const flatL = path[1].values;
    const flatR = path[2].values;
    const flatWidth = Math.sqrt(
      (flatR[0] - flatL[0]) ** 2 + (flatR[1] - flatL[1]) ** 2
    );
    expect(flatWidth).toBeLessThan(20); // original intake is 20mm
  });
});

// #1016 — la vuelta al almacenamiento. Es el inverso de extractDarts y el
// único camino por el que una op de dominio llega al lienzo.
describe('applyDartsToInternals', () => {
  const grainline: InternalLine = { id: 'gl', type: 'grainline', path: [{ type: 'M', values: [0, 0] }] };

  it('reescribe el path de la línea con la geometría del dart', () => {
    const piece = makePiece([dartLine, grainline]);
    const widened = adjustDartIntake(extractDartFromInternal(dartLine)!, 20);

    const internals = applyDartsToInternals(piece, [widened]);
    const line = internals.find(l => l.id === 'dart-1')!;

    // Base ensanchada 20mm: de (100,400)-(120,400) a (90,400)-(130,400).
    expect(line.path[0].values).toEqual([90, 400]);
    expect(line.path[2].values).toEqual([130, 400]);
  });

  it('no toca los internals que no son dart', () => {
    const piece = makePiece([dartLine, grainline]);
    const internals = applyDartsToInternals(piece, extractDarts(piece));
    expect(internals.find(l => l.id === 'gl')).toEqual(grainline);
  });

  it('borra las líneas de dart que ya no están en el juego', () => {
    const piece = makePiece([dartLine, grainline]);
    const internals = applyDartsToInternals(piece, []);
    expect(internals.map(l => l.id)).toEqual(['gl']);
  });

  it('agrega línea para un dart sin línea previa', () => {
    const piece = makePiece([grainline]);
    const nuevo = { ...extractDartFromInternal(dartLine)!, id: 'dart-nuevo' };

    const internals = applyDartsToInternals(piece, [nuevo]);
    const added = internals.find(l => l.id === 'dart-nuevo')!;

    expect(added.type).toBe('dart');
    expect(added.path[0].values).toEqual([100, 400]);
  });

  it('conserva la punta curva en vez de aplanarla a pico', () => {
    const curvedLine: InternalLine = {
      ...dartLine,
      path: shapeDartCap(extractDartFromInternal(dartLine)!, 'curved'),
      dartOptions: { capShape: 'curved' },
    };
    const piece = makePiece([curvedLine]);

    const darts = extractDarts(piece);
    const internals = applyDartsToInternals(piece, darts);

    expect(internals[0].path.some(c => c.type === 'C')).toBe(true);
  });

  it('ida y vuelta sin cambios deja la geometría igual', () => {
    const piece = makePiece([dartLine, grainline]);
    expect(applyDartsToInternals(piece, extractDarts(piece))).toEqual(piece.internals);
  });

  // #1020: la ausencia de una línea en el juego tiene DOS causas distintas y
  // hasta acá se trataban igual (borrar). Si `extractDarts` no supo leerla,
  // nunca estuvo en el juego — no es que la op la quitara. Borrarla es
  // pérdida de datos silenciosa: el lienzo dibuja `internals`.
  describe('líneas type:dart que extractDarts no sabe leer', () => {
    const straight: InternalLine = {
      id: 'legacy-straight', type: 'dart',
      path: [
        { type: 'M', values: [30, 50] },
        { type: 'L', values: [30, 62] },
        { type: 'L', values: [30, 74] },
      ],
    };
    const twoPoint: InternalLine = {
      id: 'legacy-2pt', type: 'dart',
      path: [{ type: 'M', values: [200, 600] }, { type: 'L', values: [210, 500] }],
    };

    it('sobreviven a una op sobre otra pinza de la misma pieza', () => {
      const piece = makePiece([dartLine, straight, twoPoint, grainline]);
      const darts = extractDarts(piece);
      expect(darts.map(d => d.id)).toEqual(['dart-1']); // solo lee la buena

      const internals = applyDartsToInternals(piece, [adjustDartIntake(darts[0], 10)]);

      expect(internals.map(l => l.id)).toEqual(['dart-1', 'legacy-straight', 'legacy-2pt', 'gl']);
      expect(internals.find(l => l.id === 'legacy-straight')).toEqual(straight);
      expect(internals.find(l => l.id === 'legacy-2pt')).toEqual(twoPoint);
    });

    it('pero una pinza legible ausente del juego sí se borra', () => {
      const piece = makePiece([dartLine, straight]);
      const internals = applyDartsToInternals(piece, []);
      expect(internals.map(l => l.id)).toEqual(['legacy-straight']);
    });
  });
});

// spec 2026-09-24 § 7: la copia `piece.darts` al día con sus líneas.
describe('refrescarPinzas', () => {
  it('una pinza cuya línea ya no se lee como pinza (se aplanó al moverla) sale de la copia, y su línea se queda', () => {
    const darts = extractDarts(makePiece([dartLine]));
    expect(darts.map(d => d.id)).toEqual(['dart-1']);
    // El ápice llevado a la base: sin profundidad, ya no es una cuña (#1020).
    const aplanada: InternalLine = {
      ...dartLine,
      path: [
        { type: 'M', values: [100, 400] },
        { type: 'L', values: [110, 400] },
        { type: 'L', values: [120, 400] },
      ],
    };
    expect(extractDartFromInternal(aplanada)).toBeNull();

    const copia = refrescarPinzas(darts, [aplanada]);

    expect(copia).toEqual([]);
    // «`applyDartsToInternals` preserva su línea (#1020), así que no se pierde nada.»
    expect(applyDartsToInternals(makePiece([aplanada]), copia)).toEqual([aplanada]);
  });
});
