// @vitest-environment jsdom
/**
 * #1092, ronda 2 — los hermanos que encontró el review adversarial sobre la
 * ronda 1 (codex + Serrano/Halberg/Vex, 5 HIGH sin BLOCKER).
 *
 * Curvar el borde de cierre INSERTA una `C` que termina exactamente en el
 * ancla del `M`. Eso es deliberado (así el grupo de anclas coincidentes mueve
 * las dos), pero abre tres agujeros que no existían:
 *
 * 1. El contorno pasa a tener más comandos que puntos. Los guardas del
 *    borrado contaban comandos (`type !== 'Z'`), así que dejaban borrar hasta
 *    quedarse con dos vértices geométricos — y el mallador devuelve nada.
 * 2. Mover un ancla `M`/`L` nunca arrastró el manejador entrante del `C`
 *    siguiente (la rama `C` sí lo hace). Antes casi no se alcanzaba; ahora el
 *    grupo coincidente del cierre pasa por ahí en cada arrastre.
 * 3. `convertToCurve` y `convertSegmentToSpline` resolvían el destino con
 *    `cmds[0]` — el PRIMER `M` del contorno. Con varios subpaths (el
 *    importador DXF acumula entidades: `converter.ts` hace
 *    `outline.push(...path)`) un `Z` intermedio cerraba contra el subpath
 *    equivocado, cruzando la pieza por el medio.
 */
import { describe, it, expect } from 'vitest';
import {
  convertToCurve, applyNodeMove, deletePoint, coincidentAnchorGroups,
} from '../nodeEditorUtils';
import { convertSegmentToSpline } from '../splineSegment';
import type { PathCommand } from '../../../types/types';

/** Triángulo real: tres anclas y el cierre. */
const TRI: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [50, 80] },
  { type: 'Z', values: [] },
];

/** Dos subpaths en un mismo contorno, como los que acumula el importador DXF. */
const DOS_SUBPATHS: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'Z', values: [] },
  { type: 'M', values: [500, 500] },
  { type: 'L', values: [600, 500] },
  { type: 'L', values: [600, 600] },
  { type: 'Z', values: [] },
];

/** Puntos distintos del contorno, que es lo que la usuaria ve como vértices. */
const puntosUnicos = (cmds: PathCommand[]) => coincidentAnchorGroups(cmds).size;

describe('#1092 ronda 2 — el contorno tiene más comandos que puntos', () => {
  it('curvar el cierre de un triángulo deja 4 comandos pero 3 puntos', () => {
    const curvado = convertToCurve(TRI, 3);
    expect(curvado.filter(c => c.type !== 'Z')).toHaveLength(4);
    expect(puntosUnicos(curvado), 'siguen siendo tres vértices').toBe(3);
  });

  it('borrar un vértice del triángulo curvado se niega: dejaría dos puntos', () => {
    // El guard contaba comandos (4 - 1 = 3, "suficiente") y dejaba pasar el
    // borrado; quedaban A, C y otra vez A — dos puntos, y el mallador vacío.
    const curvado = convertToCurve(TRI, 3);
    expect(() => deletePoint(curvado, 1)).toThrow(/al menos 3|at least 3/i);
  });

  it('en un contorno sin anclas coincidentes el borrado sigue igual que siempre', () => {
    const cuadrado: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    const out = deletePoint(cuadrado, 1);
    expect(out.filter(c => c.type !== 'Z')).toHaveLength(3);
    expect(() => deletePoint(TRI, 1)).toThrow();
  });
});

describe('#1092 ronda 2 — arrastrar un ancla lleva sus manejadores', () => {
  it('mover un ancla M arrastra el manejador entrante del C siguiente', () => {
    // `M C …`: el cp1 del C es el manejador SALIENTE del M. La rama C ya lo
    // hacía con su vecino; la rama M/L no, y el cierre curvado pasa por ahí.
    const conCurvaInicial: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, 30, 90, 30, 100, 0] },
      { type: 'L', values: [50, 80] },
      { type: 'Z', values: [] },
    ];
    const movido = applyNodeMove(conCurvaInicial, 0, 'anchor', { x: -20, y: -10 });
    expect(movido[0].values).toEqual([-20, -10]);
    expect(movido[1].values.slice(0, 2), 'el cp1 del C sigue al ancla').toEqual([-10, 20]);
    expect(movido[1].values.slice(2), 'lo demás del C no se toca').toEqual([90, 30, 100, 0]);
  });

  it('el cierre curvado se traslada entero: sus dos anclas y los dos manejadores', () => {
    const curvado = convertToCurve(TRI, 3);      // M L L C Z, la C termina en el M
    const movido = applyNodeMove(curvado, 0, 'anchor', { x: -30, y: -40 });
    expect(movido[0].values).toEqual([-30, -40]);
    expect(movido[3].values.slice(4), 'la C sigue cerrando en el mismo punto').toEqual([-30, -40]);
    // El cp2 de la C (su manejador entrante) se traslada con el ancla.
    const antes = curvado[3].values;
    expect(movido[3].values[2]).toBeCloseTo(antes[2] - 30, 9);
    expect(movido[3].values[3]).toBeCloseTo(antes[3] - 40, 9);
  });

  it('y una Q igual: los cuatro tipos de ancla llevan el manejador del C vecino', () => {
    // La asimetría entre ramas es justo lo que originó este bug; que quede
    // una sola fuera sería sembrar el siguiente.
    const conQ: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'Q', values: [50, -20, 100, 0] },
      { type: 'C', values: [110, 20, 90, 60, 50, 80] },
      { type: 'Z', values: [] },
    ];
    const movido = applyNodeMove(conQ, 1, 'anchor', { x: 120, y: 10 });
    expect(movido[1].values.slice(2)).toEqual([120, 10]);
    expect(movido[2].values.slice(0, 2)).toEqual([130, 30]);
  });

  it('mover un ancla L con un C detrás también arrastra su manejador', () => {
    const mixto: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'C', values: [110, 20, 90, 60, 50, 80] },
      { type: 'Z', values: [] },
    ];
    const movido = applyNodeMove(mixto, 1, 'anchor', { x: 120, y: 10 });
    expect(movido[1].values).toEqual([120, 10]);
    expect(movido[2].values.slice(0, 2)).toEqual([130, 30]);
  });
});

describe('#1092 ronda 2 — cada Z cierra contra el M de SU subpath', () => {
  it('curvar el cierre del segundo subpath no cruza la pieza hasta el primer M', () => {
    const out = convertToCurve(DOS_SUBPATHS, 7);
    expect(out.map(c => c.type)).toEqual(['M', 'L', 'L', 'Z', 'M', 'L', 'L', 'C', 'Z']);
    // Termina en (500,500) — el M de SU subpath — no en (0,0).
    expect(out[7].values.slice(4)).toEqual([500, 500]);
  });

  it('curvar el cierre del primer subpath sigue funcionando', () => {
    const out = convertToCurve(DOS_SUBPATHS, 3);
    expect(out.map(c => c.type)).toEqual(['M', 'L', 'L', 'C', 'Z', 'M', 'L', 'L', 'Z']);
    expect(out[3].values.slice(4)).toEqual([0, 0]);
  });

  it('la curva por puntos respeta el mismo dueño', () => {
    const out = convertSegmentToSpline(DOS_SUBPATHS, 7, 4);
    const ultimaC = out[out.length - 2];
    expect(ultimaC.type).toBe('C');
    expect(ultimaC.values.slice(4)).toEqual([500, 500]);
    expect(out[out.length - 1].type).toBe('Z');
  });
});
