import { describe, it, expect } from 'vitest';
import { detectSemanticEdges } from '../semanticEdges';
import { extractThread } from '../export/bomExtractor';
import { extractTrims } from '../trim/trimExtractor';
import { mapNotchAcrossSeam } from '../seam/notchMirror';
import { walkDistanceAt } from '../../components/PatternEditor/useWalkSeamTool';
import { measureAlongCurveTool } from '../../copilot/reasoning/bridge/meta-tools/measureAlongCurve';
import { compareCurvesMetaTool } from '../../copilot/reasoning/bridge/meta-tools/compareCurves';
import { pieceLocalToPattern } from '../geometry/pieceSpace';
import { interpolateEdgePoint } from '../geometry/edgeInterpolation';
import type { PathCommand, PatternPiece, Seam, SemanticEdge } from '../../types/types';
import type { Trim } from '../../types/trim';

/**
 * Los consumidores que MIDEN sobre un `segmentRange` sin traducirlo (#1143).
 *
 * Cuarta vuelta del mismo defecto. `SemanticEdge.segmentRange` viene en la
 * convención del PRODUCTOR: el tramo de cierre —el que la `Z` dibuja de vuelta
 * al punto de la `M`— se rotula con el índice de la `M`, que no dibuja nada.
 * Quien mida ese rango sin pasarlo por `rangoMedibleDeBorde` obtiene CERO. En
 * un rectángulo hecho con la herramienta, eso es un lado entero de la pieza.
 *
 * Las tres vueltas anteriores arreglaron los sitios que alguien miraba ese día
 * (`ElasticRenderer` y `edgeInterpolation` el 06-09; `LineLengthLabels` en
 * #1120; `pomCompute` y el hover de Medir tras la revisión de la tanda 8). Este
 * archivo cubre a los que quedaron, y cada uno por la puerta por la que el
 * número le llega a la usuaria: el hilo del BOM, los avíos por metro, las dos
 * meta-tools con las que el copiloto mide, el espejo de piquetes y el recorrido
 * de «caminar la costura».
 *
 * EL ORÁCULO NO SABE DEL CONVENIO, a propósito: cada borde YA declara su
 * `length`, que el productor calculó recorriendo el tramo. Si lo que el
 * consumidor mide no reproduce lo que el borde declara, el objeto se
 * contradice a sí mismo — y eso no se puede congelar mal. Es el mismo oráculo
 * de `el-borde-de-cierre-mide.test.ts`, un piso más arriba: allí se afirma del
 * helper, aquí de quien lo tenía que llamar.
 *
 * Los dos rectángulos miden 200×150 a propósito: con un cuadrado, medir el
 * lado equivocado daría el mismo número y el test pasaría con el bug dentro.
 */

const cmds = (...c: Array<[string, number[]]>): PathCommand[] =>
  c.map(([type, values]) => ({ type, values })) as PathCommand[];

function rect(id: string, name: string, x: number, y: number, w: number, h: number): PatternPiece {
  const p = {
    id, name,
    outline: cmds(['M', [x, y]], ['L', [x + w, y]], ['L', [x + w, y + h]], ['L', [x, y + h]], ['Z', []]),
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, active: true,
  } as unknown as PatternPiece;
  return { ...p, edges: detectSemanticEdges(p) } as PatternPiece;
}

/** El borde cuyo rango apunta a la `M`: el tramo de cierre, el que mide cero. */
function bordeDeCierre(p: PatternPiece): SemanticEdge {
  const e = (p.edges ?? []).find(
    (x) => x.segmentRange[1] === x.segmentRange[0] + 1 && p.outline[x.segmentRange[0]].type === 'M',
  );
  if (!e) throw new Error('ningún borde apunta a la M: cambió la forma del productor');
  return e;
}

function costura(p: PatternPiece, ea: SemanticEdge, q: PatternPiece, eb: SemanticEdge): Seam {
  return {
    id: 's1',
    pieceA: { pieceId: p.id, edgeName: ea.name },
    pieceB: { pieceId: q.id, edgeName: eb.name },
    type: 'standard', tension: 100, strength: 1,
    active: true, taped: false, tapeWidth: 10,
  } as Seam;
}

const estado = (pieces: PatternPiece[]) => () => ({ project: { pieces } }) as never;

describe('el hilo del BOM se calcula sobre el largo que el borde declara', () => {
  it('borde por borde, incluido el de cierre', () => {
    const p = rect('p1', 'Delantero', 0, 0, 200, 150);
    const q = rect('p2', 'Espalda', 400, 0, 200, 150);
    // `seamLengthMM` mide SIEMPRE por el lado A, así que el lado B no entra en
    // el número; se pone una pieza real para no inventar una costura huérfana.
    const parejaB = bordeDeCierre(q);

    const medidos = (p.edges ?? []).map((e) => {
      const [hilo] = extractThread([costura(p, e, q, parejaB)], [p, q]);
      return { borde: e.name, declara: e.length ?? 0, hilo: hilo?.quantity ?? 0 };
    });

    const rotos = medidos.filter((m) => Math.abs(m.hilo - (m.declara * 2.5) / 1000) > 1e-3);
    expect(
      rotos,
      'el hilo de estos bordes no sale del largo que el borde declara (el de cierre sale 0)',
    ).toEqual([]);
  });
});

describe('los avíos por metro se cobran sobre el largo que el borde declara', () => {
  it('borde por borde, incluido el de cierre', () => {
    const p = rect('p1', 'Delantero', 0, 0, 200, 150);

    const medidos = (p.edges ?? []).map((e) => {
      const trim: Trim = {
        id: 't1', pieceId: p.id, type: 'zipper', name: 'Cremallera', description: '',
        placement: { mode: 'edge', edgeName: e.name, tStart: 0, tEnd: 1 },
        material: 'metal', color: '#333', size: 5, unitCost: 1, active: true,
      };
      const [entrada] = extractTrims([trim], [p]);
      return { borde: e.name, declara: e.length ?? 0, metros: entrada?.quantity ?? 0 };
    });

    const rotos = medidos.filter((m) => Math.abs(m.metros - m.declara / 1000) > 0.005);
    expect(rotos, 'estos avíos se cobran por un largo que no es el del borde').toEqual([]);
  });
});

describe('las dos meta-tools con las que el copiloto mide', () => {
  it('measureAlongCurve devuelve el largo que el borde declara', async () => {
    const p = rect('p1', 'Delantero', 0, 0, 200, 150);
    for (const e of p.edges ?? []) {
      const r = await measureAlongCurveTool.execute(
        { pieceId: p.id, edgeName: e.name }, estado([p]),
      );
      expect(r.success, `measureAlongCurve falló sobre ${e.name}`).toBe(true);
      expect(
        (r.data as { length: number }).length,
        `el copiloto le dice a María que ${e.name} mide otra cosa de la que declara`,
      ).toBeCloseTo(e.length ?? 0, 1);
    }
  });

  it('measureAlongCurve devuelve puntos sobre el borde de cierre, no una lista vacía', async () => {
    const p = rect('p1', 'Delantero', 0, 0, 200, 150);
    const cierre = bordeDeCierre(p);
    const r = await measureAlongCurveTool.execute(
      { pieceId: p.id, edgeName: cierre.name, markerInterval: 50 }, estado([p]),
    );
    expect((r.data as { samplePoints: unknown[] }).samplePoints.length).toBeGreaterThan(0);
  });

  it('compareCurves no ve diferencia entre el borde de cierre y el de enfrente, que miden igual', async () => {
    const p = rect('p1', 'Delantero', 0, 0, 200, 150);
    const cierre = bordeDeCierre(p);
    const enfrente = (p.edges ?? []).find((e) => e.name !== cierre.name && e.length === cierre.length);
    expect(enfrente, 'el rectángulo no tiene dos lados del mismo largo: fixture rota').toBeDefined();

    const r = await compareCurvesMetaTool.execute(
      { pieceIdA: p.id, edgeNameA: cierre.name, pieceIdB: p.id, edgeNameB: enfrente!.name },
      estado([p]),
    );
    const d = r.data as { lengthA: number; delta: number };
    expect(d.lengthA, 'el borde de cierre entra en la comparación midiendo cero').toBeCloseTo(150, 1);
    expect(d.delta, 'el copiloto reporta una holgura que no existe').toBeCloseTo(0, 1);
  });
});

describe('el espejo de piquetes cruza el borde de cierre', () => {
  it('un piquete en el medio del borde de cierre llega a la pieza pareja', () => {
    const p = rect('p1', 'Delantero', 0, 0, 200, 150);
    const q = rect('p2', 'Espalda', 400, 0, 200, 150);
    const ea = bordeDeCierre(p);
    const eb = bordeDeCierre(q);
    const medio = interpolateEdgePoint(p, ea.name, 0.5);
    expect(medio, 'el fixture no da punto medio del borde de cierre').not.toBeNull();

    const r = mapNotchAcrossSeam({
      sourcePiece: p, point: medio!.point, seams: [costura(p, ea, q, eb)], pieces: [p, q],
      sourceEdge: ea,
    });

    expect(
      r.ok,
      `el piquete no cruzó: ${r.ok ? '' : r.message} (hoy el borde de cierre "mide cero" y se declara degenerado)`,
    ).toBe(true);
    if (!r.ok) return;
    expect(r.frac, 'el piquete del medio no cayó en el medio').toBeCloseTo(0.5, 1);
    const esperado = interpolateEdgePoint(q, eb.name, 0.5)!.point;
    expect(r.point.x).toBeCloseTo(esperado.x, 0);
    expect(r.point.y).toBeCloseTo(esperado.y, 0);
  });
});

describe('caminar la costura sobre el borde de cierre', () => {
  it('el cursor al final del borde lleva recorrido el borde entero', () => {
    const p = rect('p1', 'Delantero', 0, 0, 200, 150);
    const cierre = bordeDeCierre(p);
    const fin = interpolateEdgePoint(p, cierre.name, 1);
    expect(fin, 'el fixture no da el final del borde de cierre').not.toBeNull();

    expect(
      walkDistanceAt(pieceLocalToPattern(fin!.point, p), p, cierre),
      'caminar el borde de cierre se queda en 0: la costura no avanza',
    ).toBeCloseTo(cierre.length ?? 0, 0);
  });
});
