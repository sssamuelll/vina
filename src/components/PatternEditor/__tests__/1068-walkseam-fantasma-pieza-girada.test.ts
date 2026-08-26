/**
 * #1068 — coser caminando colocaba el fantasma sobre el fantasma.
 *
 * `computeGhostTransform` recibia la posicion SUELTA (`stationaryPos`,
 * `mobilePos`) en vez de la pieza, asi que el archivo ni menciona
 * `piece.position` y el trinquete del #1068 no puede verlo. El rodeo aqui no
 * es sintactico sino arquitectonico: desacoplar la posicion en un parametro
 * esconde la conversion del censo.
 *
 * Lo que hacia mal, con las dos piezas sin girar, nada; con cualquiera de las
 * dos girada, tres cosas a la vez:
 *  - el punto de apoyo salia de sumar `position` al punto local, o sea el
 *    borde estacionario SIN girar;
 *  - el angulo de alineacion se medía entre tangentes LOCALES, ignorando los
 *    dos giros;
 *  - el `transform` del fantasma reemplazaba al del renderizador y omitia el
 *    `rotate(piece.rotation, cx, cy)`, asi que la pieza movil se dibujaba
 *    sin girar.
 *
 * Los numeros de abajo salen a mano; cada uno esta anotado.
 */
import { describe, expect, it } from 'vitest';
import type { PatternPiece, SemanticEdge } from '../../../types/types';
import { computeGhostTransform } from '../useWalkSeamTool';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import { rotatePoint } from '../../../utils/geometry/transform';

/** 100 x 80; centro del bbox (50, 40). Borde 'top' = comando 1. */
function rect(id: string, x: number, rotation: number): PatternPiece {
  return {
    id, name: id,
    position: { x, y: 0 },
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 80] },
      { type: 'L', values: [0, 80] },
      { type: 'Z', values: [] },
    ],
    edges: [{ id: `${id}:top`, name: 'top', segmentRange: [1, 2], edgeType: 'seam' }] as SemanticEdge[],
    internals: [], rotation, mirrored: false, seamAllowance: 0,
    layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  } as unknown as PatternPiece;
}

const TOP: [number, number] = [1, 2];

/** El fantasma, aplicado a un punto LOCAL de la pieza movil. */
function fantasma(
  g: ReturnType<typeof computeGhostTransform>,
  movil: PatternPiece,
  local: { x: number; y: number },
) {
  // Mismo orden que el `transform=` del overlay, de dentro hacia afuera:
  // la pose del renderizador, luego el giro de alineacion, luego el arrastre.
  const pose = pieceLocalToPattern(local, movil);
  const girado = rotatePoint(pose, { x: g.pivotX, y: g.pivotY }, (g.angleDeg * Math.PI) / 180);
  return { x: girado.x + g.tx, y: girado.y + g.ty };
}

describe('#1068 — el fantasma de coser caminando sobre una pieza girada', () => {
  it('la ESTACIONARIA girada: el fantasma se acuesta sobre el borde que se VE', () => {
    // A girada 90 sobre (50,40): su borde 'top' se ve como la vertical x=90,
    // de y=-10 a y=90. Caminar 50mm cae justo en el medio, (90,40).
    const g = computeGhostTransform(rect('A', 0, 90), TOP, rect('B', 200, 0), TOP, 50);

    // El punto de contacto movil —local (50,0), o sea patron (250,0)— tiene
    // que aterrizar EXACTAMENTE en el punto de caminado.
    const contacto = fantasma(g, rect('B', 200, 0), { x: 50, y: 0 });
    expect(contacto.x).toBeCloseTo(90, 3);
    expect(contacto.y).toBeCloseTo(40, 3);

    // Y el extremo del borde movil sobre el extremo del estacionario: no basta
    // con acertar un punto, el borde entero tiene que quedar acostado encima.
    const extremo = fantasma(g, rect('B', 200, 0), { x: 100, y: 0 });
    expect(extremo.x).toBeCloseTo(90, 3);
    expect(extremo.y).toBeCloseTo(90, 3);

    expect(g.angleDeg).toBeCloseTo(90, 3);
  });

  it('la MOVIL girada: el fantasma parte de la pose real, no del contorno crudo', () => {
    // B girada 90: su borde 'top' se ve vertical en x=290, de y=-10 a y=90.
    // La estacionaria A sin girar: su 'top' va de (0,0) a (100,0).
    const g = computeGhostTransform(rect('A', 0, 0), TOP, rect('B', 200, 90), TOP, 50);

    const contacto = fantasma(g, rect('B', 200, 90), { x: 50, y: 0 });
    expect(contacto.x).toBeCloseTo(50, 3);
    expect(contacto.y).toBeCloseTo(0, 3);

    const extremo = fantasma(g, rect('B', 200, 90), { x: 100, y: 0 });
    expect(extremo.x).toBeCloseTo(100, 3);
    expect(extremo.y).toBeCloseTo(0, 3);

    // Girada la movil, hace falta DESgirarla para acostarla sobre la horizontal.
    expect(g.angleDeg).toBeCloseTo(-90, 3);
  });

  it('las DOS giradas igual: no hace falta ningun giro extra', () => {
    const g = computeGhostTransform(rect('A', 0, 90), TOP, rect('B', 200, 90), TOP, 50);
    expect(g.angleDeg).toBeCloseTo(0, 3);

    const contacto = fantasma(g, rect('B', 200, 90), { x: 50, y: 0 });
    expect(contacto.x).toBeCloseTo(90, 3);
    expect(contacto.y).toBeCloseTo(40, 3);
  });

  it('sin rotacion se comporta igual que siempre', () => {
    const g = computeGhostTransform(rect('A', 0, 0), TOP, rect('B', 200, 0), TOP, 50);
    expect(g.angleDeg).toBeCloseTo(0, 3);

    const contacto = fantasma(g, rect('B', 200, 0), { x: 50, y: 0 });
    expect(contacto.x).toBeCloseTo(50, 3);
    expect(contacto.y).toBeCloseTo(0, 3);
  });
});
