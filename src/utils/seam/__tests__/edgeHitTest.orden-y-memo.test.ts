import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveSeamAllowanceClick } from '../edgeHitTest';
import { flattenPathWithSource } from '../index';
import type { PathCommand, PatternPiece, SemanticEdge } from '../../../types/types';

/**
 * Spec 2026-09-02 § 5.2 (precondición bloqueante de rendimiento) y § 5.3.
 *
 * Con hover, `resolveSeamAllowanceClick` pasa a correr en CADA mousemove con
 * la herramienta activa: 60-120 veces por segundo sobre ~20 piezas del DXF de
 * María. Antes aplanaba el contorno en cada llamada (`flattenPathWithSource`
 * aloja un arreglo nuevo): tormenta de GC. Se fija que (1) el aplanado se
 * memoiza por identidad del arreglo `outline` y (2) una pieza cuya caja no
 * puede contener el punto no se aplana. Y (3) el contrato de orden: la
 * PRIMERA pieza del arreglo gana — el llamador pasa las dibujables de arriba
 * a abajo, así que en un solape gana la que se ve.
 */
vi.mock('../index', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../index')>();
  return { ...orig, flattenPathWithSource: vi.fn(orig.flattenPathWithSource) };
});

const aplanados = () => vi.mocked(flattenPathWithSource).mock.calls.map(c => c[0]);

/** Arreglos NUEVOS cada vez: el memo va por identidad y un fixture compartido lo taparía. */
const cuadrado = (): PathCommand[] => [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
];
const bordes = (id: string): SemanticEdge[] => [
  { id: `${id}:top`, name: 'top', segmentRange: [1, 2], edgeType: 'seam' },
  { id: `${id}:right`, name: 'right', segmentRange: [2, 3], edgeType: 'seam' },
  { id: `${id}:bottom`, name: 'bottom', segmentRange: [3, 4], edgeType: 'hem' },
];
const pieza = (id: string, x: number, outline = cuadrado()): PatternPiece => ({
  id, name: id, outline, position: { x, y: 0 }, rotation: 0, mirrored: false,
  edges: bordes(id), seamAllowance: 10, internals: [],
} as unknown as PatternPiece);

beforeEach(() => { vi.mocked(flattenPathWithSource).mockClear(); });

describe('resolveSeamAllowanceClick — memo del aplanado', () => {
  it('cien resoluciones sobre el mismo contorno no aplanan más que la primera', () => {
    const p = pieza('p', 0);
    const resolver = (i: number) => expect(resolveSeamAllowanceClick([p], { x: 100 + (i % 7), y: 2 }, 10, 12))
      .toEqual({ kind: 'edge', pieceId: 'p', edgeId: 'p:top' });
    resolver(0);
    // La primera llamada puede aplanar más de una vez (el hit-test y el
    // detector de esquinas tienen cada uno su memo); lo que se fija es que
    // las 99 siguientes no aplanen NADA.
    const trasLaPrimera = aplanados().filter(o => o === p.outline).length;
    expect(trasLaPrimera).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < 100; i++) resolver(i);
    expect(aplanados().filter(o => o === p.outline)).toHaveLength(trasLaPrimera);
  });

  it('un contorno nuevo (la pieza cambió) se vuelve a aplanar; el viejo no se reusa', () => {
    const antes = cuadrado();
    const despues = cuadrado();
    resolveSeamAllowanceClick([pieza('p', 0, antes)], { x: 100, y: 2 }, 10, 12);
    const deAntes = aplanados().filter(o => o === antes).length;
    expect(deAntes).toBeGreaterThanOrEqual(1);
    resolveSeamAllowanceClick([pieza('p', 0, despues)], { x: 100, y: 2 }, 10, 12);
    expect(aplanados().filter(o => o === despues).length).toBeGreaterThanOrEqual(1);
    expect(aplanados().filter(o => o === antes)).toHaveLength(deAntes);
  });

  it('la pieza cuya caja no alcanza el punto NO se aplana (rechazo por caja antes de aplanar)', () => {
    const cerca = pieza('cerca', 0);
    const lejos = pieza('lejos', 1000);
    expect(resolveSeamAllowanceClick([lejos, cerca], { x: 100, y: 2 }, 10, 12))
      .toEqual({ kind: 'edge', pieceId: 'cerca', edgeId: 'cerca:top' });
    expect(aplanados()).toContain(cerca.outline);
    expect(aplanados()).not.toContain(lejos.outline);
  });

  it('el rechazo por caja respeta el radio: un punto a 8 px fuera de la caja sigue enganchando el borde', () => {
    const p = pieza('p', 0);
    // y = -8: fuera de la caja [0,200], dentro del radio de 12 del borde de arriba.
    expect(resolveSeamAllowanceClick([p], { x: 100, y: -8 }, 10, 12))
      .toEqual({ kind: 'edge', pieceId: 'p', edgeId: 'p:top' });
  });
});

describe('resolveSeamAllowanceClick — la primera pieza del arreglo gana', () => {
  it('dos piezas encimadas con el mismo borde bajo el punto: gana la primera', () => {
    const abajo = pieza('abajo', 0);
    const arriba = pieza('arriba', 0);
    expect(resolveSeamAllowanceClick([arriba, abajo], { x: 100, y: 2 }, 10, 12))
      .toEqual({ kind: 'edge', pieceId: 'arriba', edgeId: 'arriba:top' });
    expect(resolveSeamAllowanceClick([abajo, arriba], { x: 100, y: 2 }, 10, 12))
      .toEqual({ kind: 'edge', pieceId: 'abajo', edgeId: 'abajo:top' });
  });

  it('y también para el cuerpo (pase 2)', () => {
    const abajo = pieza('abajo', 0);
    const arriba = pieza('arriba', 0);
    expect(resolveSeamAllowanceClick([arriba, abajo], { x: 100, y: 100 }, 10, 12))
      .toEqual({ kind: 'piece', pieceId: 'arriba' });
  });
});
