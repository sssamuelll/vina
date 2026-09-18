// @vitest-environment jsdom
/**
 * Las dos superficies que se quedan en blanco sobre el lado de cierre (#1143).
 *
 * Los dos overlays leen el `segmentRange` del borde sin traducirlo, y el tramo
 * de cierre se rotula con el índice de la `M`, que no dibuja. Ninguno de los
 * dos falla ni avisa: los dos hacen `return null`.
 *
 *   - `POMOverlay`: una cota «a lo largo del borde» puesta sobre ese lado no
 *     pinta ni la línea ni su número. El POM existe en el proyecto y en el
 *     panel; en el lienzo no está.
 *   - `WalkSeamOverlay`: elegir ese lado para caminar la costura no resalta
 *     nada, así que parece que el clic no cogió.
 *
 * El oráculo no cuenta nodos —eso pasaría con el borde equivocado pintado—:
 * mide DÓNDE cae lo que se pinta. En el rectángulo de la prueba el lado de
 * cierre es el izquierdo, x=0 de y=0 a y=150.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import POMOverlay from '../overlays/POMOverlay';
import WalkSeamOverlay from '../overlays/WalkSeamOverlay';
import { detectSemanticEdges } from '../../../../utils/semanticEdges';
import type { PathCommand, PatternPiece, PointOfMeasure, SemanticEdge } from '../../../../types/types';

afterEach(cleanup);

const cmds = (...c: Array<[string, number[]]>): PathCommand[] =>
  c.map(([type, values]) => ({ type, values })) as PathCommand[];

/** Rectángulo 200×150 en el origen: el lado de cierre es x=0, de y=150 a y=0. */
function rect(): PatternPiece {
  const p = {
    id: 'p1', name: 'Delantero',
    outline: cmds(['M', [0, 0]], ['L', [200, 0]], ['L', [200, 150]], ['L', [0, 150]], ['Z', []]),
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, active: true, layer: 1, sublayer: 0, createdAt: 0, updatedAt: 0,
  } as unknown as PatternPiece;
  return { ...p, edges: detectSemanticEdges(p) } as PatternPiece;
}

function bordeDeCierre(p: PatternPiece): SemanticEdge {
  const e = (p.edges ?? []).find(
    (x) => x.segmentRange[1] === x.segmentRange[0] + 1 && p.outline[x.segmentRange[0]].type === 'M',
  );
  if (!e) throw new Error('ningún borde apunta a la M: cambió la forma del productor');
  return e;
}

describe('la cota a lo largo del borde de cierre se pinta', () => {
  it('pinta el lado izquierdo, no nada', () => {
    const p = rect();
    const cierre = bordeDeCierre(p);
    const pom: PointOfMeasure = {
      id: 'pom1', name: 'Largo costado', category: 'custom', method: 'alongEdge',
      pointA: { pieceId: p.id, edgeName: cierre.name, t: 0, localPosition: { x: 0, y: 0 } },
      pointB: { pieceId: p.id, edgeName: cierre.name, t: 1, localPosition: { x: 0, y: 150 } },
      value: 150, createdAt: 0, updatedAt: 0,
    } as PointOfMeasure;

    const { container } = render(
      <svg><POMOverlay poms={[pom]} pieces={[p]} zoom2D={1} selectedPOMId={null} /></svg>,
    );

    const lineas = [...container.querySelectorAll('line')];
    expect(lineas.length, 'la cota no pintó ni un segmento sobre el lado de cierre').toBeGreaterThan(0);

    const xs = lineas.flatMap((l) => [Number(l.getAttribute('x1')), Number(l.getAttribute('x2'))]);
    const ys = lineas.flatMap((l) => [Number(l.getAttribute('y1')), Number(l.getAttribute('y2'))]);
    expect(Math.max(...xs), 'pintó sobre otro lado: el de cierre está en x=0').toBeLessThan(1);
    expect(Math.max(...ys) - Math.min(...ys), 'el segmento pintado no cubre el lado entero').toBeCloseTo(150, 0);
  });
});

describe('caminar la costura resalta el borde de cierre', () => {
  it('resalta el lado izquierdo al elegirlo', () => {
    const p = rect();
    const cierre = bordeDeCierre(p);

    const { container } = render(
      <svg>
        <WalkSeamOverlay
          zoom2D={1}
          stationaryEdge={{ pieceId: p.id, piece: p, edge: cierre, arcLength: cierre.length ?? 0 }}
          mobileEdge={null}
          walkDistance={0}
          ghostTransform={null}
          ghostOpacity={0.5}
          mismatchSamples={[]}
          metrics={null}
          formatDistance={(d: number) => `${d}`}
          hoveredSnapPoint={null}
        />
      </svg>,
    );

    const resalte = container.querySelector('polyline');
    expect(resalte, 'elegir el lado de cierre no resalta nada: parece que el clic no cogió').not.toBeNull();

    const puntos = (resalte!.getAttribute('points') ?? '')
      .trim().split(/\s+/).map((par) => par.split(',').map(Number));
    expect(puntos.length, 'el resalte se pintó con menos de dos puntos').toBeGreaterThan(1);
    expect(Math.max(...puntos.map(([x]) => x)), 'resaltó otro lado: el de cierre está en x=0').toBeLessThan(1);
  });
});
