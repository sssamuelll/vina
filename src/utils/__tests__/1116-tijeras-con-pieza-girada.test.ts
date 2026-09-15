import { describe, expect, it } from 'vitest';
import { splitPieceAtLine } from '../patternOps';
import { pieceLocalToPattern } from '../geometry/pieceSpace';
import type { PatternPiece } from '../../types/types';
import {
  transitionMouseDown,
  INITIAL_STATE,
} from '../../components/PatternEditor/useSlashAndSpreadTool';

/**
 * #1116 — Tijeras mezcla marcos de coordenadas con piezas giradas.
 *
 * `splitPieceAtLine` documenta que recibe puntos «en espacio de patrón
 * (coordenadas absolutas)» y luego los baja a local **restando solo la
 * posición**. Con la pieza girada eso no es local: es el punto girado con la
 * traslación quitada, que cae en cualquier otro sitio. La línea de corte que
 * la usuaria dibujó sobre el borde deja de tocar el contorno, y el corte
 * revienta o parte por donde nadie pidió.
 *
 * El oráculo no mira un signo ni una fórmula: **una línea que atraviesa la
 * pieza de lado a lado tiene que cortarla**, esté la pieza girada o no. Eso no
 * depende de ningún convenio, y por eso no se puede congelar mal.
 *
 * Con `rotation: 0` todo esto pasa igual de verde — que es exactamente por qué
 * vivió tanto: TODOS los tests de tijeras usan piezas sin girar.
 */

const cuadrado = (rotation: number): PatternPiece => ({
  id: 'p1',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 200] },
    { type: 'L', values: [0, 200] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  position: { x: 100, y: 50 },
  rotation,
  mirrored: false,
  seamAllowance: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
});

/** La línea horizontal que parte la pieza por la mitad, dicha en patrón. */
function corteHorizontal(piece: PatternPiece) {
  return {
    desde: pieceLocalToPattern({ x: -20, y: 100 }, piece),
    hasta: pieceLocalToPattern({ x: 220, y: 100 }, piece),
  };
}

describe('#1116 — el corte no depende de cómo esté girada la pieza', () => {
  it('control: sin girar, una línea de lado a lado parte la pieza en dos', () => {
    const piece = cuadrado(0);
    const { desde, hasta } = corteHorizontal(piece);

    const [a, b] = splitPieceAtLine(piece, desde, hasta);

    expect(a.outline.length).toBeGreaterThan(2);
    expect(b.outline.length).toBeGreaterThan(2);
  });

  it('girada 45°, la MISMA línea de lado a lado también la parte', () => {
    const piece = cuadrado(45);
    const { desde, hasta } = corteHorizontal(piece);

    const [a, b] = splitPieceAtLine(piece, desde, hasta);

    expect(a.outline.length).toBeGreaterThan(2);
    expect(b.outline.length).toBeGreaterThan(2);
  });

  it.each([0, 45, 90, 137])('girada %i°, cada mitad se queda de su lado del corte', (rot) => {
    const piece = cuadrado(rot);
    const { desde, hasta } = corteHorizontal(piece);

    const [a, b] = splitPieceAtLine(piece, desde, hasta);

    // El corte va por y=100 en LOCAL, así que una mitad vive entera por encima
    // y la otra entera por debajo. Cuál vuelve primero no está garantizado, y
    // fijarlo sería congelar un detalle de `splitOutlineAtPoints` que no es la
    // promesa — lo que sí es promesa es que NINGUNA cruza la línea.
    const yesDe = (p: PatternPiece) => p.outline.flatMap(c =>
      c.values.filter((_, i) => i % 2 === 1));
    const mitades = [yesDe(a), yesDe(b)];

    for (const ys of mitades) {
      const cruza = Math.max(...ys) > 100.01 && Math.min(...ys) < 99.99;
      expect(cruza).toBe(false);
    }
    // Y son mitades de verdad: una toca el techo y la otra el suelo.
    expect(Math.min(...mitades[0], ...mitades[1])).toBeCloseTo(0, 1);
    expect(Math.max(...mitades[0], ...mitades[1])).toBeCloseTo(200, 1);
  });
});

/**
 * El hermano: `useSlashAndSpreadTool` traía el mismo bug copiado letra por
 * letra, y `useExtendTrimTool` lo tenía en tres sitios. El de aquí se prueba
 * sin montar React porque el hook expone sus transiciones puras.
 *
 * El oráculo es de ida y vuelta: el punto al que engancha se DEVUELVE en
 * espacio de patrón, así que bajarlo otra vez a local tiene que dar un punto
 * sobre el contorno. Sumar la posición a secas deshace media vuelta y el
 * enganche cae fuera de la pieza que se ve.
 */
describe('#1116 hermano — Slash & Spread engancha sobre la pieza que se ve', () => {
  const ctx = (piece: PatternPiece) => ({
    pieces: [piece],
    selectedPieceIds: [piece.id],
    toolOptions: {},
    zoom2D: 1,
    pan2D: { x: 0, y: 0 },
    layerLocked: {},
  });

  it.each([0, 45, 137])('girada %i°, el enganche cae sobre el borde', (rot) => {
    const piece = cuadrado(rot);
    // El medio del lado de arriba, dicho en patrón.
    const sobreElBorde = pieceLocalToPattern({ x: 100, y: 0 }, piece);

    const next = transitionMouseDown(INITIAL_STATE, sobreElBorde, ctx(piece));

    expect(next.phase).toBe('drawingSlash');
    expect(next.startPoint!.x).toBeCloseTo(sobreElBorde.x, 6);
    expect(next.startPoint!.y).toBeCloseTo(sobreElBorde.y, 6);
  });
});
