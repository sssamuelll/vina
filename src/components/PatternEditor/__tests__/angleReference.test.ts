import { describe, expect, it } from 'vitest';
import type { PathCommand, PatternPiece } from '../../../types/types';
import { buildSnapIndex } from '../snapIndex';
import { polarOf, polarPoint } from '../polyPenGeometry';
import {
  ABSOLUTE_REFERENCE, absoluteAngle, angleReferenceLabel, borderReference,
  relativeAngle, referenceBefore,
} from '../angleReference';

const outline: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
];
const piece = (path = outline, rotation = 0): PatternPiece => ({
  id: 'p', outline: path, rotation, position: { x: 0, y: 0 }, internals: [],
} as unknown as PatternPiece);

describe('D2 — un marco angular para leer y escribir', () => {
  it('borde derecho: izquierda casi horizontal dice cerca de 90 y escribir 90 entra perpendicular', () => {
    const from = { x: 100, y: 40 };
    const ref = borderReference(buildSnapIndex([piece()]), from);
    expect(ref.kind).toBe('border');
    expect(relativeAngle(polarOf(from, { x: 0, y: 39 }).angleDeg, ref)).toBeCloseTo(90 - Math.atan(0.01) * 180 / Math.PI, 9);
    const to = polarPoint(from, 70, absoluteAngle(90, ref));
    expect(to.x).toBeCloseTo(30, 9);
    expect(to.y).toBeCloseTo(40, 9);
    expect(angleReferenceLabel(ref)).toBe('al borde');
  });

  it('el interior positivo no depende del sentido en que se guardó el contorno', () => {
    const reversed: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [0, 100] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [100, 0] }, { type: 'Z', values: [] },
    ];
    const at = { x: 100, y: 40 };
    expect(borderReference(buildSnapIndex([piece(reversed)]), at)).toEqual(borderReference(buildSnapIndex([piece()]), at));
  });

  it('tramo anterior hacia arriba: continuar es 0 y girar a izquierda es 90', () => {
    const path: PathCommand[] = [{ type: 'M', values: [0, 0] }, { type: 'L', values: [0, -80] }];
    const ref = referenceBefore(path, path.length);
    expect(ref.kind).toBe('segment');
    expect(relativeAngle(90, ref)).toBe(0);
    expect(relativeAngle(180, ref)).toBe(90);
    expect(absoluteAngle(90, ref)).toBe(180);
  });

  it('sin borde usa el eje absoluto; leer y reescribir no pierde precisión', () => {
    const ref = borderReference(buildSnapIndex([piece()]), { x: 50, y: 50 });
    expect(ref).toEqual(ABSOLUTE_REFERENCE);
    expect(relativeAngle(-179.347218, ref)).toBe(-179.347218);
    for (const baseDeg of [-179, -90, 0, 37, 179]) {
      const frame = { kind: 'segment' as const, baseDeg };
      expect(Math.sin((absoluteAngle(relativeAngle(173.123456789, frame), frame) - 173.123456789) * Math.PI / 180)).toBeCloseTo(0, 12);
    }
  });

  it('un M reinicia la referencia y un segmento nulo no inventa una dirección', () => {
    const path: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [0, -80] },
      { type: 'M', values: [30, 30] }, { type: 'L', values: [30, 30] },
    ];
    expect(referenceBefore(path, path.length)).toEqual(ABSOLUTE_REFERENCE);
  });

  it('tras una curva usa la tangente de llegada, no la cuerda', () => {
    const path: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'C', values: [20, 0, 50, 40, 50, 20] },
    ];
    const ref = referenceBefore(path, path.length);
    expect(ref.baseDeg).toBeCloseTo(90, 9);
    expect(relativeAngle(90, ref)).toBeCloseTo(0, 9);
  });

  it('en una esquina: seguir un borde lee 0, el otro lee +90, y da igual el sentido guardado', () => {
    // Revisión 13-09 (H4): el desempate por orden del anillo daba 180 al
    // seguir un borde real y variaba entre el origen del anillo y las demás
    // esquinas. El test anterior era `expect(f(x)).toEqual(f(x))`.
    const reversed: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [0, 100] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [100, 0] }, { type: 'Z', values: [] },
    ];
    const esquinas = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    for (const path of [outline, reversed]) {
      const index = buildSnapIndex([piece(path)]);
      for (const esquina of esquinas) {
        const ref = borderReference(index, esquina);
        expect(ref.kind).toBe('border');
        // Los dos bordes que salen de la esquina, como direcciones.
        const bordes = esquinas
          .filter(o => o !== esquina && (o.x === esquina.x || o.y === esquina.y))
          .map(o => relativeAngle(polarOf(esquina, o).angleDeg, ref));
        expect(bordes.map(v => Math.round(v * 1e6) / 1e6).sort((a, b) => a - b), `esquina ${esquina.x},${esquina.y}`).toEqual([0, 90]);
        // Y la bisectriz interior queda a 45: +90 nunca apunta fuera.
        const centro = polarOf(esquina, { x: 50, y: 50 }).angleDeg;
        expect(relativeAngle(centro, ref)).toBeCloseTo(45, 9);
      }
    }
  });

  it('el primer tramo hereda el marco del borde cuando no hay tramo anterior', () => {
    const index = buildSnapIndex([piece()]);
    const ref = borderReference(index, { x: 100, y: 0 });
    expect(referenceBefore([{ type: 'M', values: [100, 0] }], 1, ref)).toEqual(ref);
  });

  it('el marco del tramo anterior queda normalizado en (−180, 180], y sin M inicial no se inventa', () => {
    // Revisión 13-09 (C10 y C9): `polarOf` puede devolver −180, y un path
    // sin `M` haría que el parser arrancara en (0,0).
    const haciaIzquierda: PathCommand[] = [{ type: 'M', values: [50, 0] }, { type: 'L', values: [0, 0] }];
    expect(referenceBefore(haciaIzquierda, haciaIzquierda.length).baseDeg).toBe(180);
    const sinM: PathCommand[] = [{ type: 'L', values: [100, 0] }, { type: 'L', values: [100, 50] }];
    expect(referenceBefore(sinM, 1)).toEqual(ABSOLUTE_REFERENCE);
  });

  it('una pieza con agujero no tiene «el borde»: cae al eje, y queda dicho', () => {
    const conAgujero: PathCommand[] = [
      ...outline,
      { type: 'M', values: [20, 20] }, { type: 'L', values: [40, 20] },
      { type: 'L', values: [40, 40] }, { type: 'L', values: [20, 40] }, { type: 'Z', values: [] },
    ];
    expect(borderReference(buildSnapIndex([piece(conAgujero)]), { x: 0, y: 40 })).toEqual(ABSOLUTE_REFERENCE);
  });
});