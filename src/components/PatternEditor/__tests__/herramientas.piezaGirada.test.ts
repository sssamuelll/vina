import { describe, it, expect } from 'vitest';
import { createNotchLine } from '../useNotchTool';
import { rotatePoint, outlineBBoxCenter } from '../../../utils/geometry/transform';
import { DEFAULT_NOTCH_OPTIONS } from '../../../utils/notches';
import type { PatternPiece, PathCommand } from '../../../types/types';

/**
 * Las herramientas del editor 2D convertían un punto de patrón al espacio
 * local de la pieza restando `piece.position`, sin des-girar. Eso funcionaba
 * porque el tirador de giro horneaba el ángulo en las coordenadas y dejaba
 * `piece.rotation` en 0; solo el "girar 90°" del menú del clic derecho lo
 * exponía, y por un camino que casi nadie usa.
 *
 * Con el giro declarativo (#1033) el camino principal produce piezas giradas,
 * así que la conversión tiene que des-girar. Y hay dos reglas, no una:
 *
 *  - un PUNTO va por `patternToPieceLocal` (quita posición y giro);
 *  - una DIRECCIÓN gira sobre el origen y no se traslada.
 *
 * Tratar una normal como punto la manda a la otra punta de la pieza.
 */

const L_SHAPE: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [60, 0] },
  { type: 'L', values: [60, 20] },
  { type: 'L', values: [20, 20] },
  { type: 'L', values: [20, 80] },
  { type: 'L', values: [0, 80] },
  { type: 'Z', values: [] },
];

const PIEZA_GIRADA = {
  id: 'p1', name: 'L', outline: L_SHAPE, internals: [],
  position: { x: 100, y: 100 }, rotation: 90, mirrored: false, seamAllowance: 0,
} as unknown as PatternPiece;

/** Proyecta un punto local al espacio de patrón como lo hace el renderizador. */
function aPatron(local: { x: number; y: number }) {
  const c = outlineBBoxCenter(L_SHAPE);
  const r = rotatePoint(local, c, Math.PI / 2);
  return { x: r.x + 100, y: r.y + 100 };
}

/** Gira una dirección: sobre el origen, sin trasladar. */
const dirAPatron = (d: { x: number; y: number }) => rotatePoint(d, { x: 0, y: 0 }, Math.PI / 2);

describe('piquete sobre una pieza girada', () => {
  // El medio del borde de arriba en local, y su normal hacia afuera.
  const LOCAL = { x: 30, y: 0 };
  const NORMAL_LOCAL = { x: 0, y: -1 };

  it('coloca el piquete donde se clicó, no donde estaría sin girar', () => {
    const notch = createNotchLine(aPatron(LOCAL), dirAPatron(NORMAL_LOCAL), PIEZA_GIRADA);
    const [bx, by] = notch.path[0].values;
    expect(bx).toBeCloseTo(LOCAL.x);
    expect(by).toBeCloseTo(LOCAL.y);
  });

  it('apunta la marca hacia afuera del borde, no hacia un costado', () => {
    // La normal es una DIRECCIÓN. Si se la trata como punto, la punta del
    // piquete sale disparada al otro extremo de la pieza.
    const notch = createNotchLine(aPatron(LOCAL), dirAPatron(NORMAL_LOCAL), PIEZA_GIRADA);
    const [bx, by] = notch.path[0].values;
    const [tx, ty] = notch.path[1].values;
    expect(tx - bx).toBeCloseTo(NORMAL_LOCAL.x * DEFAULT_NOTCH_OPTIONS.length);
    expect(ty - by).toBeCloseTo(NORMAL_LOCAL.y * DEFAULT_NOTCH_OPTIONS.length);
  });

  it('ancla contra el contorno real, así que la distancia de arco es la de verdad', () => {
    const notch = createNotchLine(aPatron(LOCAL), dirAPatron(NORMAL_LOCAL), PIEZA_GIRADA);
    // Desde la esquina (0,0), media arista de 60.
    expect(notch.notchAnchor!.distanceMm).toBeCloseTo(30);
  });

  it('sin rotación se comporta igual que siempre', () => {
    const recta = { ...PIEZA_GIRADA, rotation: 0 } as PatternPiece;
    const notch = createNotchLine({ x: 130, y: 100 }, { x: 0, y: -1 }, recta);
    expect(notch.path[0].values[0]).toBeCloseTo(30);
    expect(notch.path[0].values[1]).toBeCloseTo(0);
  });
});

/*
 * El trinquete que vivía aquí se mudó a
 * `src/utils/geometry/__tests__/pieceSpace.trinquete.test.ts` (#1069).
 *
 * Decía cubrir "los 24 sitios" y tenía tres puntos ciegos: solo miraba la
 * resta, no era recursivo, y se rodeaba capturando la posición en una
 * variable. El censo real, con las dos direcciones y `src/` entero, son 74
 * sitios en 21 archivos — la deuda de #1068.
 */
