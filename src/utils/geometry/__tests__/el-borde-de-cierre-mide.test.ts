import { describe, it, expect } from 'vitest';
import { detectSemanticEdges, rangoMedibleDeBorde } from '../../semanticEdges';
import { computePathArcLength, pointAtPathDistance } from '../arcLength';
import { interpolateEdgePoint, computeEdgeLengthMM } from '../edgeInterpolation';
import { findClosestEdgePoint } from '../../../components/PatternEditor/useTrimTool';
import { pieceLocalToPattern } from '../pieceSpace';
import type { PathCommand, PatternPiece } from '../../../types/types';

/**
 * El borde de cierre de toda pieza mide cero, y el borde que se clica no es el
 * que se guarda.
 *
 * Los dos salieron de ir a abrir la puerta de las siete herramientas sin botón
 * (informe § 12.4). Antes de ponerle botón a «Medir el borde» y a «Poner avío»
 * había que saber si el cuarto estaba vacío, y no lo estaba: estaba peor.
 * Medido en Chrome el 2026-09-05 sobre un rectángulo de 200×150 hecho con la
 * herramienta Rectángulo:
 *
 *   - `measureCurve` sobre un borde devolvía «0.0 mm».
 *   - `trimPlace`: clic ARRIBA guardó `leftEdge`; DERECHA guardó `topEdge`;
 *     ABAJO guardó `rightEdge`; IZQUIERDA guardó `bottomEdge`. Corrido un
 *     borde, las cuatro veces.
 *
 * Son DOS defectos con una raíz común: `segmentRange` está en espacio de
 * COMANDOS (contrato del productor, `outlineAnalysis.ts:15`) y hay dos
 * lectores que no lo respetan.
 *
 * 1. `parseSegments` (arcLength.ts) hace `case 'Z': break` — nunca emite el
 *    tramo de cierre. El productor ya lo tenía escrito como limitación
 *    conocida: «A Z-closure segment carries cmd 0 (the M tag, Fase 3 lore) —
 *    unaddressable as a draw command» (outlineAnalysis.ts:249-252). El tramo
 *    de cierre acaba con `cmdRange [0,1]`, que apunta a la `M` y mide cero. En
 *    un rectángulo eso es el lado IZQUIERDO. La consecuencia ya estaba
 *    parcheada sin nombrarla en `LineLengthLabels.tsx:36`
 *    (`edge.length ?? computePathArcLength(...)`): alguien chocó y tapó.
 *
 * 2. `interpolateEdgePoint` lee ese mismo `segmentRange` como índices sobre
 *    `flattenPath`, que es espacio de PUNTOS. En un rectángulo eso corre un
 *    borde; en una pieza importada, donde un borde son 14-20 comandos y
 *    `flattenPath` además densifica las curvas, no corre: descuadra del todo.
 *
 * El oráculo de este archivo no necesita saber el convenio, y por eso no se
 * puede congelar mal como se congeló el anterior: cada borde YA declara su
 * propio `length`, que el productor calculó recorriendo el tramo. Si el rango
 * que guarda no reproduce el largo que declara, el objeto se contradice a sí
 * mismo. Eso es lo que se afirma.
 */

const cmds = (...c: Array<[string, number[]]>): PathCommand[] =>
  c.map(([type, values]) => ({ type, values })) as PathCommand[];

/** Rectángulo como el que deja la herramienta Rectángulo: M L L L Z. */
function rect(x: number, y: number, w: number, h: number): PatternPiece {
  return {
    id: 'p1', name: 'Delantero',
    outline: cmds(['M', [x, y]], ['L', [x + w, y]], ['L', [x + w, y + h]], ['L', [x, y + h]], ['Z', []]),
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, active: true,
  } as unknown as PatternPiece;
}

/** Con un lado curvo: el mismo contrato tiene que aguantar una `C`. */
function rectConCurva(): PatternPiece {
  return {
    id: 'p2', name: 'Con curva',
    outline: cmds(
      ['M', [0, 0]], ['L', [200, 0]],
      ['C', [240, 50, 240, 100, 200, 150]],
      ['L', [0, 150]], ['Z', []],
    ),
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, active: true,
  } as unknown as PatternPiece;
}

const conBordes = (p: PatternPiece): PatternPiece =>
  ({ ...p, edges: detectSemanticEdges(p) }) as PatternPiece;

describe('el rango que guarda un borde reproduce el largo que declara', () => {
  it('las cuatro caras de un rectángulo, una por una', () => {
    const p = conBordes(rect(100, 120, 200, 150));
    const rotos = (p.edges ?? []).map((e) => ({
      nombre: e.name,
      declara: e.length,
      mide: Math.round(computePathArcLength(p.outline, ...rangoMedibleDeBorde(p.outline, e.segmentRange)) * 100) / 100,
    })).filter((r) => Math.abs((r.declara ?? 0) - r.mide) > 0.5);

    expect(
      rotos,
      'estos bordes declaran un largo que su propio rango no reproduce (el de cierre mide 0)',
    ).toEqual([]);
  });

  it('y también con un lado curvo', () => {
    const p = conBordes(rectConCurva());
    for (const e of p.edges ?? []) {
      expect(
        computePathArcLength(p.outline, ...rangoMedibleDeBorde(p.outline, e.segmentRange)),
        `${e.name} declara ${e.length} y su rango medible mide otra cosa`,
      ).toBeCloseTo(e.length ?? 0, 0);
    }
  });

  it('red contra el arreglo perezoso: cuatro bordes y dos largos distintos', () => {
    // Sin esto, un productor que dejara de emitir el tramo de cierre —o que
    // pusiera `length: 0` en todos— haría pasar el test de arriba en vacío.
    const p = conBordes(rect(100, 120, 200, 150));
    expect(p.edges).toHaveLength(4);
    expect(
      new Set((p.edges ?? []).map((e) => e.length)),
      'los cuatro largos son 200 y 150',
    ).toEqual(new Set([200, 150]));
  });

  it('el contorno entero mide el perímetro, no el perímetro menos un lado', () => {
    const p = rect(100, 120, 200, 150);
    expect(
      computePathArcLength(p.outline),
      'sin el tramo de cierre da 550 en vez de 700, y ese es el largo que Medir enseña del contorno',
    ).toBeCloseTo(700, 1);
  });

  it('se puede pedir un punto sobre el tramo de cierre', () => {
    const p = conBordes(rect(100, 120, 200, 150));
    // El de cierre es el que llega hasta el final del contorno, o sea el que
    // incluye la `Z`. (Antes del arreglo arrancaba en el comando 0 —la `M`—,
    // que es exactamente lo que lo hacía medir cero.)
    const cierre = (p.edges ?? []).find(
      (e) => e.segmentRange[1] === e.segmentRange[0] + 1 && p.outline[e.segmentRange[0]].type === 'M',
    );
    expect(cierre, 'ningún borde apunta a la M: cambió la forma del productor').toBeDefined();
    const medio = pointAtPathDistance(
      p.outline, (cierre!.length ?? 0) / 2, ...rangoMedibleDeBorde(p.outline, cierre!.segmentRange),
    );
    expect(medio, 'el tramo de cierre no devuelve ningún punto').not.toBeNull();
    expect(medio!.x).toBeCloseTo(100, 0);
    expect(medio!.y).toBeCloseTo(195, 0);
  });
});

describe('el borde que se nombra es el borde que se dibuja', () => {
  /**
   * El oráculo NO se ata a los nombres: `detectSemanticEdges` los elige por
   * anatomía y por el nombre de la pieza, así que un rectángulo llamado
   * «Delantero» saca `centerFront` donde uno llamado «T» saca `leftEdge`.
   * Atar el test a esa tabla sería fijar el clasificador, que no es lo que
   * está roto. Lo que se afirma es geometría: los cuatro puntos medios que
   * salen de los cuatro bordes son los cuatro puntos medios de las caras.
   */
  const MEDIOS_DE_LAS_CARAS = [
    { x: 200, y: 120 }, { x: 300, y: 195 }, { x: 200, y: 270 }, { x: 100, y: 195 },
  ];
  const clave = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`;

  it('los cuatro medios que devuelve son los cuatro medios de las caras', () => {
    const p = conBordes(rect(100, 120, 200, 150));
    const salen = (p.edges ?? [])
      .map((e) => interpolateEdgePoint(p, e.name, 0.5))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((r) => clave(r.point));

    expect(salen, 'algún borde no devolvió punto').toHaveLength(4);
    expect(new Set(salen)).toEqual(new Set(MEDIOS_DE_LAS_CARAS.map(clave)));
  });

  it('computeEdgeLengthMM devuelve el largo que el borde declara', () => {
    const p = conBordes(rect(100, 120, 200, 150));
    for (const e of p.edges ?? []) {
      expect(computeEdgeLengthMM(p, e.name), `${e.name} declara ${e.length}`)
        .toBeCloseTo(e.length ?? 0, 1);
    }
  });

  it('el clic sobre una cara devuelve ESE borde y su t (el bug de Poner avío)', () => {
    // Ida y vuelta: el punto medio de un borde, devuelto al buscador, tiene
    // que reconocerse a sí mismo. Hoy no: clic arriba guarda el borde de al
    // lado. Es name-agnostic a propósito — lo que falla es el corrimiento.
    const p = conBordes(rect(100, 120, 200, 150));
    for (const e of p.edges ?? []) {
      const medio = interpolateEdgePoint(p, e.name, 0.5);
      expect(medio, `${e.name} no devolvió punto`).not.toBeNull();
      const hit = findClosestEdgePoint(medio!.point, [p], 1);
      expect(hit, `el medio de ${e.name} no enganchó nada`).not.toBeNull();
      expect(hit!.edgeName, `el medio de ${e.name} enganchó otro borde`).toBe(e.name);
      expect(hit!.t, `el medio de ${e.name} debería dar t cerca de 0.5`).toBeCloseTo(0.5, 1);
    }
  });

  it('y el clic en el medio de cada CARA engancha un borde de ese mismo largo', () => {
    // El caso de María, sin pasar por interpolateEdgePoint: ella clica una
    // cara de la pantalla. El borde que se guarde tiene que ser uno cuyo
    // largo declarado sea el de esa cara (200 arriba y abajo, 150 a los lados).
    const p = conBordes(rect(100, 120, 200, 150));
    const esperado = [200, 150, 200, 150];
    MEDIOS_DE_LAS_CARAS.forEach((punto, i) => {
      const hit = findClosestEdgePoint(punto, [p], 1);
      expect(hit, `clic en ${clave(punto)} no enganchó`).not.toBeNull();
      const borde = (p.edges ?? []).find((e) => e.name === hit!.edgeName);
      expect(borde?.length, `clic en ${clave(punto)} guardó "${hit!.edgeName}", que mide otra cosa`)
        .toBeCloseTo(esperado[i], 1);
    });
  });

  it('y con la pieza girada, que es donde el corrimiento pasa desapercibido (#1068)', () => {
    // `interpolateEdgePoint` devuelve LOCAL; `findClosestEdgePoint` busca en
    // PATRÓN. Con la pieza girada las dos dejan de coincidir, y ese fue el
    // defecto de #1068. Se afirma la ida y vuelta: el medio de cada borde,
    // llevado a patrón, tiene que engancharse a sí mismo.
    const girada = conBordes({ ...rect(100, 120, 200, 150), rotation: 90 } as PatternPiece);
    for (const e of girada.edges ?? []) {
      const local = interpolateEdgePoint(girada, e.name, 0.5);
      expect(local, `${e.name} no devolvió punto`).not.toBeNull();
      const enPatron = pieceLocalToPattern(local!.point, girada);
      const hit = findClosestEdgePoint(enPatron, [girada], 1);
      expect(hit, `el medio de ${e.name} girado no enganchó nada`).not.toBeNull();
      expect(hit!.edgeName, `girada, el medio de ${e.name} enganchó otro borde`).toBe(e.name);
    }
  });
});
