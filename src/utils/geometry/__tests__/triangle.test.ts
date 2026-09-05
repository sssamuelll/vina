import { describe, it, expect } from 'vitest';
import {
  isoscelesTriangleVertices, rightTriangleVertices,
  isoscelesTrianglePath, rightTrianglePath,
} from '../triangle';

/**
 * Triángulo isósceles y triángulo rectángulo (#1111, tanda 8 — María pidió
 * «círculo y triángulo»; el círculo ya nació con `ellipse.ts` como plantilla).
 *
 * Un assert que solo cuenta vértices («son tres puntos») pasa en verde con la
 * figura equivocada dentro: aquí cada caso fija DÓNDE cae cada vértice.
 */

describe('isoscelesTriangleVertices', () => {
  it('el ápice cae arriba-centro y la base abajo, inscritos en la caja', () => {
    const [apice, baseDer, baseIzq] = isoscelesTriangleVertices(100, 200, 80, 60);
    expect(apice).toEqual({ x: 140, y: 200 }); // x + w/2, y
    expect(baseDer).toEqual({ x: 180, y: 260 }); // x + w, y + h
    expect(baseIzq).toEqual({ x: 100, y: 260 }); // x, y + h
  });

  it('no depende de hacia dónde se arrastró: la caja es la única entrada', () => {
    // Dos cajas iguales (mismo x,y,w,h) dan el mismo triángulo, aunque el
    // gesto que las produjo haya sido de derecha a izquierda o al revés.
    expect(isoscelesTriangleVertices(0, 0, 40, 40)).toEqual(isoscelesTriangleVertices(0, 0, 40, 40));
  });

  it('es determinista con radios/cajas diminutas y no produce NaN', () => {
    for (const p of isoscelesTriangleVertices(0, 0, 0.01, 0.01)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe('rightTriangleVertices — el ángulo recto cae en la esquina del press', () => {
  it('press arriba-izquierda (cornerLeft, cornerTop): el recto en (x,y)', () => {
    const [recto, adjX, adjY] = rightTriangleVertices(100, 200, 80, 60, true, true);
    expect(recto).toEqual({ x: 100, y: 200 });
    expect(adjX).toEqual({ x: 180, y: 200 }); // mismo y, al otro lado en X
    expect(adjY).toEqual({ x: 100, y: 260 }); // mismo x, al otro lado en Y
  });

  it('press arriba-derecha (!cornerLeft, cornerTop): el recto en (x+w,y)', () => {
    const [recto, adjX, adjY] = rightTriangleVertices(100, 200, 80, 60, false, true);
    expect(recto).toEqual({ x: 180, y: 200 });
    expect(adjX).toEqual({ x: 100, y: 200 });
    expect(adjY).toEqual({ x: 180, y: 260 });
  });

  it('press abajo-izquierda (cornerLeft, !cornerTop): el recto en (x,y+h)', () => {
    const [recto, adjX, adjY] = rightTriangleVertices(100, 200, 80, 60, true, false);
    expect(recto).toEqual({ x: 100, y: 260 });
    expect(adjX).toEqual({ x: 180, y: 260 });
    expect(adjY).toEqual({ x: 100, y: 200 });
  });

  it('press abajo-derecha (!cornerLeft, !cornerTop): el recto en (x+w,y+h)', () => {
    const [recto, adjX, adjY] = rightTriangleVertices(100, 200, 80, 60, false, false);
    expect(recto).toEqual({ x: 180, y: 260 });
    expect(adjX).toEqual({ x: 100, y: 260 });
    expect(adjY).toEqual({ x: 180, y: 200 });
  });

  it('las cuatro esquinas dan triángulos distintos sobre la MISMA caja', () => {
    const caja = [100, 200, 80, 60] as const;
    const variantes = [
      rightTriangleVertices(...caja, true, true),
      rightTriangleVertices(...caja, false, true),
      rightTriangleVertices(...caja, true, false),
      rightTriangleVertices(...caja, false, false),
    ];
    const rectos = variantes.map((v) => JSON.stringify(v[0]));
    expect(new Set(rectos).size).toBe(4);
  });
});

const puntos = (path: ReturnType<typeof isoscelesTrianglePath>) =>
  path.filter((c) => c.type !== 'Z').map((c) => ({ x: c.values[0], y: c.values[1] }));

describe('isoscelesTrianglePath / rightTrianglePath — el contorno', () => {
  it('el isósceles: M, L, L, Z — nunca cuatro comandos de punto', () => {
    const path = isoscelesTrianglePath(0, 0, 100, 100);
    expect(path.map((c) => c.type)).toEqual(['M', 'L', 'L', 'Z']);
  });

  it('el rectángulo: M, L, L, Z, igual que el isósceles', () => {
    const path = rightTrianglePath(0, 0, 100, 100, true, true);
    expect(path.map((c) => c.type)).toEqual(['M', 'L', 'L', 'Z']);
  });

  it('Z cierra el contorno sin repetir el primer punto con un L final (#1120)', () => {
    // El bug que tapó meses en este repo: un contorno con una L de vuelta al
    // punto de partida duplica el vértice — `commandsToShape` ya cierra el
    // `THREE.Shape` con el propio Z. Aquí eso se traduce en exactamente DOS
    // comandos 'L' (los otros dos vértices), nunca tres.
    const path = isoscelesTrianglePath(10, 20, 100, 80);
    const eles = path.filter((c) => c.type === 'L');
    expect(eles).toHaveLength(2);
    expect(path[path.length - 1]).toEqual({ type: 'Z', values: [] });
    // El último punto dibujado (antes de Z) es distinto del primero: si
    // fueran iguales, sería la L redundante que repite el punto de arranque.
    const [primero, , ultimo] = puntos(path);
    expect(ultimo).not.toEqual(primero);
  });

  it('nunca usa el comando A, que el 3D descarta en silencio', () => {
    expect(isoscelesTrianglePath(0, 0, 50, 30).some((c) => c.type === 'A')).toBe(false);
    expect(rightTrianglePath(0, 0, 50, 30, true, true).some((c) => c.type === 'A')).toBe(false);
  });

  it('los vértices del path son exactamente los de la función de vértices', () => {
    const verts = isoscelesTriangleVertices(10, 20, 100, 80);
    const path = isoscelesTrianglePath(10, 20, 100, 80);
    expect(puntos(path)).toEqual(verts.map((p) => ({ x: p.x, y: p.y })));
  });
});
