// @vitest-environment jsdom
/**
 * #1064 — tras #1033, el hit-testing apunta al fantasma de la pieza sin girar.
 *
 * #1033 volvió el giro DECLARATIVO: el tirador dejó de aplicar el ángulo a las
 * coordenadas del `outline` y pasó a escribir `piece.rotation`, que el
 * renderizador aplica como un `rotate()` sobre el grupo. Hasta ese día
 * `rotation` valía 0 en la práctica, así que convertir pantalla→local restando
 * solo `position` era la conversión COMPLETA. Desde ese día no lo es.
 *
 * Todo hit-test que siga restando solo la posición pregunta por un sitio donde
 * la pieza ya no está. Medido antes del arreglo, con la pieza a 90°: clicar
 * encima del borde devolvía `null`, y clicar en el aire —donde el borde estaba
 * ANTES de girar— sí enganchaba.
 *
 * El punto de prueba no se calcula a mano: sale de `pieceLocalToPattern`, que
 * es el mismo transform que usa el renderizador para dibujar. Si la pieza se
 * dibuja ahí, el hit-test tiene que encontrarla ahí.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import type React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer from '../../../store/toolSlice';
import editorReducer from '../../../store/editorSlice';
import { snapToEdge } from '../useSegmentSewingTool';
import { resolveSeamAllowanceClick } from '../../../utils/seam/edgeHitTest';
import { hitTestPieceBBox, findNearestPiece } from '../../../utils/geometry/hitTest';
import { pieceLocalToPattern } from '../pieceTransform';
import { useTopstitchTool } from '../useTopstitchTool';
import type { PatternPiece, Point2D, SemanticEdge } from '../../../types/types';

/**
 * Forma de L: asimétrica en los dos ejes. Un rectángulo no sirve — su caja
 * girada 90° se parece demasiado a la original y los fallos se disimulan.
 */
const L: PatternPiece['outline'] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [160, 0] },   // 1: arriba
  { type: 'L', values: [160, 60] },  // 2
  { type: 'L', values: [60, 60] },   // 3
  { type: 'L', values: [60, 220] },  // 4
  { type: 'L', values: [0, 220] },   // 5
  { type: 'Z', values: [] },         // 6: izquierda
];

const EDGES = [
  { id: 'e1', name: 'arriba', segmentRange: [1, 2] },
  { id: 'e2', name: 'der-alta', segmentRange: [2, 3] },
  { id: 'e3', name: 'escalon', segmentRange: [3, 4] },
  { id: 'e4', name: 'der-baja', segmentRange: [4, 5] },
  { id: 'e5', name: 'abajo', segmentRange: [5, 6] },
] as SemanticEdge[];

function pieza(rotation: number): PatternPiece {
  return {
    id: 'p1', name: 'Mutada', outline: L, edges: EDGES,
    internals: [], position: { x: 150, y: 180 }, rotation, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  };
}

/** Dónde SE VE un punto local de la pieza — el mismo transform del renderizador. */
const enPantalla = (local: Point2D, p: PatternPiece): Point2D =>
  pieceLocalToPattern(local, p);

/** Punto medio del borde de arriba, en local. */
const MEDIO_ARRIBA: Point2D = { x: 80, y: 0 };

describe('#1064 — coser y piquete (snapToEdge)', () => {
  it('sin girar engancha el borde de arriba', () => {
    const p = pieza(0);
    const snap = snapToEdge(enPantalla(MEDIO_ARRIBA, p), p, 1);
    expect(snap?.edgeIndex).toBe(1);
  });

  it('girada 90° engancha DONDE SE VE el borde', () => {
    const p = pieza(90);
    const snap = snapToEdge(enPantalla(MEDIO_ARRIBA, p), p, 1);
    expect(snap).not.toBeNull();
    expect(snap!.edgeIndex).toBe(1);
  });

  it('girada 37° tampoco depende del ángulo', () => {
    const p = pieza(37);
    const snap = snapToEdge(enPantalla(MEDIO_ARRIBA, p), p, 1);
    expect(snap?.edgeIndex).toBe(1);
  });

  it('el punto que devuelve se puede volver a dibujar donde se clicó', () => {
    // `snapToEdge` devuelve el punto en espacio de PATRÓN. Si la entrada se
    // des-gira pero la salida no se vuelve a girar, el resalte sale a medio
    // camino: ni donde está la pieza ni donde estaba.
    const p = pieza(90);
    const clic = enPantalla(MEDIO_ARRIBA, p);
    const snap = snapToEdge(clic, p, 1);
    expect(snap).not.toBeNull();
    expect(snap!.point.x).toBeCloseTo(clic.x, 1);
    expect(snap!.point.y).toBeCloseTo(clic.y, 1);
  });

  it('girada, el aire donde ESTABA el borde ya no engancha', () => {
    // El espejo del fallo: hasta ahora esto SÍ enganchaba, y era lo único que
    // enganchaba. Sin este caso, el arreglo podría dejar los dos sitios vivos.
    const p = pieza(90);
    const sinGirar = { x: MEDIO_ARRIBA.x + p.position.x, y: MEDIO_ARRIBA.y + p.position.y };
    expect(snapToEdge(sinGirar, p, 1)).toBeNull();
  });
});

describe('#1064 — margen de costura (resolveSeamAllowanceClick)', () => {
  const V = 10, E = 12;

  it('sin girar engancha el borde de arriba', () => {
    const p = pieza(0);
    const t = resolveSeamAllowanceClick([p], enPantalla(MEDIO_ARRIBA, p), V, E);
    expect(t).toMatchObject({ kind: 'edge', edgeId: 'e1' });
  });

  it('girada 90° engancha DONDE SE VE el borde', () => {
    const p = pieza(90);
    const t = resolveSeamAllowanceClick([p], enPantalla(MEDIO_ARRIBA, p), V, E);
    expect(t).toMatchObject({ kind: 'edge', edgeId: 'e1' });
  });

  it('girada, una esquina se sigue reconociendo como esquina', () => {
    const p = pieza(90);
    // El vértice (160,0), esquina superior derecha del contorno local.
    const t = resolveSeamAllowanceClick([p], enPantalla({ x: 160, y: 0 }, p), V, E);
    expect(t).toMatchObject({ kind: 'vertex' });
  });
});

describe('#1064 — línea y hilo (hitTestPieceBBox / findNearestPiece)', () => {
  /** Punto del escalón interior de la L: dentro de la caja, y con la pieza a
   *  90° cae MUY lejos de donde la caja sin girar lo pone. */
  const DENTRO: Point2D = { x: 30, y: 200 };

  it('sin girar el punto cae dentro de la pieza', () => {
    const p = pieza(0);
    expect(hitTestPieceBBox(enPantalla(DENTRO, p), [p])?.id).toBe('p1');
    expect(findNearestPiece(enPantalla(DENTRO, p), [p], 0)).toBe('p1');
  });

  it('girada 90° el punto sigue cayendo dentro', () => {
    const p = pieza(90);
    expect(hitTestPieceBBox(enPantalla(DENTRO, p), [p])?.id).toBe('p1');
    expect(findNearestPiece(enPantalla(DENTRO, p), [p], 0)).toBe('p1');
  });

  it('girada, un punto claramente fuera sigue fuera', () => {
    const p = pieza(90);
    expect(hitTestPieceBBox({ x: 5000, y: 5000 }, [p])).toBeNull();
  });
});

describe('#1064 — pespunte (findEdge)', () => {
  const ev = (x: number, y: number) =>
    ({
      button: 0, clientX: x, clientY: y,
      currentTarget: {
        getBoundingClientRect: () => ({
          left: 0, top: 0, width: 900, height: 700,
          right: 900, bottom: 700, x: 0, y: 0, toJSON: () => ({}),
        }),
      },
      preventDefault: vi.fn(),
    }) as unknown as React.MouseEvent<SVGSVGElement>;

  // El modo por defecto de pespunte es `seamline`, que es el que usa `findEdge`.
  const montar = (p: PatternPiece) => {
    const store = configureStore({ reducer: { tools: toolReducer, editor: editorReducer } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(Provider, { store, children });
    return renderHook(
      () => useTopstitchTool(1, { x: 0, y: 0 }, [p]),
      { wrapper },
    );
  };

  it('sin girar resalta el borde bajo el cursor', () => {
    const p = pieza(0);
    const { result } = montar(p);
    const pt = enPantalla(MEDIO_ARRIBA, p);
    act(() => { result.current.handleMouseMove(ev(pt.x, pt.y)); });
    expect(result.current.hoveredEdge).not.toBeNull();
  });

  it('girada 90° resalta DONDE SE VE el borde', () => {
    const p = pieza(90);
    const { result } = montar(p);
    const pt = enPantalla(MEDIO_ARRIBA, p);
    act(() => { result.current.handleMouseMove(ev(pt.x, pt.y)); });
    expect(result.current.hoveredEdge).not.toBeNull();
  });
});
