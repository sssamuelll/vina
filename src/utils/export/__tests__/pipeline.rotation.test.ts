import { describe, it, expect } from 'vitest';
import { preparePiece, preparePieces } from '../pipeline';
import type { PatternPiece, PathCommand } from '../../../types/types';

/**
 * El giro de la pieza tiene que entrar en el LAYOUT, no solo en la geometría.
 *
 * Primer intento de #1033: `exportAAMA` giraba la pieza dentro de
 * `pieceEntities`, o sea DESPUÉS de que `preparePieces` ya hubiera decidido
 * `boundingBox` y `currentX` con el contorno sin girar. Con una sola pieza no
 * se nota —`currentX` nunca avanza— y por eso el primer test no lo vio. Con
 * dos, los bloques se pisan.
 *
 * Al girar en `preparePiece` se arregla en un solo sitio, y de paso para los
 * tres consumidores: AAMA, PDF y el layout de corte.
 */

/** Barra alta: 100 de ancho por 400 de alto. Girada 90° pasa a 400 × 100. */
const BARRA: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 400] },
  { type: 'L', values: [0, 400] },
  { type: 'Z', values: [] },
];

function barra(id: string, rotation: number, seamAllowance = 0): PatternPiece {
  return {
    id, name: id, outline: BARRA, internals: [],
    position: { x: 0, y: 0 }, rotation, mirrored: false, seamAllowance,
    layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  } as unknown as PatternPiece;
}

/** Franja que ocupa cada pieza en el eje X ya emplazada. */
const franjaX = (p: { offsetX: number; boundingBox: { minX: number; maxX: number } }) =>
  [p.offsetX + p.boundingBox.minX, p.offsetX + p.boundingBox.maxX] as const;

describe('preparePiece — el giro llega a la caja y al contorno aplanado', () => {
  it('mide la caja de la pieza GIRADA, no la del contorno crudo', () => {
    const recto = preparePiece(barra('a', 0));
    expect(recto.boundingBox.width).toBeCloseTo(100);
    expect(recto.boundingBox.height).toBeCloseTo(400);

    const girado = preparePiece(barra('a', 90));
    expect(girado.boundingBox.width).toBeCloseTo(400);
    expect(girado.boundingBox.height).toBeCloseTo(100);
  });

  it('devuelve el contorno ya girado, para que nadie tenga que girarlo otra vez', () => {
    const girado = preparePiece(barra('a', 90));
    const xs = girado.flatOutline.map(p => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(400);
  });

  it('genera el margen sobre el contorno girado', () => {
    const girado = preparePiece(barra('a', 90, 10));
    expect(girado.seamOutline.length).toBeGreaterThan(0);
    const xs = girado.flatSeamOutline.map(p => p.x);
    // El margen envuelve una barra de 400 de ancho: 400 + 10 por lado.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(420, 0);
  });

  it('sin rotación no cambia nada', () => {
    const a = preparePiece(barra('a', 0));
    expect(a.boundingBox).toEqual(preparePiece(barra('a', 0)).boundingBox);
    expect(a.flatOutline).toEqual(preparePiece(barra('a', 0)).flatOutline);
  });
});

describe('preparePieces — dos piezas, una girada, no se pisan', () => {
  it('deja el espaciado real entre una pieza girada y la siguiente', () => {
    const prep = preparePieces([barra('a', 90), barra('b', 0)], { spacing: 30 });
    const [ini0, fin0] = franjaX(prep[0]);
    const [ini1, fin1] = franjaX(prep[1]);

    expect(fin0 - ini0).toBeCloseTo(400); // la girada ocupa su ancho real
    expect(fin1 - ini1).toBeCloseTo(100);
    // Sin el arreglo, `currentX` avanzaba 100 en vez de 400 y la segunda pieza
    // arrancaba en 130, dentro de la primera.
    expect(ini1).toBeGreaterThanOrEqual(fin0 + 30 - 1e-6);
  });

  it('la pieza girada no se sale a coordenada negativa', () => {
    const prep = preparePieces([barra('a', 90), barra('b', 0)], { spacing: 30 });
    expect(franjaX(prep[0])[0]).toBeCloseTo(0);
  });
});
