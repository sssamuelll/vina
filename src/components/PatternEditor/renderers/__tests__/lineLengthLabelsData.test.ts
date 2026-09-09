/**
 * El largo de cada lado de una pieza (spec 2026-06-04 display-toggles-resurface
 * § 4): uno por borde semántico, formateado en las unidades activas, con
 * repliegue a `detectSemanticEdges` para las piezas sin bordes guardados (DXF).
 *
 * Estas pruebas vivían sobre el componente SVG `LineLengthLabels`, que el
 * contrato del 2026-09-09 dejó sin montar: los largos pasaron a la capa de
 * cotas como lecturas. Un test sobre un componente que nadie renderiza no
 * certifica nada, así que se apuntan al módulo que sí se usa —el cálculo— y el
 * renderizador muerto se borró. La cobertura es la misma; lo que cambia es que
 * ahora mide código vivo.
 */
import { describe, it, expect } from 'vitest';
import type { PatternPiece, SemanticEdge } from '../../../../types/types';
import { lineLengthLabels } from '../lineLengthLabelsData';

// Cuadrado de 100×100 mm, con la MISMA forma que emite `useRectangleTool`:
// `M L L L Z`. El cuarto lado —el izquierdo— lo dibuja la `Z`, y no tiene
// comando propio. El fixture viejo repetía el origen con un quinto `L`, y con
// eso el cierre no existía como tal: el fallo no podía aparecer (#1120).
function squarePiece(edges?: SemanticEdge[]): PatternPiece {
  return {
    id: 'p1',
    name: 'P',
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    createdAt: 0,
    updatedAt: 0,
    active: true,
    edges,
  } as unknown as PatternPiece;
}

describe('lineLengthLabels', () => {
  it('da una etiqueta por borde guardado, en las unidades activas', () => {
    const labels = lineLengthLabels(squarePiece([
      { id: 'e1', name: 'hemline', segmentRange: [1, 2], edgeType: 'hem', length: 100 },
    ]), 'cm');
    expect(labels).toHaveLength(1);
    expect(labels[0].text).toBe('10.0 cm');
  });

  it('formatea en pulgadas cuando las unidades son inches', () => {
    const labels = lineLengthLabels(squarePiece([
      { id: 'e1', name: 'hemline', segmentRange: [1, 2], edgeType: 'hem', length: 100 },
    ]), 'inches');
    expect(labels[0].text).toBe('3.9 in');
  });

  it('coloca la etiqueta en el punto medio del lado', () => {
    // El tramo 1 va de (0,0) a (100,0): su medio es (50, 0).
    const labels = lineLengthLabels(squarePiece([
      { id: 'e1', name: 'hemline', segmentRange: [1, 2], edgeType: 'hem', length: 100 },
    ]), 'cm');
    expect(labels[0].x).toBeCloseTo(50);
    expect(labels[0].y).toBeCloseTo(0);
  });

  it('sin bordes guardados los detecta (la ruta del DXF)', () => {
    // Un cuadrado de cuatro tramos agrupa en cuatro zonas → cuatro bordes.
    const labels = lineLengthLabels(squarePiece(undefined), 'cm');
    expect(labels).toHaveLength(4);
    for (const l of labels) expect(l.text).toBe('10.0 cm');
  });

  it('el lado de cierre también enseña su medida, y en su sitio', () => {
    // Contar cuatro no basta: cuatro etiquetas pueden ser cuatro del lado
    // equivocado. El oráculo es DÓNDE cae la del cierre — el lado izquierdo
    // de un cuadrado de 100 va de (0,100) a (0,0), o sea su medio es (0,50).
    const puntos = lineLengthLabels(squarePiece(undefined), 'cm')
      .map(l => ({ x: l.x, y: l.y }));
    expect(puntos).toContainEqual({ x: 0, y: 50 });
  });

  it('calcula el largo del contorno cuando el borde no lo guarda', () => {
    const labels = lineLengthLabels(squarePiece([
      { id: 'e1', name: 'sideSeam', segmentRange: [2, 3], edgeType: 'seam' } as unknown as SemanticEdge,
    ]), 'cm');
    expect(labels[0].text).toBe('10.0 cm');
  });

  it('se salta los lados degenerados (< 1 mm)', () => {
    const piece = {
      ...squarePiece(),
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [0.5, 0] },
      ],
      edges: [{ id: 'e1', name: 'edge', segmentRange: [1, 2], edgeType: 'unknown', length: 0.5 }],
    } as unknown as PatternPiece;
    expect(lineLengthLabels(piece, 'cm')).toHaveLength(0);
  });
});

describe('el largo guardado no puede ganarle al contorno', () => {
  // Encontrado por el replay de la sesión de María (2026-09-08): tras editar la
  // cota de una pieza a 300×150, las cuatro etiquetas seguían diciendo "100.0
  // mm". La pieza medía 300×150; las etiquetas mentían.
  //
  // La causa es un `??` que prefiere un derivado guardado:
  //   const len = edge.length ?? computePathArcLength(piece.outline, ...)
  // `piece.edges[].length` se calcula al detectar los bordes y NO se refresca
  // en la ruta que redimensiona por cota, así que queda viejo. El contorno es
  // la verdad —"path manda"—; el largo es un derivado suyo y se recalcula.
  //
  // El fixture es el oráculo: un registro que se contradice a sí mismo. El
  // borde dice que mide 100 y su propio tramo, en el contorno, mide 300. No
  // hace falta saber cuál es el bueno: basta con que no puedan discrepar.
  it('recalcula el largo del contorno aunque el borde guarde otro', () => {
    const piece = squarePiece();
    piece.outline = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [300, 0] },
      { type: 'L', values: [300, 150] },
      { type: 'L', values: [0, 150] },
      { type: 'Z', values: [] },
    ];
    // Bordes guardados con el largo de ANTES de redimensionar.
    piece.edges = [
      { id: 'e0', segmentRange: [0, 1], length: 100 },
      { id: 'e1', segmentRange: [1, 2], length: 100 },
      { id: 'e2', segmentRange: [2, 3], length: 100 },
      { id: 'e3', segmentRange: [3, 0], length: 100 },
    ] as unknown as SemanticEdge[];

    const textos = lineLengthLabels(piece, 'mm').map(l => l.text);

    expect(textos.some(t => /300/.test(t)), `los lados de 300 mm tienen que decir 300: ${textos.join(' · ')}`).toBe(true);
    expect(textos.every(t => !/^100([.,]0)?\s*mm$/.test(t.trim())), `ninguna etiqueta puede seguir en 100: ${textos.join(' · ')}`).toBe(true);
  });
});
